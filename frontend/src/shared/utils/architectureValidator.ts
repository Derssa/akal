import type { ContainerData } from '../types';
import type { SecurityGroupRule } from '../../features/nodes/SecurityGroups/SecurityGroupsModal';

export interface VPC {
  id: string;
  name: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

export interface Subnet {
  id: string;
  name: string;
  type: 'public' | 'private';
  vpcId: string | null;
  position: { x: number; y: number };
  width: number;
  height: number;
  routes: Array<{ destination: string; target: string; description: string }>;
}

export interface NetworkConfig {
  vpcs: VPC[];
  subnets: Subnet[];
  nodeSubnetMap: Record<string, string>;
  nodeSecurityGroups: Record<string, SecurityGroupRule[]>;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  successes: string[];
}

export function validateArchitecture(
  networkConfig: NetworkConfig,
  containers: ContainerData[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const successes: string[] = [];

  const dbTypes = ['postgres', 'mysql'];

  // --- 1. ERROR CHECKS ---
  
  // Nodes must map to subnets that exist (if they map to one)
  containers.forEach(node => {
    const subnetId = networkConfig.nodeSubnetMap[node.id];
    if (subnetId && !subnetId.startsWith('vpc-')) {
      const subnet = networkConfig.subnets.find(s => s.id === subnetId);
      if (!subnet) {
        errors.push(`Node "${node.name}" is assigned to a subnet that does not exist.`);
      }
    }
  });

  // --- 2. WARNING CHECKS ---

  // DB in public subnet check
  containers.forEach(node => {
    const isDb = dbTypes.includes(node.type || '');
    if (isDb) {
      const subnetId = networkConfig.nodeSubnetMap[node.id];
      if (subnetId) {
        const subnet = networkConfig.subnets.find(s => s.id === subnetId);
        if (subnet && subnet.type === 'public') {
          warnings.push(`Database "${node.name}" is in a public subnet. For safety, database instances should be kept in private subnets.`);
        }
      }
    }
  });

  // Database 0.0.0.0/0 exposure check
  containers.forEach(node => {
    const isDb = dbTypes.includes(node.type || '');
    if (isDb) {
      const rules = networkConfig.nodeSecurityGroups[node.id] || [];
      const hasPublicAccess = rules.some(
        rule => rule.type === 'inbound' && rule.action === 'ALLOW' && rule.source === '0.0.0.0/0'
      );
      if (hasPublicAccess) {
        warnings.push(`Database "${node.name}" is exposed to the public internet (0.0.0.0/0) in its security group.`);
      }
    }
  });

  // Check for Redis/caching tier
  const hasCacheNode = containers.some(c => {
    const name = c.name.toLowerCase();
    return name.includes('redis') || name.includes('cache') || name.includes('memcached');
  });
  if (containers.length > 0 && !hasCacheNode) {
    // Only warn if there's at least one DB
    const hasDb = containers.some(c => dbTypes.includes(c.type || ''));
    if (hasDb) {
      warnings.push('No caching tier (e.g., Redis or Memcached) detected. Consider adding one to optimize database loads.');
    }
  }

  // Helper: check if node is client-facing / gateway
  const isPublicFacingNode = (node: ContainerData, subnetType?: 'public' | 'private') => {
    const name = node.name.toLowerCase();
    const isAppType = node.type === 'ubuntu';
    const hasPublicKeywords = name.includes('client') || name.includes('frontend') || name.includes('gateway') || name.includes('api') || name.includes('web') || name.includes('nginx') || name.includes('proxy');
    return isAppType && (subnetType === 'public' || hasPublicKeywords);
  };

  // Direct client-to-DB connection OR DB connection checks
  containers.forEach(dbNode => {
    const isDb = dbTypes.includes(dbNode.type || '');
    if (!isDb) return;

    const rules = networkConfig.nodeSecurityGroups[dbNode.id] || [];
    rules.forEach(rule => {
      if (rule.type === 'inbound' && rule.action === 'ALLOW') {
        const srcNode = containers.find(c => c.id === rule.source);
        if (srcNode) {
          const srcSubnetId = networkConfig.nodeSubnetMap[srcNode.id];
          const srcSubnet = networkConfig.subnets.find(s => s.id === srcSubnetId);
          if (isPublicFacingNode(srcNode, srcSubnet?.type)) {
            warnings.push(`Database "${dbNode.name}" receives direct connections from public-facing node "${srcNode.name}". Traffic should go through a backend application layer.`);
          }
        }
      }
    });
  });

  // --- 3. SUCCESS CHECKS ---
  // If we have a multi-tier layout:
  // Public Gateway/Frontend Node (in Public Subnet) -> App Backend Node (in Private Subnet) -> Database Node (in Private Subnet)
  let hasPublicFrontend = false;
  let hasPrivateBackend = false;
  let hasPrivateDb = false;

  let publicFrontendId = '';
  let privateBackendId = '';
  let privateDbId = '';

  containers.forEach(node => {
    const subnetId = networkConfig.nodeSubnetMap[node.id];
    const subnet = networkConfig.subnets.find(s => s.id === subnetId);
    if (!subnet) return;

    if (subnet.type === 'public' && isPublicFacingNode(node, 'public')) {
      hasPublicFrontend = true;
      publicFrontendId = node.id;
    } else if (subnet.type === 'private' && node.type === 'ubuntu' && !node.name.toLowerCase().includes('redis') && !node.name.toLowerCase().includes('cache')) {
      hasPrivateBackend = true;
      privateBackendId = node.id;
    } else if (subnet.type === 'private' && dbTypes.includes(node.type || '')) {
      hasPrivateDb = true;
      privateDbId = node.id;
    }
  });

  if (hasPublicFrontend && hasPrivateBackend && hasPrivateDb) {
    // Check flow: Frontend -> Backend -> DB
    const backendRules = networkConfig.nodeSecurityGroups[privateBackendId] || [];
    const dbRules = networkConfig.nodeSecurityGroups[privateDbId] || [];

    const isFrontendToBackend = backendRules.some(
      r => r.type === 'inbound' && r.action === 'ALLOW' && (r.source === publicFrontendId || r.source === networkConfig.nodeSubnetMap[publicFrontendId])
    );
    const isBackendToDb = dbRules.some(
      r => r.type === 'inbound' && r.action === 'ALLOW' && (r.source === privateBackendId || r.source === networkConfig.nodeSubnetMap[privateBackendId])
    );

    if (isFrontendToBackend && isBackendToDb) {
      // Check if DB is isolated from public frontend
      const directFromFrontendToDb = dbRules.some(
        r => r.type === 'inbound' && r.action === 'ALLOW' && (r.source === publicFrontendId || r.source === '0.0.0.0/0')
      );

      if (!directFromFrontendToDb) {
        successes.push('Secure 3-Tier VPC Architecture detected! (Public Gateway -> Private App Server -> Private Isolated Database)');
      }
    }
  }

  // Default success if everything is healthy and configured in subnets/VPCs
  if (errors.length === 0 && warnings.length === 0 && containers.length >= 2) {
    successes.push('VPC Network is fully valid and adheres to basic system design security guidelines!');
  }

  return { errors, warnings, successes };
}
