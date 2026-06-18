import crypto from 'crypto';
import { SemanticRule, NetworkPolicy } from '../models/networkPolicy';
import { EnforcementPlanner } from '../planner/enforcementPlanner';
import { VirtualNetworkMapper } from '../mapper/virtualNetworkMapper';
import { DockerNetworkProvider } from '../providers/dockerNetworkProvider';
import { NetworkProvider } from '../providers/networkProvider';

export class NetworkService {
  private static provider: NetworkProvider = new DockerNetworkProvider();
  private static policyHashes: Record<string, string> = {};

  public static clearPolicyHash(projectId: string): void {
    delete this.policyHashes[projectId];
    console.log(`[NetworkService] Cleared policy hash cache for project: ${projectId}`);
  }

  public static async applyPolicy(projectId: string, config: any): Promise<void> {
    // 1. Performance optimization: Policy Hash Diffing
    const serializedConfig = JSON.stringify(config);
    const hash = crypto.createHash('sha256').update(serializedConfig).digest('hex');
    
    if (this.policyHashes[projectId] === hash) {
      console.log(`[NetworkService] No policy changes detected for project: ${projectId}. Skipping enforcement.`);
      return;
    }

    console.log(`[NetworkService] Policy change detected for project: ${projectId}. Recomputing...`);
    
    // 2. Compute normalized rules (Policy Engine layer)
    const rules = this.computeSemanticRules(projectId, config);

    // 3. enforcement planner compiling rules to intents
    const intents = EnforcementPlanner.plan(projectId, rules);

    // 4. Resolve endpoints
    const nodeIds = Object.keys(config.nodeSubnetMap || {});
    const endpoints = VirtualNetworkMapper.mapNodesToEndpoints(projectId, nodeIds);

    // 5. Apply Plan via active provider
    try {
      await this.provider.applyPlan(projectId, endpoints, intents);
      this.policyHashes[projectId] = hash;
    } catch (err) {
      console.error(`[NetworkService] Failed to apply network plan:`, err);
      throw err;
    }
  }

  public static async cleanupProjectNetwork(projectId: string, config: any): Promise<void> {
    const nodeIds = Object.keys(config.nodeSubnetMap || {});
    const endpoints = VirtualNetworkMapper.mapNodesToEndpoints(projectId, nodeIds);
    await this.provider.cleanupProjectPolicies(projectId, endpoints);
    delete this.policyHashes[projectId];
  }

  private static computeSemanticRules(projectId: string, config: any): SemanticRule[] {
    const rules: SemanticRule[] = [];
    const nodeIds = Object.keys(config.nodeSubnetMap || {});
    const sgs = config.nodeSecurityGroups || {};

    // Get all running nodes inside project subnets
    for (const srcNodeId of nodeIds) {
      const nodeSgRules = sgs[srcNodeId] || [];

      // Process outbound rules for source node
      for (const sgRule of nodeSgRules) {
        if (sgRule.type === 'outbound') {
          const action = sgRule.action || 'ALLOW';
          const port = sgRule.port || 'ALL';

          if (sgRule.source === '0.0.0.0/0') {
            // Outbound to anywhere
            for (const dstNodeId of nodeIds) {
              if (srcNodeId === dstNodeId) continue;
              rules.push({
                sourceNodeId: srcNodeId,
                targetNodeId: dstNodeId,
                protocol: 'all',
                port,
                action
              });
              // Always permit icmp (ping) outbound if allowed to connect
              rules.push({
                sourceNodeId: srcNodeId,
                targetNodeId: dstNodeId,
                protocol: 'icmp',
                port: 'ALL',
                action
              });
            }
          } else if (sgRule.source.startsWith('subnet-')) {
            // Outbound to subnet
            for (const dstNodeId of nodeIds) {
              if (config.nodeSubnetMap[dstNodeId] === sgRule.source) {
                rules.push({
                  sourceNodeId: srcNodeId,
                  targetNodeId: dstNodeId,
                  protocol: 'all',
                  port,
                  action
                });
                rules.push({
                  sourceNodeId: srcNodeId,
                  targetNodeId: dstNodeId,
                  protocol: 'icmp',
                  port: 'ALL',
                  action
                });
              }
            }
          } else {
            // Outbound to specific node ID
            rules.push({
              sourceNodeId: srcNodeId,
              targetNodeId: sgRule.source,
              protocol: 'all',
              port,
              action
            });
            rules.push({
              sourceNodeId: srcNodeId,
              targetNodeId: sgRule.source,
              protocol: 'icmp',
              port: 'ALL',
              action
            });
          }
        }
      }

      // Process inbound rules for target node
      for (const sgRule of nodeSgRules) {
        if (sgRule.type === 'inbound') {
          const action = sgRule.action || 'ALLOW';
          const port = sgRule.port || 'ALL';

          if (sgRule.source === '0.0.0.0/0') {
            // Inbound from anywhere
            for (const dstNodeId of nodeIds) {
              if (srcNodeId === dstNodeId) continue;
              rules.push({
                sourceNodeId: dstNodeId,
                targetNodeId: srcNodeId,
                protocol: 'all',
                port,
                action
              });
              rules.push({
                sourceNodeId: dstNodeId,
                targetNodeId: srcNodeId,
                protocol: 'icmp',
                port: 'ALL',
                action
              });
            }
          } else if (sgRule.source.startsWith('subnet-')) {
            // Inbound from subnet
            for (const dstNodeId of nodeIds) {
              if (config.nodeSubnetMap[dstNodeId] === sgRule.source) {
                rules.push({
                  sourceNodeId: dstNodeId,
                  targetNodeId: srcNodeId,
                  protocol: 'all',
                  port,
                  action
                });
                rules.push({
                  sourceNodeId: dstNodeId,
                  targetNodeId: srcNodeId,
                  protocol: 'icmp',
                  port: 'ALL',
                  action
                });
              }
            }
          } else {
            // Inbound from specific node ID
            rules.push({
              sourceNodeId: sgRule.source,
              targetNodeId: srcNodeId,
              protocol: 'all',
              port,
              action
            });
            rules.push({
              sourceNodeId: sgRule.source,
              targetNodeId: srcNodeId,
              protocol: 'icmp',
              port: 'ALL',
              action
            });
          }
        }
      }
    }

    // Sort rules: DENY actions first to ensure iptables matches DENY before ALLOW
    return rules.sort((a, b) => {
      if (a.action === 'DENY' && b.action === 'ALLOW') return -1;
      if (a.action === 'ALLOW' && b.action === 'DENY') return 1;
      return 0;
    });
  }
}
