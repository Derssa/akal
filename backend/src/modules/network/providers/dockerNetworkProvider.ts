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

  public async applyPlan(projectId: string, endpoints: VirtualEndpoint[], intents: NetworkIntent[]): Promise<void> {
    console.log(`[DockerNetworkProvider] Applying network plan for project: ${projectId}`);
    
    const dockerContainers = await docker.listContainers({ all: true });
    const ipMap: Record<string, string> = {};
    const idMap: Record<string, string> = {};

    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c => 
        c.Id === ep.nodeId ||
        c.Id.startsWith(ep.nodeId) ||
        c.Names.some(name => name.replace(/^\//, '') === ep.containerName)
      );
      if (containerInfo && containerInfo.State === 'running') {
        const netSettings = containerInfo.NetworkSettings?.Networks?.['akal-lab-network'];
        if (netSettings && netSettings.IPAddress) {
          ipMap[ep.nodeId] = netSettings.IPAddress;
          idMap[ep.nodeId] = containerInfo.Id;
          console.log(`[DockerNetworkProvider] Resolved node ${ep.nodeId} -> Container ${containerInfo.Id.slice(0, 12)} (${netSettings.IPAddress})`);
        }
      } else {
        console.log(`[DockerNetworkProvider] Container for node ${ep.nodeId} (${ep.containerName}) is not running or not found.`);
      }
    }

    // Configure firewall for each active container
    for (const ep of endpoints) {
      const containerId = idMap[ep.nodeId];
      if (!containerId) continue;

      console.log(`[DockerNetworkProvider] Applying firewall rules inside container ${containerId.slice(0, 12)}...`);

      // 1. Initialize custom chains and flush rules
      await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-INPUT 2>/dev/null || true']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-OUTPUT 2>/dev/null || true']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -C INPUT -j AKAL-INPUT 2>/dev/null || iptables -A INPUT -j AKAL-INPUT']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -C OUTPUT -j AKAL-OUTPUT 2>/dev/null || iptables -A OUTPUT -j AKAL-OUTPUT']);
      await this.runExec(containerId, ['iptables', '-F', 'AKAL-INPUT']);
      await this.runExec(containerId, ['iptables', '-F', 'AKAL-OUTPUT']);

      // 2. Allow established loopback and related connections (essential for container health & pings)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-i', 'lo', '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-o', 'lo', '-j', 'ACCEPT']);
      
      // Stateful rule tracking
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);

      // 3. Process intents affecting this node
      for (const intent of intents) {
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

      // 4. Default Outbound: ALLOW ALL (so container has internet/updates access)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-j', 'ACCEPT']);

      // 5. Default Inbound: REJECT ALL (Zero-trust secure baseline)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-j', 'REJECT']);

      // 6. Verification
      const iptablesS = await this.runExec(containerId, ['iptables', '-S']);
      console.log(`[DockerNetworkProvider] Verification output (iptables -S) inside ${containerId.slice(0, 12)}:\n${iptablesS}`);

      if (!iptablesS || !iptablesS.includes('-N AKAL-INPUT') || !iptablesS.includes('-N AKAL-OUTPUT')) {
        throw new Error(`Firewall verification failed inside container ${containerId.slice(0, 12)}: custom chains were not created/found.`);
      }
      
      const iptablesL = await this.runExec(containerId, ['iptables', '-L', '-n', '-v']);
      console.log(`[DockerNetworkProvider] Detailed status (iptables -L -n -v) inside ${containerId.slice(0, 12)}:\n${iptablesL}`);
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
        // Flush custom chains
        await this.runExec(containerId, ['iptables', '-F', 'AKAL-INPUT']);
        await this.runExec(containerId, ['iptables', '-F', 'AKAL-OUTPUT']);
      }
    }
  }
}
