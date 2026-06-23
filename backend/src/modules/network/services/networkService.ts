import crypto from 'crypto';
import { SemanticRule } from '../models/networkPolicy';
import { EnforcementPlanner } from '../planner/enforcementPlanner';
import { VirtualNetworkMapper } from '../mapper/virtualNetworkMapper';
import { DockerNetworkProvider } from '../providers/dockerNetworkProvider';
import { NetworkProvider } from '../providers/networkProvider';
import docker from '../../../infrastructure/docker/DockerClient';

export class NetworkService {
  private static provider: NetworkProvider = new DockerNetworkProvider();
  private static policyHashes: Record<string, string> = {};
  private static taskQueues: Record<string, Promise<void>> = {};

  public static clearPolicyHash(projectId: string): void {
    delete this.policyHashes[projectId];
    console.log(`[NetworkService] Cleared policy hash cache for project: ${projectId}`);
  }

  public static applyPolicy(projectId: string, config: any): Promise<void> {
    const currentQueue = this.taskQueues[projectId] || Promise.resolve();

    const nextTask = currentQueue.then(async () => {
      // 1. Performance optimization: Policy Hash Diffing
      const serializedConfig = JSON.stringify(config);
      const hash = crypto.createHash('sha256').update(serializedConfig).digest('hex');

      if (this.policyHashes[projectId] === hash) {
        console.log(`[NetworkService] No policy changes detected for project: ${projectId}. Skipping enforcement.`);
        return;
      }

      console.log(`[NetworkService] Policy change detected for project: ${projectId}. Recomputing...`);

      // 2. Compute normalized rules (Policy Engine layer)
      const rules = await this.computeSemanticRules(projectId, config);

      // 3. enforcement planner compiling rules to intents
      const intents = EnforcementPlanner.plan(projectId, rules);

      // 4. Resolve endpoints
      const nodeIds = Object.keys(config.nodeSubnetMap || {});
      const endpoints = VirtualNetworkMapper.mapNodesToEndpoints(projectId, nodeIds);

      // 5. Apply Plan via active provider
      try {
        await this.provider.applyPlan(projectId, endpoints, intents, config);
        this.policyHashes[projectId] = hash;
      } catch (err) {
        console.error(`[NetworkService] Failed to apply network plan:`, err);
        throw err;
      }
    }).catch(err => {
      console.error(`[NetworkService] Queue error for project ${projectId}:`, err);
    });

    this.taskQueues[projectId] = nextTask;
    return nextTask;
  }

  public static async cleanupProjectNetwork(projectId: string, config: any): Promise<void> {
    const nodeIds = Object.keys(config.nodeSubnetMap || {});
    const endpoints = VirtualNetworkMapper.mapNodesToEndpoints(projectId, nodeIds);
    await this.provider.cleanupProjectPolicies(projectId, endpoints);
    delete this.policyHashes[projectId];
  }

