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
      return new Promise<string>((resolve, reject) => {
        let output = '';
        container.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => { output += chunk.toString(); }
          },
          {
            write: (chunk: Buffer) => { output += chunk.toString(); }
          }
        );
        stream.on('end', () => resolve(output.trim()));
        stream.on('error', (err) => reject(err));
      });
    } catch (err) {
      console.error(`Exec failed for cmd [${cmd.join(' ')}]:`, err);
      return '';
    }
  }

  public async applyPlan(projectId: string, endpoints: VirtualEndpoint[], intents: NetworkIntent[], config: any): Promise<void> {
    console.log(`[DockerNetworkProvider] Applying network plan for project: ${projectId}`);
    
    const dockerContainers = await docker.listContainers({ all: true });
    const ipMap: Record<string, string> = {};
    const idMap: Record<string, string> = {};

    // 1. Obsolete Docker Subnet Network Cleanup
    const allNetworks = await docker.listNetworks();
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
              const subnetEndpoints = endpoints.filter(e => config.nodeSubnetMap[e.nodeId] === subnetId)
                .sort((a, b) => a.containerName.localeCompare(b.containerName));
              const idx = subnetEndpoints.findIndex(e => e.nodeId === ep.nodeId);
              targetIp = `${prefix}${2 + idx}`;
            }
          }

          const targetNetwork = `akal-subnet-${projectId}-${subnetId}`;

          for (const netName of currentNetworks) {
            if (netName !== targetNetwork && (netName.startsWith('akal-subnet-') || netName === 'akal-lab-network')) {
              console.log(`[DockerNetworkProvider] Disconnecting container ${ep.containerName} from ${netName}...`);
              try {
                await docker.getNetwork(netName).disconnect({ Container: containerInfo.Id, Force: true });
              } catch (err) {}
            }
          }

          const isConnected = currentNetworks.includes(targetNetwork);
          const currentIp = inspect.NetworkSettings.Networks[targetNetwork]?.IPAddress;

          if (!isConnected || currentIp !== targetIp) {
            if (isConnected) {
              console.log(`[DockerNetworkProvider] Reconnecting container ${ep.containerName} to ${targetNetwork} due to IP mismatch...`);
              try {
                await docker.getNetwork(targetNetwork).disconnect({ Container: containerInfo.Id, Force: true });
              } catch (err) {}
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
        }
      } else {
        const targetNetwork = 'akal-lab-network';
        for (const netName of currentNetworks) {
          if (netName !== targetNetwork && netName.startsWith('akal-subnet-')) {
            console.log(`[DockerNetworkProvider] Disconnecting container ${ep.containerName} from subnet network ${netName}...`);
            try {
              await docker.getNetwork(netName).disconnect({ Container: containerInfo.Id, Force: true });
            } catch (err) {}
          }
        }

        if (!currentNetworks.includes(targetNetwork)) {
          console.log(`[DockerNetworkProvider] Reconnecting container ${ep.containerName} to default network ${targetNetwork}...`);
          try {
            await docker.getNetwork(targetNetwork).connect({ Container: containerInfo.Id });
          } catch (err) {}
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
        const key = Object.keys(networks).find(k => k.startsWith('akal-'));
        if (key && networks[key] && networks[key].IPAddress) {
          ipMap[ep.nodeId] = networks[key].IPAddress;
          idMap[ep.nodeId] = containerInfo.Id;
          console.log(`[DockerNetworkProvider] Resolved subnet node ${ep.nodeId} -> Container ${containerInfo.Id.slice(0, 12)} (${networks[key].IPAddress})`);
        }
      }
    }

    // Configure firewall for each active container
    for (const ep of endpoints) {
      const containerId = idMap[ep.nodeId];
      if (!containerId) continue;

      // Check if iptables is available inside this container
      const hasIptables = await this.runExec(containerId, ['sh', '-c', 'command -v iptables']);
      if (!hasIptables || hasIptables.includes('not found') || hasIptables.trim() === '') {
        console.warn(`[DockerNetworkProvider] Skipping firewall configuration for container ${containerId.slice(0, 12)} (${ep.containerName}): 'iptables' is not installed.`);
        continue;
      }

      console.log(`[DockerNetworkProvider] Applying firewall rules inside container ${containerId.slice(0, 12)}...`);

      // 1. Initialize custom chains and flush rules
      await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-INPUT 2>/dev/null || true']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-OUTPUT 2>/dev/null || true']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -C INPUT -j AKAL-INPUT 2>/dev/null || iptables -A INPUT -j AKAL-INPUT']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -C OUTPUT -j AKAL-OUTPUT 2>/dev/null || iptables -A OUTPUT -j AKAL-OUTPUT']);
      await this.runExec(containerId, ['iptables', '-F', 'AKAL-INPUT']);
      await this.runExec(containerId, ['iptables', '-F', 'AKAL-OUTPUT']);

      // DNS Control: If DNS resolution is disabled, drop outbound port 53 traffic (DNS queries)
      // This is placed before loopback rules to ensure local Docker DNS queries (sent to loopback resolver 127.0.0.11) are blocked.
      const isDnsEnabled = config.vpcConfig?.dnsEnabled !== false;
      if (!isDnsEnabled) {
        console.log(`[DockerNetworkProvider] DNS is disabled. Blocking Port 53 and local resolver 127.0.0.11 outbound inside container ${containerId.slice(0, 12)}...`);
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', '127.0.0.11', '-j', 'REJECT']);
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-p', 'udp', '--dport', '53', '-j', 'REJECT']);
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-p', 'tcp', '--dport', '53', '-j', 'REJECT']);
      }

      // 2. Allow established loopback and related connections (essential for container health & pings)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-i', 'lo', '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-o', 'lo', '-j', 'ACCEPT']);
      
      // Stateful rule tracking
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);

      // 3. Process intents affecting this node
      for (const intent of intents) {
        if (intent.ownerNodeId !== ep.nodeId) continue;

        const action = intent.type.startsWith('ALLOW') ? 'ACCEPT' : 'REJECT';
        const isTarget = intent.targetNodeId === ep.nodeId;
        const isSource = intent.sourceNodeId === ep.nodeId;

        if (!isTarget && !isSource) continue;

        const rawProto = intent.protocol || 'all';
        const port = intent.port || 'ALL';

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



      // 5. Internet Access Control (IGW, Private Subnet & Routing Table checks)
      const subnetId = config.nodeSubnetMap[ep.nodeId];
      const subnet = config.subnets?.find((s: any) => s.id === subnetId);
      const isIgwEnabled = config.vpcConfig?.igwEnabled !== false;
      const isPublicSubnet = subnet?.type === 'public';
      const hasIgwRoute = subnet?.routes?.some((r: any) => r.destination === '0.0.0.0/0' && r.target === 'igw');
      const hasLocalRoute = subnet?.routes?.some((r: any) => r.destination === (config.vpcConfig?.cidr || '10.0.0.0/16') && r.target === 'local');

      const isInternetAllowed = isIgwEnabled && isPublicSubnet && hasIgwRoute;
      const vpcCidr = config.vpcConfig?.cidr || '10.0.0.0/16';

      // Always accept loopback traffic first (includes local DNS)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', '127.0.0.0/8', '-j', 'ACCEPT']);

      if (hasLocalRoute) {
        // If local route exists, allow traffic within the VPC
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', vpcCidr, '-j', 'ACCEPT']);
      } else {
        // If local route is removed, reject VPC traffic
        console.log(`[DockerNetworkProvider] Local VPC route is missing. Blocking VPC traffic for container ${containerId.slice(0, 12)}.`);
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', vpcCidr, '-j', 'REJECT']);
      }

      if (isInternetAllowed) {
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-j', 'ACCEPT']);
      } else {
        await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-j', 'REJECT']);
      }

      // 6. Default Inbound: REJECT ALL (Zero-trust secure baseline)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-j', 'REJECT']);

      // 6. Verification
      const iptablesS = await this.runExec(containerId, ['iptables', '-S']);

      if (!iptablesS || !iptablesS.includes('-N AKAL-INPUT') || !iptablesS.includes('-N AKAL-OUTPUT')) {
        console.error(`[DockerNetworkProvider] Verification output:\n${iptablesS}`);
        throw new Error(`Firewall verification failed inside container ${containerId.slice(0, 12)}: custom chains were not created/found.`);
      }
    }
  }

  public async cleanupProjectPolicies(projectId: string, endpoints: VirtualEndpoint[]): Promise<void> {
    console.log(`[DockerNetworkProvider] Cleaning up network policies for project: ${projectId}`);
    const dockerContainers = await docker.listContainers({ all: true });

    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c => 
        c.Names.some(name => name.replace(/^\//, '') === ep.containerName)
      );
      if (containerInfo && containerInfo.State === 'running') {
        const containerId = containerInfo.Id;
        const hasIptables = await this.runExec(containerId, ['sh', '-c', 'command -v iptables']);
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
      } catch (e) {}
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
