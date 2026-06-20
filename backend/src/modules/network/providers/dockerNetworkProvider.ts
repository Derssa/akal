import { NetworkProvider } from './networkProvider';
import { VirtualEndpoint } from '../mapper/virtualNetworkMapper';
import { NetworkIntent } from '../planner/enforcementPlanner';
import docker from '../../../infrastructure/docker/DockerClient';

export class DockerNetworkProvider implements NetworkProvider {
  private async runExec(containerId: string, cmd: string[]): Promise<string> {
    try {
      const container = docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        User: 'root'
      });
      const stream = await exec.start({});
      const output = await new Promise<string>((resolve, reject) => {
        let data = '';
        container.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => { data += chunk.toString(); }
          },
          {
            write: (chunk: Buffer) => { data += chunk.toString(); }
          }
        );
        stream.on('end', () => resolve(data.trim()));
        stream.on('error', (err) => reject(err));
      });

      const status = await exec.inspect();
      if (status.ExitCode !== 0) {
        throw new Error(`Command failed inside container with exit code ${status.ExitCode}. Output: ${output}`);
      }
      return output;
    } catch (err: any) {
      if (err.statusCode === 404 || err.message?.includes('no such container') || err.message?.includes('No such container')) {
        console.warn(`[DockerNetworkProvider] Container ${containerId.slice(0, 12)} not found during exec [${cmd.join(' ')}]. Skipping.`);
        return '';
      }
      if (cmd[0] === 'ip' && cmd[1] === 'route' && cmd[2] === 'del' && err.message?.includes('No such process')) {
        return '';
      }
      console.error(`Exec failed for cmd [${cmd.join(' ')}]:`, err);
      throw err;
    }
  }

  private findNatRoute(subnet: any, endpoints: VirtualEndpoint[], config: any, dockerContainers: any[], projectId: string) {
    if (!subnet || !subnet.routes) return null;
    return subnet.routes.find((r: any) => {
      if (r.destination !== '0.0.0.0/0') return false;
      const targetLower = r.target.toLowerCase();
      if (targetLower.startsWith('nat')) return true;
      
      // Check if target matches the IP address or name of a NAT node
      const matchedNatEp = endpoints.find(e => {
        const containerInfo = dockerContainers.find(c => c.Id === e.nodeId);
        const isNat = containerInfo?.Labels?.['akal.node.type'] === 'nat';
        if (!isNat) return false;
        
        const epIp = config.nodeIpMap?.[e.nodeId];
        const cleanName = e.containerName.replace(`akal-lab-${projectId}-`, '');
        return r.target === epIp || targetLower === cleanName.toLowerCase();
      });
      return !!matchedNatEp;
    });
  }

  private findNatEndpoint(natRoute: any, endpoints: VirtualEndpoint[], config: any, projectId: string): VirtualEndpoint | undefined {
    if (!natRoute) return undefined;
    let natEp = endpoints.find(e => {
      const cleanName = e.containerName.replace(`akal-lab-${projectId}-`, '');
      return e.containerName === natRoute.target || 
             cleanName.toLowerCase() === natRoute.target.toLowerCase() ||
             e.containerName === `akal-lab-${projectId}-${natRoute.target}`;
    });
    
    if (!natEp && config.nodeIpMap) {
      const matchedNodeId = Object.keys(config.nodeIpMap).find(nodeId => config.nodeIpMap[nodeId] === natRoute.target);
      if (matchedNodeId) {
        natEp = endpoints.find(e => e.nodeId === matchedNodeId);
      }
    }
    return natEp;
  }

  public async applyPlan(projectId: string, endpoints: VirtualEndpoint[], intents: NetworkIntent[], config: any): Promise<void> {
    console.log(`[DockerNetworkProvider] Applying network plan for project: ${projectId}`);


    const dockerContainers = await docker.listContainers({ all: true });
    const ipMap: Record<string, string> = {};
    const idMap: Record<string, string> = {};
    const assignedIps = new Set<string>();

    // Resolve correct container names in endpoints using the real container names from Docker
    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c => c.Id === ep.nodeId || c.Id.startsWith(ep.nodeId));
      if (containerInfo && containerInfo.Names && containerInfo.Names.length > 0) {
        ep.containerName = containerInfo.Names[0].replace(/^\//, '');
      }
    }

    // 1. Obsolete Docker Subnet Network Cleanup
    const allNetworks = await docker.listNetworks();
    const sharedNet = allNetworks.find(n => n.Name === 'akal-lab-network');
    let sharedNetGateway = '';
    if (sharedNet) {
      try {
        const netInspect = await docker.getNetwork(sharedNet.Id).inspect();
        sharedNetGateway = netInspect.IPAM?.Config?.[0]?.Gateway || '';
        console.log(`[DockerNetworkProvider] Found akal-lab-network gateway: ${sharedNetGateway}`);
      } catch (err) {
        console.error('[DockerNetworkProvider] Failed to inspect akal-lab-network:', err);
      }
    }
    const activeSubnetIds = (config.subnets || []).map((s: any) => s.id);
    
    for (const net of allNetworks) {
      if (net.Name.startsWith(`akal-subnet-${projectId}-`)) {
        const subnetId = net.Name.replace(`akal-subnet-${projectId}-`, '');
        if (!activeSubnetIds.includes(subnetId)) {
          console.log(`[DockerNetworkProvider] Removing obsolete subnet network: ${net.Name}`);
          try {
            const network = docker.getNetwork(net.Id);
            const netInspect = await network.inspect();
            const connectedContainers = Object.keys(netInspect.Containers || {});
            for (const cId of connectedContainers) {
              await network.disconnect({ Container: cId, Force: true });
            }
            await network.remove();
          } catch (err) {
            console.error(`Failed to remove obsolete network ${net.Name}:`, err);
          }
        }
      }
    }

    // 2. Ensure networks for active subnets exist
    const resolvedCidrs: Record<string, string> = {};
    for (const subnet of config.subnets || []) {
      const cidr = subnet.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
      const netName = `akal-subnet-${projectId}-${subnet.id}`;
      try {
        const activeCidr = await this.ensureNetwork(netName, cidr, allNetworks);
        resolvedCidrs[subnet.id] = activeCidr;
      } catch (err) {
        console.error(`Failed to ensure network ${netName}:`, err);
      }
    }

    // 3. Connect containers to their target subnet networks (or akal-lab-network) and assign static IPs
    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c => 
        c.Id === ep.nodeId ||
        c.Id.startsWith(ep.nodeId) ||
        c.Names.some(name => name.replace(/^\//, '') === ep.containerName)
      );
      if (!containerInfo || containerInfo.State !== 'running') continue;

      const container = docker.getContainer(containerInfo.Id);
      const inspect = await container.inspect();
      const currentNetworks = Object.keys(inspect.NetworkSettings.Networks || {});

      const subnetId = config.nodeSubnetMap[ep.nodeId];
      if (subnetId) {
        const subnet = config.subnets.find((s: any) => s.id === subnetId);
        if (subnet) {
          const cidr = resolvedCidrs[subnetId] || subnet.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
          const prefixMatch = cidr.match(/^(\d+\.\d+\.\d+)\./);
          const prefix = prefixMatch ? prefixMatch[1] + '.' : '';

          const targetNetwork = `akal-subnet-${projectId}-${subnetId}`;
          let targetIp = '';
          if (prefix) {
            const configIp = config.nodeIpMap?.[ep.nodeId];
            if (configIp && configIp.startsWith(prefix)) {
              targetIp = configIp;
            } else if (configIp) {
              const suffixMatch = configIp.match(/\.(\d+)$/);
              const suffix = suffixMatch ? suffixMatch[1] : '2';
              targetIp = `${prefix}${suffix}`;
            } else {
              // Find all currently used IPs on this subnet
              const usedIps = new Set<string>();
              for (const cInfo of dockerContainers) {
                const nets = cInfo.NetworkSettings?.Networks;
                if (nets && nets[targetNetwork] && nets[targetNetwork].IPAddress) {
                  usedIps.add(nets[targetNetwork].IPAddress);
                }
              }
              for (const otherEp of endpoints) {
                if (otherEp.nodeId !== ep.nodeId && config.nodeSubnetMap[otherEp.nodeId] === subnetId) {
                  const otherIp = config.nodeIpMap?.[otherEp.nodeId];
                  if (otherIp && otherIp.startsWith(prefix)) {
                    usedIps.add(otherIp);
                  }
                }
              }
              for (const ip of assignedIps) {
                usedIps.add(ip);
              }
              let suffix = 2;
              while (usedIps.has(`${prefix}${suffix}`)) {
                suffix++;
              }
              targetIp = `${prefix}${suffix}`;
              assignedIps.add(targetIp);
            }
          }
          const nodeType = containerInfo.Labels?.['akal.node.type'] || 'ubuntu';

          for (const netName of currentNetworks) {
            if (netName !== targetNetwork && (netName.startsWith('akal-subnet-') || netName === 'akal-lab-network')) {
              if (netName === 'akal-lab-network') {
                const isLoadBalancer = nodeType === 'loadbalancer';
                const isPublicUbuntu = nodeType === 'ubuntu' && subnet.type === 'public';
                if (isLoadBalancer || isPublicUbuntu) {
                  continue; // Keep connected to default bridge network for port mappings
                }
              }

              if (nodeType === 'nat') {
                const matchedSubnet = (config.subnets || []).find((s: any) => `akal-subnet-${projectId}-${s.id}` === netName);
                if (matchedSubnet) {
                  const natRoute = this.findNatRoute(matchedSubnet, endpoints, config, dockerContainers, projectId);
                  if (natRoute) {
                    const natEp = this.findNatEndpoint(natRoute, endpoints, config, projectId);
                    if (natEp && natEp.nodeId === ep.nodeId) {
                      // Do NOT disconnect NAT Gateway from the private subnet networks it is routing traffic for
                      continue;
                    }
                  }
                }
              }

              console.log(`[DockerNetworkProvider] Disconnecting container ${ep.containerName} from ${netName}...`);
              try {
                await docker.getNetwork(netName).disconnect({ Container: containerInfo.Id, Force: true });
              } catch {
                // Ignore disconnect error if network is not connected
              }
            }
          }

          const isConnected = currentNetworks.includes(targetNetwork);
          const currentIp = inspect.NetworkSettings.Networks[targetNetwork]?.IPAddress;

          // If the container is already connected and has a valid subnet IP, skip reconnecting
          const hasValidSubnetIp = isConnected && currentIp && prefix && currentIp.startsWith(prefix);

          if (!hasValidSubnetIp && (!isConnected || currentIp !== targetIp)) {
            if (isConnected) {
              console.log(`[DockerNetworkProvider] Reconnecting container ${ep.containerName} to ${targetNetwork} due to IP mismatch...`);
              try {
                await docker.getNetwork(targetNetwork).disconnect({ Container: containerInfo.Id, Force: true });
              } catch {
                // Ignore disconnect error if network is not connected
              }
            }
            console.log(`[DockerNetworkProvider] Connecting container ${ep.containerName} to ${targetNetwork} with static IP ${targetIp}...`);
            const containerNodeName = containerInfo.Names[0].replace(/^\//, '').replace(`akal-lab-${projectId}-`, '');
            try {
              await docker.getNetwork(targetNetwork).connect({
                Container: containerInfo.Id,
                EndpointConfig: {
                  IPAMConfig: {
                    IPv4Address: targetIp
                  },
                  Aliases: [containerNodeName]
                }
              });
            } catch (err) {
              console.error(`Failed to connect container ${ep.containerName} to network ${targetNetwork} with IP ${targetIp}:`, err);
            }
          }

          // Reconnect to default akal-lab-network if node is public (loadbalancer or public ubuntu) and disconnected
          const isLoadBalancer = nodeType === 'loadbalancer';
          const isPublicUbuntu = nodeType === 'ubuntu' && subnet.type === 'public';
          if ((isLoadBalancer || isPublicUbuntu) && !currentNetworks.includes('akal-lab-network')) {
            console.log(`[DockerNetworkProvider] Reconnecting public container ${ep.containerName} to default network akal-lab-network...`);
            try {
              await docker.getNetwork('akal-lab-network').connect({ Container: containerInfo.Id });
            } catch (err) {
              console.error(`Failed to reconnect public container ${ep.containerName} to default network:`, err);
            }
          }
        }
      } else {
        const targetNetwork = 'akal-lab-network';
        for (const netName of currentNetworks) {
          if (netName !== targetNetwork && netName.startsWith('akal-subnet-')) {
            console.log(`[DockerNetworkProvider] Disconnecting container ${ep.containerName} from subnet network ${netName}...`);
            try {
              await docker.getNetwork(netName).disconnect({ Container: containerInfo.Id, Force: true });
            } catch {
              // Ignore disconnect error if network is not connected
            }
          }
        }

        if (!currentNetworks.includes(targetNetwork)) {
          console.log(`[DockerNetworkProvider] Reconnecting container ${ep.containerName} to default network ${targetNetwork}...`);
          try {
            await docker.getNetwork(targetNetwork).connect({ Container: containerInfo.Id });
          } catch {
            // Ignore connect error if network connection fails
          }
        }
      }
    }

    // Ensure Docker host-level forwarding and NAT bypass are applied dynamically to prevent Docker resets from wiping them
    // This is run after all container connections to override any Docker-inserted POSTROUTING rules.
    try {
      const temp = await docker.createContainer({
        Image: 'derssa/backend-lab-ubuntu:v1',
        HostConfig: {
          Privileged: true,
          NetworkMode: 'host',
          AutoRemove: true
        },
        Cmd: [
          'sh',
          '-c',
          'iptables -C FORWARD -j ACCEPT 2>/dev/null || iptables -I FORWARD -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -d 10.0.0.0/8 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 10.0.0.0/8 -d 10.0.0.0/8 -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 172.16.0.0/12 -d 172.16.0.0/12 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 172.16.0.0/12 -d 172.16.0.0/12 -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 192.168.0.0/16 -d 192.168.0.0/16 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 192.168.0.0/16 -d 192.168.0.0/16 -j ACCEPT'
        ]
      });
      await temp.start();
    } catch (err) {
      console.warn('[DockerNetworkProvider] Failed to apply host iptables forwarding/NAT bypass:', err);
    }

    // Connect NAT gateways to their private subnets
    for (const subnet of config.subnets || []) {
      const natRoute = this.findNatRoute(subnet, endpoints, config, dockerContainers, projectId);
      if (natRoute) {
        const natEp = this.findNatEndpoint(natRoute, endpoints, config, projectId);
        if (natEp) {
          const natContainerInfo = dockerContainers.find(c => 
            c.Id === natEp.nodeId ||
            c.Names.some(name => name.replace(/^\//, '') === natEp.containerName)
          );
          if (natContainerInfo && natContainerInfo.State === 'running') {
            const privateNetName = `akal-subnet-${projectId}-${subnet.id}`;
            const container = docker.getContainer(natContainerInfo.Id);
            const inspect = await container.inspect();
            const currentNets = Object.keys(inspect.NetworkSettings.Networks || {});
            
            const cidr = resolvedCidrs[subnet.id] || subnet.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
            const prefixMatch = cidr.match(/^(\d+\.\d+\.\d+)\./);
            const prefix = prefixMatch ? prefixMatch[1] + '.' : '';
            const targetIp = prefix ? `${prefix}254` : '';
            
            const isConnected = currentNets.includes(privateNetName);
            const currentIp = inspect.NetworkSettings.Networks[privateNetName]?.IPAddress;

            if (!isConnected || currentIp !== targetIp) {
              if (isConnected) {
                console.log(`[DockerNetworkProvider] Reconnecting NAT Gateway ${natEp.containerName} to private subnet network ${privateNetName} due to IP mismatch...`);
                try {
                  await docker.getNetwork(privateNetName).disconnect({ Container: natContainerInfo.Id, Force: true });
                } catch {
                  // Ignore disconnect error
                }
              }
              console.log(`[DockerNetworkProvider] Connecting NAT Gateway ${natEp.containerName} to private subnet network ${privateNetName} with IP ${targetIp}...`);
              try {
                // Temporarily clear default route to prevent Docker gateway programming conflicts ("failed to set gateway: file exists")
                await this.runExec(natContainerInfo.Id, ['ip', 'route', 'del', 'default']).catch(() => {});

                await docker.getNetwork(privateNetName).connect({
                  Container: natContainerInfo.Id,
                  EndpointConfig: {
                    IPAMConfig: {
                      IPv4Address: targetIp
                    }
                  }
                });
              } catch (err) {
                console.error(`Failed to connect NAT Gateway to network ${privateNetName}:`, err);
              }
            }
          }
        }
      }
    }

    // 4. Build IP map and ID map using updated network inspects
    const updatedDockerContainers = await docker.listContainers({ all: true });
    for (const ep of endpoints) {
      const containerInfo = updatedDockerContainers.find(c => 
        c.Id === ep.nodeId ||
        c.Id.startsWith(ep.nodeId) ||
        c.Names.some(name => name.replace(/^\//, '') === ep.containerName)
      );
      if (containerInfo && containerInfo.State === 'running') {
        const networks = containerInfo.NetworkSettings?.Networks || {};
        let key = Object.keys(networks).find(k => k.startsWith('akal-subnet-'));
        if (!key) {
          key = Object.keys(networks).find(k => k.startsWith('akal-'));
        }
        if (key && networks[key] && networks[key].IPAddress) {
          ipMap[ep.nodeId] = networks[key].IPAddress;
          idMap[ep.nodeId] = containerInfo.Id;
          console.log(`[DockerNetworkProvider] Resolved subnet node ${ep.nodeId} -> Container ${containerInfo.Id.slice(0, 12)} (${networks[key].IPAddress})`);
        }
      }
    }

    // Configure firewall for each active container in parallel to speed up scaling and deployments
    const isIgwEnabled = config.vpcConfig?.igwEnabled !== false;
    await Promise.all(endpoints.map(async ep => {
      const containerId = idMap[ep.nodeId];
      if (!containerId) return;

      const containerInfo = updatedDockerContainers.find(c => c.Id === containerId);
      if (!containerInfo) return;

      // Check if iptables is available inside this container
      const hasIptables = await this.runExec(containerId, ['sh', '-c', 'command -v iptables || true']);
      if (!hasIptables || hasIptables.includes('not found') || hasIptables.trim() === '') {
        console.warn(`[DockerNetworkProvider] Skipping firewall configuration for container ${containerId.slice(0, 12)} (${ep.containerName}): 'iptables' is not installed.`);
        return;
      }

      console.log(`[DockerNetworkProvider] Applying firewall rules inside container ${containerId.slice(0, 12)}...`);

      const nodeType = containerInfo.Labels?.['akal.node.type'] || 'ubuntu';
      if (nodeType === 'nat') {
        console.log(`[DockerNetworkProvider] Node ${ep.containerName} is a NAT Gateway. Configuring IP forwarding and masquerade...`);
        await this.runExec(containerId, ['sh', '-c', 'sysctl -w net.ipv4.ip_forward=1']);
        await this.runExec(containerId, ['sh', '-c', 'iptables -t nat -F POSTROUTING']);
        await this.runExec(containerId, ['sh', '-c', 'iptables -t nat -A POSTROUTING -j MASQUERADE']);
        await this.runExec(containerId, ['sh', '-c', 'iptables -F FORWARD 2>/dev/null || true']);
        if (isIgwEnabled) {
          const vpcCidr = config.vpcConfig?.cidr || '10.0.0.0/16';
          await this.runExec(containerId, ['sh', '-c', 'iptables -A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT']);
          await this.runExec(containerId, ['sh', '-c', `iptables -A FORWARD -s ${vpcCidr} -j ACCEPT`]);
          await this.runExec(containerId, ['sh', '-c', 'iptables -A FORWARD -j REJECT']);
        } else {
          await this.runExec(containerId, ['sh', '-c', 'iptables -A FORWARD -j REJECT']);
        }
      }

      if (nodeType === 'loadbalancer') {
        console.log(`[DockerNetworkProvider] Node ${ep.containerName} is a Load Balancer. Configuring Nginx dynamic proxy...`);
        
        // 1. Gather all active ASG instance IPs dynamically from running Docker containers
        const asgIps: Record<string, string[]> = {};
        for (const c of updatedDockerContainers) {
          const asgId = c.Labels?.['akal.asg.id'];
          if (asgId && c.State === 'running') {
            const networks = c.NetworkSettings?.Networks || {};
            const netKey = Object.keys(networks).find(k => k.startsWith('akal-subnet-'));
            if (netKey && networks[netKey]?.IPAddress) {
              if (!asgIps[asgId]) asgIps[asgId] = [];
                  asgIps[asgId].push(networks[netKey].IPAddress);
            }
          }
        }

        const targets = config.loadBalancerTargets?.[ep.nodeId] || [];
        const targetIps: string[] = [];
        for (const tId of targets) {
          const asgConfig = config.asgs?.[tId];
          const asgContainer = updatedDockerContainers.find(c => c.Id === tId || c.Id.startsWith(tId));
          const isAsgRunning = asgContainer && asgContainer.State === 'running';
          
          if (asgConfig && asgConfig.parentId && isAsgRunning && ipMap[asgConfig.parentId]) {
            targetIps.push(ipMap[asgConfig.parentId]);
          } else if (asgIps[tId]) {
            targetIps.push(...asgIps[tId]);
          } else if (ipMap[tId]) {
            targetIps.push(ipMap[tId]);
          }
        }
        
        const targetPort = config.loadBalancerTargetPorts?.[ep.nodeId] || 80;
        const rules = config.loadBalancerRoutingRules?.[ep.nodeId] || [];
        
        let upstreamsConfig = '';
        let locationsConfig = '';

        if (rules.length > 0) {
          rules.forEach((rule: any, idx: number) => {
            const ruleUpstreamName = `upstream_rule_${idx}`;
            const ruleTargetId = rule.targetId;
            const ruleTargetIps: string[] = [];
            
            const asgConfig = config.asgs?.[ruleTargetId];
            const asgContainer = updatedDockerContainers.find(c => c.Id === ruleTargetId || c.Id.startsWith(ruleTargetId));
            const isAsgRunning = asgContainer && asgContainer.State === 'running';

            if (asgConfig && asgConfig.parentId && isAsgRunning && ipMap[asgConfig.parentId]) {
              ruleTargetIps.push(ipMap[asgConfig.parentId]);
            } else if (asgIps[ruleTargetId]) {
              ruleTargetIps.push(...asgIps[ruleTargetId]);
            } else if (ipMap[ruleTargetId]) {
              ruleTargetIps.push(ipMap[ruleTargetId]);
            }

            let serversStr: string;
            if (ruleTargetIps.length > 0) {
              serversStr = ruleTargetIps.map(ip => `    server ${ip}:${targetPort};`).join('\n');
            } else {
              serversStr = '    server 127.0.0.1:81 down;';
            }

            upstreamsConfig += `  upstream ${ruleUpstreamName} {\n${serversStr}\n  }\n`;
            
            locationsConfig += `    location ${rule.path} {\n` +
                               `      proxy_pass http://${ruleUpstreamName}/;\n` +
                               `      proxy_set_header Host $host;\n` +
                               `      proxy_set_header X-Real-IP $remote_addr;\n` +
                               `      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n` +
                               `      proxy_set_header X-Forwarded-Proto $scheme;\n` +
                               `    }\n`;
          });

          // Add default fallback / location routing
          locationsConfig += `    location / {\n` +
                             `      return 404 "Akal Lab Load Balancer: No route matched this path.";\n` +
                             `    }\n`;
        } else {
          // Fallback to legacy single-target upstream
          let serversStr: string;
          if (targetIps.length > 0) {
            serversStr = targetIps.map(ip => `    server ${ip}:${targetPort};`).join('\n');
          } else {
            serversStr = '    server 127.0.0.1:81 down;';
          }
          upstreamsConfig = `  upstream myapp {\n${serversStr}\n  }\n`;
          locationsConfig = `    location / {\n` +
                            `      proxy_pass http://myapp;\n` +
                            `      proxy_set_header Host $host;\n` +
                            `      proxy_set_header X-Real-IP $remote_addr;\n` +
                            `      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n` +
                            `      proxy_set_header X-Forwarded-Proto $scheme;\n` +
                            `    }\n`;
        }

        const nginxConfig = `worker_shutdown_timeout 1s;
events { worker_connections 1024; }
http {
${upstreamsConfig}
  server {
    listen 80;
${locationsConfig}
  }
}`;
        // Write configuration into container and reload Nginx
        await this.runExec(containerId, ['sh', '-c', `cat << 'EOF' > /etc/nginx/nginx.conf\n${nginxConfig}\nEOF`]);
        await this.runExec(containerId, ['nginx', '-s', 'reload']);
      }

      // 1. Initialize custom chains and flush rules
      await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-INPUT 2>/dev/null || true']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-OUTPUT 2>/dev/null || true']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -C INPUT -j AKAL-INPUT 2>/dev/null || iptables -A INPUT -j AKAL-INPUT']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -C OUTPUT -j AKAL-OUTPUT 2>/dev/null || iptables -A OUTPUT -j AKAL-OUTPUT']);
      await this.runExec(containerId, ['iptables', '-F', 'AKAL-INPUT']);
      await this.runExec(containerId, ['iptables', '-F', 'AKAL-OUTPUT']);

      const isDnsEnabled = config.vpcConfig?.dnsEnabled !== false;

      // 1.5 Configure /etc/hosts for cross-subnet DNS resolution (using true node names)
      const selfNodeName = containerInfo.Names[0].replace(/^\//, '').replace(`akal-lab-${projectId}-`, '');
      const hostsContent = [
        '127.0.0.1 localhost',
        '::1 localhost ip6-localhost ip6-loopback',
        `${ipMap[ep.nodeId]} ${selfNodeName}`
      ];

      if (isDnsEnabled) {
        for (const otherEp of endpoints) {
          if (otherEp.nodeId === ep.nodeId) continue;
          const otherIp = ipMap[otherEp.nodeId];
          const otherContainerInfo = updatedDockerContainers.find(c => c.Id === idMap[otherEp.nodeId]);
          if (otherIp && otherContainerInfo) {
            const otherNodeName = otherContainerInfo.Names[0].replace(/^\//, '').replace(`akal-lab-${projectId}-`, '');
            hostsContent.push(`${otherIp} ${otherNodeName}`);
          }
        }
      }

      const hostsStr = hostsContent.join('\n');
      await this.runExec(containerId, ['sh', '-c', `cat << 'EOF' > /etc/hosts\n${hostsStr}\nEOF`]);

      // DNS Control: If DNS resolution is disabled, drop outbound port 53 traffic (DNS queries)
      // This is placed before loopback rules to ensure local Docker DNS queries (sent to loopback resolver 127.0.0.11) are blocked.
      if (!isDnsEnabled) {
        console.log(`[DockerNetworkProvider] DNS is disabled. Blocking Port 53 and local resolver 127.0.0.11 outbound inside container ${containerId.slice(0, 12)}...`);
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', '127.0.0.11', '-j', 'REJECT']);
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-p', 'udp', '--dport', '53', '-j', 'REJECT']);
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-p', 'tcp', '--dport', '53', '-j', 'REJECT']);
      }

      // 2. Allow established loopback and related connections (essential for container health & pings)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-i', 'lo', '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-o', 'lo', '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', '127.0.0.0/8', '-j', 'ACCEPT']);

      // 2.5. Routing Table & Internet Gateway Enforcement (Evaluated BEFORE conntrack and security groups)
      const subnetId = config.nodeSubnetMap[ep.nodeId];
      const subnet = config.subnets?.find((s: any) => s.id === subnetId);
      const isPublicSubnet = subnet?.type === 'public';
      const hasIgwRoute = subnet?.routes?.some((r: any) => r.destination === '0.0.0.0/0' && r.target === 'igw');
      const hasLocalRoute = subnet?.routes?.some((r: any) => r.destination === (config.vpcConfig?.cidr || '10.0.0.0/16') && r.target === 'local');

      // Check if this subnet has a NAT Gateway route
      const natRoute = this.findNatRoute(subnet, endpoints, config, dockerContainers, projectId);
      const isInternetAllowed = isIgwEnabled && ((isPublicSubnet && hasIgwRoute) || !!natRoute);
      const vpcCidr = config.vpcConfig?.cidr || '10.0.0.0/16';

      // Configure default route for this container based on routing tables
      if (natRoute) {
        const cidr = resolvedCidrs[subnetId] || subnet?.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
        const prefixMatch = cidr.match(/^(\d+\.\d+\.\d+)\./);
        const prefix = prefixMatch ? prefixMatch[1] + '.' : '';
        const natGatewayIpInSubnet = prefix ? `${prefix}254` : '';
        if (natGatewayIpInSubnet) {
          console.log(`[DockerNetworkProvider] Setting default gateway for container ${ep.containerName} to NAT Gateway ${natGatewayIpInSubnet}...`);
          await this.runExec(containerId, ['ip', 'route', 'replace', 'default', 'via', natGatewayIpInSubnet]);
        }
      } else {
        const cidr = resolvedCidrs[subnetId] || subnet?.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
        const prefixMatch = cidr.match(/^(\d+\.\d+\.\d+)\./);
        const prefix = prefixMatch ? prefixMatch[1] + '.' : '';
        const dockerGatewayIp = prefix ? `${prefix}1` : '';
        if (dockerGatewayIp) {
          await this.runExec(containerId, ['ip', 'route', 'replace', 'default', 'via', dockerGatewayIp]);
        }
      }

      // Ensure local VPC CIDR is routed via the local Docker bridge gateway (dockerGatewayIp)
      // to bypass the NAT default route and preserve source IPs for Security Groups.
      // Skip this for NAT Gateways to prevent routing conflicts when attaching private subnet interfaces.
      const cidr = resolvedCidrs[subnetId] || subnet?.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
      const prefixMatch = cidr.match(/^(\d+\.\d+\.\d+)\./);
      const prefix = prefixMatch ? prefixMatch[1] + '.' : '';
      const dockerGatewayIp = prefix ? `${prefix}1` : '';
      if (nodeType !== 'nat') {
        if (dockerGatewayIp) {
          console.log(`[DockerNetworkProvider] Setting local VPC route for container ${ep.containerName} to ${vpcCidr} via ${dockerGatewayIp}...`);
          await this.runExec(containerId, ['ip', 'route', 'replace', vpcCidr, 'via', dockerGatewayIp]);
        }
      } else {
        // Clean up any existing VPC route in the NAT Gateway container to avoid interface attaching conflicts
        await this.runExec(containerId, ['ip', 'route', 'del', vpcCidr]).catch(() => {});
      }

      if (!hasLocalRoute) {
        // Reject local VPC subnet-to-subnet traffic if local route is deleted
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', vpcCidr, '-j', 'REJECT']);
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', vpcCidr, '-j', 'REJECT']);
      }

      if (!isInternetAllowed) {
        // Block external internet traffic (anything outside VPC CIDR) if internet access is blocked
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '!', '-d', vpcCidr, '-j', 'REJECT']);
      }

      // Stateful rule tracking
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);

      // 3. Process intents affecting this node (Security Groups)
      for (const intent of intents) {
        if (intent.ownerNodeId !== ep.nodeId) continue;
        if (nodeType === 'nat' && intent.targetNodeId === ep.nodeId) {
          // NAT Gateways do not allow direct inbound connections; skip applying rules
          continue;
        }

        const action = intent.type.startsWith('ALLOW') ? 'ACCEPT' : 'REJECT';
        const isTarget = intent.targetNodeId === ep.nodeId;
        const isSource = intent.sourceNodeId === ep.nodeId;

        if (!isTarget && !isSource) continue;

        const rawProto = intent.protocol || 'all';
        const rawPort = intent.port || 'ALL';
        const port = (typeof rawPort === 'string' && rawPort.toUpperCase() === 'ALL') ? 'ALL' : rawPort;

        const sourceIp = isTarget ? ipMap[intent.sourceNodeId || ''] : undefined;
        const targetIp = isSource ? ipMap[intent.targetNodeId || ''] : undefined;

        // Apply incoming rule
        if (isTarget && sourceIp) {
          if (rawProto === 'all' && port === 'ALL') {
            // Allow/Deny all protocols entirely (TCP, UDP, ICMP)
            await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-j', action]);
          } else if (rawProto === 'icmp') {
            await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', 'icmp', '-j', action]);
          } else if (rawProto === 'all') {
            // Apply for both TCP and UDP when specific port is specified
            await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', 'tcp', '--dport', port, '-j', action]);
            await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', 'udp', '--dport', port, '-j', action]);
          } else {
            if (port === 'ALL') {
              await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', rawProto, '-j', action]);
            } else {
              await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', rawProto, '--dport', port, '-j', action]);
            }
          }
        }

        // Apply outgoing rule
        if (isSource && targetIp) {
          if (rawProto === 'all' && port === 'ALL') {
            await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-j', action]);
          } else if (rawProto === 'icmp') {
            await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', 'icmp', '-j', action]);
          } else if (rawProto === 'all') {
            await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', 'tcp', '--dport', port, '-j', action]);
            await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', 'udp', '--dport', port, '-j', action]);
          } else {
            if (port === 'ALL') {
              await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', rawProto, '-j', action]);
            } else {
              await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', rawProto, '--dport', port, '-j', action]);
            }
          }
        }
      }

      // 4. Default Outbound Fallthrough policy
      if (isInternetAllowed) {
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-j', 'ACCEPT']);
      } else {
        // If internet is blocked, but the traffic falls through routing/SG checks (so it is local VPC traffic), ACCEPT it.
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', vpcCidr, '-j', 'ACCEPT']);
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-j', 'REJECT']);
      }

      // 5. Allow host-to-container connections via bridge gateway if security group allows inbound from 0.0.0.0/0
      const nodeSgs = config.nodeSecurityGroups?.[ep.nodeId] || [];
      for (const sg of nodeSgs) {
        if (sg.type === 'inbound' && sg.source === '0.0.0.0/0') {
          const rawProto = (sg.protocol || 'all').toLowerCase();
          const rawPort = sg.port || 'ALL';
          const port = (typeof rawPort === 'string' && rawPort.toUpperCase() === 'ALL') ? 'ALL' : rawPort;
          const action = sg.action || 'ALLOW';
          const iptablesAction = action === 'ALLOW' ? 'ACCEPT' : 'REJECT';

          const cidr = resolvedCidrs[subnetId] || subnet?.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
          const prefixMatch = cidr.match(/^(\d+\.\d+\.\d+)\./);
          const prefix = prefixMatch ? prefixMatch[1] + '.' : '';
          const dockerGatewayIp = prefix ? `${prefix}1` : '';

          if (dockerGatewayIp) {
            if (rawProto === 'all' && port === 'ALL') {
              if (iptablesAction === 'REJECT') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', 'tcp', '-j', 'REJECT', '--reject-with', 'tcp-reset']);
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-j', 'REJECT']);
              } else {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-j', iptablesAction]);
              }
            } else if (rawProto === 'icmp') {
              await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', 'icmp', '-j', iptablesAction]);
            } else if (rawProto === 'all') {
              if (iptablesAction === 'REJECT') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', 'tcp', '--dport', port, '-j', 'REJECT', '--reject-with', 'tcp-reset']);
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', 'udp', '--dport', port, '-j', 'REJECT']);
              } else {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', 'tcp', '--dport', port, '-j', iptablesAction]);
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', 'udp', '--dport', port, '-j', iptablesAction]);
              }
            } else {
              if (port === 'ALL') {
                if (iptablesAction === 'REJECT' && rawProto === 'tcp') {
                  await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', rawProto, '-j', 'REJECT', '--reject-with', 'tcp-reset']);
                } else {
                  await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', rawProto, '-j', iptablesAction]);
                }
              } else {
                if (iptablesAction === 'REJECT' && rawProto === 'tcp') {
                  await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', rawProto, '--dport', port, '-j', 'REJECT', '--reject-with', 'tcp-reset']);
                } else {
                  await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', dockerGatewayIp, '-p', rawProto, '--dport', port, '-j', iptablesAction]);
                }
              }
            }
          }

          const hasSharedNet = containerInfo.NetworkSettings?.Networks?.['akal-lab-network'];
          if (hasSharedNet && sharedNetGateway) {
            if (rawProto === 'all' && port === 'ALL') {
              if (iptablesAction === 'REJECT') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', 'tcp', '-j', 'REJECT', '--reject-with', 'tcp-reset']);
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-j', 'REJECT']);
              } else {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-j', iptablesAction]);
              }
            } else if (rawProto === 'icmp') {
              await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', 'icmp', '-j', iptablesAction]);
            } else if (rawProto === 'all') {
              if (iptablesAction === 'REJECT') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', 'tcp', '--dport', port, '-j', 'REJECT', '--reject-with', 'tcp-reset']);
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', 'udp', '--dport', port, '-j', 'REJECT']);
              } else {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', 'tcp', '--dport', port, '-j', iptablesAction]);
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', 'udp', '--dport', port, '-j', iptablesAction]);
              }
            } else {
              if (port === 'ALL') {
                if (iptablesAction === 'REJECT' && rawProto === 'tcp') {
                  await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', rawProto, '-j', 'REJECT', '--reject-with', 'tcp-reset']);
                } else {
                  await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', rawProto, '-j', iptablesAction]);
                }
              } else {
                if (iptablesAction === 'REJECT' && rawProto === 'tcp') {
                  await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', rawProto, '--dport', port, '-j', 'REJECT', '--reject-with', 'tcp-reset']);
                } else {
                  await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sharedNetGateway, '-p', rawProto, '--dport', port, '-j', iptablesAction]);
                }
              }
            }
          }
        }
      }

      // 6. Default Inbound: REJECT ALL (Zero-trust secure baseline)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-p', 'tcp', '-j', 'REJECT', '--reject-with', 'tcp-reset']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-j', 'REJECT']);

      // 6. Verification
      const iptablesS = await this.runExec(containerId, ['iptables', '-S']);

      if (!iptablesS || !iptablesS.includes('-N AKAL-INPUT') || !iptablesS.includes('-N AKAL-OUTPUT')) {
        console.error(`[DockerNetworkProvider] Verification output:\n${iptablesS}`);
        throw new Error(`Firewall verification failed inside container ${containerId.slice(0, 12)}: custom chains were not created/found.`);
      }
    }));
  }

  public async cleanupProjectPolicies(projectId: string, endpoints: VirtualEndpoint[]): Promise<void> {
    console.log(`[DockerNetworkProvider] Cleaning up network policies for project: ${projectId}`);
    const dockerContainers = await docker.listContainers({ all: true });

    // Resolve correct container names in endpoints using the real container names from Docker
    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c => c.Id === ep.nodeId || c.Id.startsWith(ep.nodeId));
      if (containerInfo && containerInfo.Names && containerInfo.Names.length > 0) {
        ep.containerName = containerInfo.Names[0].replace(/^\//, '');
      }
    }

    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c => 
        c.Names.some(name => name.replace(/^\//, '') === ep.containerName)
      );
      if (containerInfo && containerInfo.State === 'running') {
        const containerId = containerInfo.Id;
        const hasIptables = await this.runExec(containerId, ['sh', '-c', 'command -v iptables || true']);
        if (hasIptables && !hasIptables.includes('not found') && hasIptables.trim() !== '') {
          // Flush custom chains
          await this.runExec(containerId, ['iptables', '-F', 'AKAL-INPUT']);
          await this.runExec(containerId, ['iptables', '-F', 'AKAL-OUTPUT']);
        }
      }
    }

    // Clean up all dynamic subnet networks created for this project
    console.log(`[DockerNetworkProvider] Cleaning up subnet networks for project: ${projectId}`);
    try {
      const allNetworks = await docker.listNetworks();
      for (const net of allNetworks) {
        if (net.Name.startsWith(`akal-subnet-${projectId}-`)) {
          console.log(`[DockerNetworkProvider] Deleting network ${net.Name}...`);
          try {
            const network = docker.getNetwork(net.Id);
            const netInspect = await network.inspect();
            const connectedContainers = Object.keys(netInspect.Containers || {});
            for (const cId of connectedContainers) {
              await network.disconnect({ Container: cId, Force: true });
            }
            await network.remove();
          } catch (err) {
            console.error(`Failed to delete network ${net.Name}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to list/clean networks:`, err);
    }
  }

  private async ensureNetwork(netName: string, cidr: string, allNetworks: any[]): Promise<string> {
    const exists = allNetworks.some(n => n.Name === netName);
    if (exists) {
      try {
        const net = docker.getNetwork(netName);
        const inspect = await net.inspect();
        const subnet = inspect.IPAM?.Config?.[0]?.Subnet;
        if (subnet) return subnet;
      } catch {
        // Ignore network inspect error and fallback to default CIDR
      }
      return cidr;
    }

    let currentCidr = cidr;
    let attempts = 0;
    while (attempts < 10) {
      try {
        console.log(`[DockerNetworkProvider] Creating network ${netName} with CIDR ${currentCidr}...`);
        const gateway = currentCidr.replace(/\.0\/\d+$/, '.1');
        await docker.createNetwork({
          Name: netName,
          Driver: 'bridge',
          IPAM: {
            Config: [{
              Subnet: currentCidr,
              Gateway: gateway
            }]
          }
        });
        return currentCidr;
      } catch (err: any) {
        if (err.statusCode === 403 || err.message?.includes('overlaps') || err.message?.includes('pool')) {
          attempts++;
          const secondOctet = 110 + attempts;
          const parts = currentCidr.split('.');
          parts[1] = secondOctet.toString();
          currentCidr = parts.join('.');
          console.warn(`[DockerNetworkProvider] Pool overlap detected. Retrying with shifted CIDR: ${currentCidr}`);
        } else {
          throw err;
        }
      }
    }
    throw new Error(`Failed to create network ${netName} after 10 attempts due to address space overlaps.`);
  }
}