  private static async computeSemanticRules(projectId: string, config: any): Promise<SemanticRule[]> {
    const rules: SemanticRule[] = [];
    const nodeIds = Object.keys(config.nodeSubnetMap || {});
    const sgs = config.nodeSecurityGroups || {};

    // Gather all active ASG replica containers and match them to their ASG configurations
    const dockerContainers = await docker.listContainers({ all: true });
    const asgReplicas: Record<string, string[]> = {};
    for (const c of dockerContainers) {
      const asgId = c.Labels?.['akal.asg.id'];
      if (asgId && c.State === 'running') {
        if (!asgReplicas[asgId]) asgReplicas[asgId] = [];
        asgReplicas[asgId].push(c.Id);
      }
    }

    const resolveRuntimeIds = (id: string): string[] => {
      if (asgReplicas[id]) {
        return asgReplicas[id];
      }
      return [id];
    };

    // Get all running nodes inside project subnets
    for (const srcNodeId of nodeIds) {
      let nodeSgRules = sgs[srcNodeId] || [];

      // If the node ID corresponds to an active replica container, find which ASG it belongs to and inherit its rules
      const containerInfo = dockerContainers.find(c => c.Id === srcNodeId || c.Id.startsWith(srcNodeId));
      const asgId = containerInfo?.Labels?.['akal.asg.id'];
      
      if (asgId) {
        const asgConfig = config.asgs?.[asgId];
        if (asgConfig && asgConfig.parentId) {
          nodeSgRules = sgs[asgConfig.parentId] || [];
        }
      } else {
        // Also keep direct ASG inheritance if config lists the ASG boundary node ID itself
        const asgConfig = config.asgs?.[srcNodeId];
        if (asgConfig && asgConfig.parentId) {
          nodeSgRules = sgs[asgConfig.parentId] || [];
        }
      }

      // Process outbound rules for source node
      for (const sgRule of nodeSgRules) {
        if (sgRule.type === 'outbound') {
          const action = sgRule.action || 'ALLOW';
          const sgProto = (sgRule.protocol || 'ALL').toLowerCase() as 'all' | 'tcp' | 'udp' | 'icmp';
          const rawPort = sgProto === 'icmp' ? 'ALL' : (sgRule.port || 'ALL');
          const port = (typeof rawPort === 'string' && rawPort.toUpperCase() === 'ALL') ? 'ALL' : rawPort;

          const addOutboundRule = (dstId: string) => {
            rules.push({
              sourceNodeId: srcNodeId,
              targetNodeId: dstId,
              protocol: sgProto,
              port,
              action,
              direction: 'outbound',
              ownerNodeId: srcNodeId
            });
            if (sgProto === 'all' && port === 'ALL') {
              rules.push({
                sourceNodeId: srcNodeId,
                targetNodeId: dstId,
                protocol: 'icmp',
                port: 'ALL',
                action,
                direction: 'outbound',
                ownerNodeId: srcNodeId
              });
            }
          };

          if (sgRule.source === '0.0.0.0/0') {
            // Outbound to anywhere
            for (const dstNodeId of nodeIds) {
              if (srcNodeId === dstNodeId) continue;
              addOutboundRule(dstNodeId);
            }
          } else if (sgRule.source.startsWith('subnet-')) {
            // Outbound to subnet
            for (const dstNodeId of nodeIds) {
              if (config.nodeSubnetMap[dstNodeId] === sgRule.source) {
                addOutboundRule(dstNodeId);
              }
            }
          } else {
            // Outbound to specific node ID (can resolve to multiple runtime IDs if destination is an ASG)
            const resolvedDsts = resolveRuntimeIds(sgRule.source);
            for (const dst of resolvedDsts) {
              addOutboundRule(dst);
            }
          }
        }
      }

      // Process inbound rules for target node
      for (const sgRule of nodeSgRules) {
        if (sgRule.type === 'inbound') {
          const action = sgRule.action || 'ALLOW';
          const sgProto = (sgRule.protocol || 'ALL').toLowerCase() as 'all' | 'tcp' | 'udp' | 'icmp';
          const rawPort = sgProto === 'icmp' ? 'ALL' : (sgRule.port || 'ALL');
          const port = (typeof rawPort === 'string' && rawPort.toUpperCase() === 'ALL') ? 'ALL' : rawPort;

          const addInboundRule = (srcId: string) => {
            rules.push({
              sourceNodeId: srcId,
              targetNodeId: srcNodeId,
              protocol: sgProto,
              port,
              action,
              direction: 'inbound',
              ownerNodeId: srcNodeId
            });
            if (sgProto === 'all' && port === 'ALL') {
              rules.push({
                sourceNodeId: srcId,
                targetNodeId: srcNodeId,
                protocol: 'icmp',
                port: 'ALL',
                action,
                direction: 'inbound',
                ownerNodeId: srcNodeId
              });
            }
          };

          if (sgRule.source === '0.0.0.0/0') {
            // Inbound from anywhere
            for (const dstNodeId of nodeIds) {
              if (srcNodeId === dstNodeId) continue;
              addInboundRule(dstNodeId);
            }
          } else if (sgRule.source.startsWith('subnet-')) {
            // Inbound from subnet
            for (const dstNodeId of nodeIds) {
              if (config.nodeSubnetMap[dstNodeId] === sgRule.source) {
                addInboundRule(dstNodeId);
              }
            }
          } else {
            // Inbound from specific node ID (can resolve to multiple runtime IDs if source is an ASG)
            const resolvedSrcs = resolveRuntimeIds(sgRule.source);
            for (const src of resolvedSrcs) {
              addInboundRule(src);
            }
          }
        }
      }
    }

    return rules;
  }
}
