import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, BackgroundVariant, useNodesState } from '@xyflow/react';
import type { Node, Edge, ReactFlowInstance, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import UbuntuNode from '../../features/nodes/UbuntuNode/UbuntuNode';
import NatNode from '../../features/nodes/NatNode/NatNode';
import NatGatewayModal from '../../features/nodes/NatNode/NatGatewayModal';
import PostgresNode from '../../features/nodes/PostgresNode/PostgresNode';
import PostgresModal from '../../features/nodes/PostgresNode/PostgresModal';
import MysqlNode from '../../features/nodes/MysqlNode/MysqlNode';
import MysqlModal from '../../features/nodes/MysqlNode/MysqlModal';
import LoadBalancerNode from '../../features/nodes/LoadBalancerNode/LoadBalancerNode';
import LoadBalancerModal from '../../features/nodes/LoadBalancerNode/LoadBalancerModal';
import AsgNode from '../../features/nodes/AsgNode/AsgNode';
import AsgModal from '../../features/nodes/AsgNode/AsgModal';
import NodeLibrary from './components/NodeLibrary';
import { useContainers } from '../../shared/hooks/useContainers';
import { useToast } from '../../shared/hooks/useToast';
import { ToastNotification } from '../../shared/components/Toast';
import InputModal from '../../shared/components/InputModal';
import ConfirmModal from '../../shared/components/ConfirmModal';
import CanvasTopbar from './components/CanvasTopbar';
import CanvasFooter from './components/CanvasFooter';

// Phase 3 Imports
import VpcNode from '../../features/nodes/VpcNode/VpcNode';
import SubnetNode from '../../features/nodes/SubnetNode/SubnetNode';
import RoutingTableModal from '../../features/nodes/SubnetNode/RoutingTableModal';
import SecurityGroupsModal from '../../features/nodes/SecurityGroups/SecurityGroupsModal';
import type { SecurityGroupRule } from '../../features/nodes/SecurityGroups/SecurityGroupsModal';
import VpcModal from '../../features/nodes/VpcNode/VpcModal';
import type { VPCConfig } from '../../features/nodes/VpcNode/VpcModal';
import ButtonEdge from './components/ButtonEdge';
import { validateArchitecture } from '../../shared/utils/architectureValidator';
import { API_BASE } from '../../shared/types';

// Recursively calculate absolute coordinates of a node
const getAbsoluteCoordinates = (nodeId: string, currentNodes: Node[]): { x: number; y: number } => {
  const node = currentNodes.find(n => n.id === nodeId);
  if (!node) return { x: 0, y: 0 };
  if (!node.parentId) return node.position;
  const parentPos = getAbsoluteCoordinates(node.parentId, currentNodes);
  return {
    x: parentPos.x + node.position.x,
    y: parentPos.y + node.position.y
  };
};

interface CanvasPageProps {
  projectId: string;
  projectName: string;
  onBackToProjects: () => void;
  onTerminalOpen: (id: string, name: string) => void;
}

interface Subnet {
  id: string;
  name: string;
  type: 'public' | 'private';
  cidr?: string;
  vpcId: string | null;
  position: { x: number; y: number };
  width: number;
  height: number;
  columns?: number;
  rows?: number;
  routes: Array<{ destination: string; target: string; description: string }>;
}

interface NetworkConfig {
  vpcConfig: VPCConfig;
  subnets: Subnet[];
  nodeSubnetMap: Record<string, string>; // nodeId -> subnetId or vpcId
  nodeSecurityGroups: Record<string, SecurityGroupRule[]>; // nodeId -> SecurityGroupRule[]
  nodeIpMap: Record<string, string>; // nodeId -> ipAddress
  loadBalancerAlgorithms?: Record<string, 'round_robin' | 'least_conn'>;
  loadBalancerTargets?: Record<string, string[]>;
  loadBalancerTargetPorts?: Record<string, number>;
  loadBalancerRoutingRules?: Record<string, Array<{ path: string; targetId: string }>>;
  asgs?: Record<string, { desiredCapacity: number; minCapacity: number; maxCapacity: number; parentId: string; subnetIds: string[] }>;
}

function autoGrowContainers(
  config: NetworkConfig
): NetworkConfig {
  const updatedSubnets = config.subnets.map(subnet => {
    const cols = subnet.columns || 2;
    const rows = subnet.rows || 1;
    return {
      ...subnet,
      width: cols * 340,
      height: 70 + rows * 190
    };
  });

  return {
    ...config,
    subnets: updatedSubnets
  };
}

export default function CanvasPage({ projectId, projectName, onBackToProjects, onTerminalOpen }: CanvasPageProps) {
  const { toast, showNotification, showToast, dismissToast } = useToast();

  const {
    containers,
    loading,
    creating,
    fetchContainers,
    createContainer,
    startContainer,
    stopContainer,
    deleteContainer,
  } = useContainers({ projectId, onToast: showToast });

  // Modal and inspector states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [inspectingPostgres, setInspectingPostgres] = useState<{ id: string; name: string } | null>(null);
  const [inspectingMysql, setInspectingMysql] = useState<{ id: string; name: string } | null>(null);
  const [inspectingNat, setInspectingNat] = useState<{ id: string; name: string } | null>(null);
  const [inspectingLoadBalancer, setInspectingLoadBalancer] = useState<{ id: string; name: string } | null>(null);
  const [inspectingAsg, setInspectingAsg] = useState<{ id: string; name: string } | null>(null);

  // Phase 3 Modal states
  const [inspectingSubnet, setInspectingSubnet] = useState<{ id: string; name: string } | null>(null);
  const [inspectingSecurityGroup, setInspectingSecurityGroup] = useState<{ id: string; name: string; type: string } | null>(null);

  // Drag and drop tracking
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [dropState, setDropState] = useState<{ position: { x: number; y: number }; type: string } | null>(null);
  const dropPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const dropSubnetsRef = useRef<Record<string, string>>({});
  const pendingSubnetIdRef = useRef<string | null>(null);
  const dragStartPositionsRef = useRef<Record<string, { x: number; y: number; parentId?: string }>>({});
  const prevDbCountRef = useRef(0);
  const hasShownCacheWarningRef = useRef(false);
  const draggingNodeIdRef = useRef<string | null>(null);

  // React Flow managed nodes state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  // Ref to track saved positions (avoids re-render loops)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const defaultVpcConfig = useMemo(() => ({
    name: 'Main Network',
    cidr: '10.0.0.0/16',
    dnsEnabled: true,
    igwEnabled: true,
    description: 'Project-wide Virtual Private Cloud'
  }), []);

  // Network Simulation state
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>({
    vpcConfig: defaultVpcConfig,
    subnets: [],
    nodeSubnetMap: {},
    nodeSecurityGroups: {},
    nodeIpMap: {}
  });

  const [showVpcSettings, setShowVpcSettings] = useState(false);
  const [showTrafficSimulator, setShowTrafficSimulator] = useState(false);

  const nodeTypes = useMemo(() => ({
    ubuntu: UbuntuNode,
    postgres: PostgresNode,
    mysql: MysqlNode,
    nat: NatNode,
    vpc: VpcNode,
    subnet: SubnetNode,
    loadbalancer: LoadBalancerNode,
    autoscalinggroup: AsgNode
  }), []);

  const edgeTypes = useMemo(() => ({
    buttonEdge: ButtonEdge
  }), []);

  // Save/load network config helper
  const saveNetworkConfig = useCallback((newConfig: NetworkConfig) => {
    const grownConfig = autoGrowContainers(newConfig);
    setNetworkConfig(grownConfig);
    localStorage.setItem(`akal-lab-network-config-${projectId}`, JSON.stringify(grownConfig));

    // Sync to backend to trigger runtime enforcement
    return fetch(`${API_BASE}/api/projects/${projectId}/network-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ networkConfig: grownConfig })
    }).catch(err => {
      console.error('Failed to sync network configuration to backend:', err);
      throw err;
    });
  }, [projectId]);

  const triggerArchitectureAudit = useCallback((configToValidate: NetworkConfig) => {
    const result = validateArchitecture(configToValidate, containers);

    // Detect DB nodes count
    const currentDbCount = containers.filter(c => ['postgres', 'mysql'].includes(c.type || '')).length;
    if (currentDbCount > prevDbCountRef.current) {
      hasShownCacheWarningRef.current = false;
    }
    prevDbCountRef.current = currentDbCount;

    let warnings = result.warnings;
    const hasCacheWarning = warnings.some(w => w.includes('No caching tier'));

    if (hasCacheWarning) {
      if (hasShownCacheWarningRef.current) {
        // Filter it out so it doesn't toast again
        warnings = warnings.filter(w => !w.includes('No caching tier'));
      } else {
        // Mark as shown so subsequent non-add actions don't trigger it
        hasShownCacheWarningRef.current = true;
      }
    } else {
      if (currentDbCount === 0) {
        hasShownCacheWarningRef.current = false;
      }
    }

    if (result.errors.length > 0) {
      showNotification({ type: 'error', message: result.errors[0] });
    } else if (warnings.length > 0) {
      showNotification({ type: 'warning', message: warnings[0] });
    } else if (result.successes.length > 0) {
      showNotification({ type: 'success', message: result.successes[0] });
    }
  }, [containers, showNotification]);

  const handleDeleteSubnet = useCallback((subnetId: string) => {
    const hasNodes = Object.values(networkConfig.nodeSubnetMap).some(sid => sid === subnetId);
    if (hasNodes) {
      showNotification({
        type: 'error',
        message: 'Cannot delete subnet: Move or delete all nodes inside the subnet first.'
      });
      return;
    }

    const updatedSubnets = networkConfig.subnets.filter(s => s.id !== subnetId);
    const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    Object.keys(updatedNodeSubnetMap).forEach(k => {
      if (updatedNodeSubnetMap[k] === subnetId) delete updatedNodeSubnetMap[k];
    });
    const newConfig = { ...networkConfig, subnets: updatedSubnets, nodeSubnetMap: updatedNodeSubnetMap };
    saveNetworkConfig(newConfig);
    showToast("Subnet deleted successfully");
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit, showNotification]);

  const handleSubnetResize = useCallback((subnetId: string, dimension: 'columns' | 'rows', newValue: number) => {
    if (dimension === 'columns' && newValue < 2) return;
    if (dimension === 'rows' && newValue < 1) return;

    const subnet = networkConfig.subnets.find(s => s.id === subnetId);
    if (!subnet) return;

    const currentCols = subnet.columns || 2;
    const currentRows = subnet.rows || 1;

    let targetCols = currentCols;
    let targetRows = currentRows;
    if (dimension === 'columns') targetCols = newValue;
    if (dimension === 'rows') targetRows = newValue;

    // Verify if any node inside this subnet lies outside the new boundaries
    if (targetCols < currentCols || targetRows < currentRows) {
      const subnetNodes = containers.filter(c => networkConfig.nodeSubnetMap[c.id] === subnetId);
      for (const node of subnetNodes) {
        const pos = positionsRef.current[node.id];
        if (pos) {
          const col = Math.round((pos.x - 60) / 340);
          const row = Math.round((pos.y - 60) / 190);
          if (col >= targetCols || row >= targetRows) {
            showNotification({
              type: 'error',
              message: `Cannot shrink grid. You should remove the node with name '${node.name}' to be able to reduce the size`
            });
            return;
          }
        }
      }
    }

    const updatedSubnets = networkConfig.subnets.map(s => {
      if (s.id === subnetId) {
        const cols = dimension === 'columns' ? newValue : (s.columns || 2);
        const rows = dimension === 'rows' ? newValue : (s.rows || 1);
        return {
          ...s,
          columns: cols,
          rows: rows,
          width: cols * 340,
          height: 70 + rows * 190
        };
      }
      return s;
    });

    const newConfig = { ...networkConfig, subnets: updatedSubnets };
    saveNetworkConfig(newConfig);
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, containers, saveNetworkConfig, triggerArchitectureAudit, showNotification]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    const match = edgeId.match(/^edge-([^-]+)-([^-]+)-(.+)$/);
    if (!match) return;
    const [, sourceId, targetId, port] = match;

    const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };
    if (updatedSecurityGroups[targetId]) {
      updatedSecurityGroups[targetId] = updatedSecurityGroups[targetId].filter(rule => {
        return !(rule.type === 'inbound' && rule.action === 'ALLOW' && rule.port === port && (rule.source === sourceId || rule.source === '0.0.0.0/0'));
      });
      const newConfig = { ...networkConfig, nodeSecurityGroups: updatedSecurityGroups };
      saveNetworkConfig(newConfig);
      showToast("Firewall connection removed");
      triggerArchitectureAudit(newConfig);
    }
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit]);

  // Dynamic Edges builder representing firewall rules
  const edges = useMemo(() => {
    const edgesList: Edge[] = [];

    containers.forEach(destNode => {
      if (destNode.type === 'nat') return;
      const destRules = networkConfig.nodeSecurityGroups[destNode.id] || [];
      const destSubnetId = networkConfig.nodeSubnetMap[destNode.id];
      if (!destSubnetId) return;
      const destSubnet = networkConfig.subnets.find(s => s.id === destSubnetId);
      const destVpcId = destSubnet?.vpcId;
      if (!destVpcId) return;

      const inboundAllowRules = destRules.filter(r => r.type === 'inbound' && r.action === 'ALLOW');

      inboundAllowRules.forEach(rule => {
        containers.forEach(srcNode => {
          if (srcNode.id === destNode.id) return;
          if (srcNode.type === 'nat') return;

          const srcSubnetId = networkConfig.nodeSubnetMap[srcNode.id];
          if (!srcSubnetId) return;
          const srcSubnet = networkConfig.subnets.find(s => s.id === srcSubnetId);
          const srcVpcId = srcSubnet?.vpcId;

          // Must be in the same VPC
          if (srcVpcId !== destVpcId) return;

          // Check if source matches rule
          let isMatch = false;
          if (rule.source === '0.0.0.0/0') {
            isMatch = true;
          } else if (rule.source === srcSubnetId) {
            isMatch = true;
          } else if (rule.source === srcNode.id) {
            isMatch = true;
          }

          if (isMatch) {
            const edgeId = `edge-${srcNode.id}-${destNode.id}-${rule.port}`;
            if (!edgesList.some(e => e.id === edgeId)) {
              edgesList.push({
                id: edgeId,
                source: srcNode.id,
                target: destNode.id,
                type: 'buttonEdge',
                data: { onDelete: handleDeleteEdge },
                animated: true,
                label: `Port ${rule.port}`,
                style: { stroke: '#10B981', strokeWidth: 2 },
                labelStyle: { fill: '#374151', fontSize: 9, fontWeight: 700 }
              });
            }
          }
        });
      });
    });

    return edgesList;
  }, [containers, networkConfig, handleDeleteEdge]);

  // Handle manual connection line draws (automatically updates security group)
  const onConnect = useCallback((connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target) return;
    const targetNode = containers.find(n => n.id === target);
    const sourceNode = containers.find(n => n.id === source);
    if (!targetNode) return;
    const targetType = targetNode.type || 'ubuntu';
    
    const isDb = ['postgres', 'mysql'].includes(targetType);
    const defaultProtocol = isDb ? 'TCP' : 'ALL';
    const defaultPort = targetType === 'postgres' ? '5432' : targetType === 'mysql' ? '3306' : 'ALL';

    const currentRules = networkConfig.nodeSecurityGroups[target] || [];
    const alreadyExists = currentRules.some(r => r.type === 'inbound' && r.action === 'ALLOW' && r.port === defaultPort && r.source === source);
    if (alreadyExists) return;

    const newRule: SecurityGroupRule = {
      id: `rule-${Math.random().toString(36).substr(2, 9)}`,
      type: 'inbound',
      action: 'ALLOW',
      protocol: defaultProtocol,
      port: defaultPort,
      source: source
    };

    const updatedSecurityGroups = {
      ...networkConfig.nodeSecurityGroups,
      [target]: [newRule, ...currentRules]
    };
    const newConfig = { ...networkConfig, nodeSecurityGroups: updatedSecurityGroups };
    saveNetworkConfig(newConfig);
    const sourceName = sourceNode?.name || source;
    showToast(`Security Group: Allowed ${defaultPort === 'ALL' ? 'all traffic' : `Port ${defaultPort}`} inbound from ${sourceName}`);
    triggerArchitectureAudit(newConfig);
  }, [containers, networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit]);

  // Handle connection line deletion (removes matching firewall rule)
  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };
    let changed = false;

    deletedEdges.forEach(edge => {
      const targetId = edge.target;
      const sourceId = edge.source;

      if (updatedSecurityGroups[targetId]) {
        updatedSecurityGroups[targetId] = updatedSecurityGroups[targetId].filter(rule => {
          const isMatch = rule.type === 'inbound' && rule.action === 'ALLOW' && (rule.source === sourceId || rule.source === '0.0.0.0/0');
          if (isMatch) changed = true;
          return !isMatch;
        });
      }
    });

    if (changed) {
      const newConfig = { ...networkConfig, nodeSecurityGroups: updatedSecurityGroups };
      saveNetworkConfig(newConfig);
      showToast("Firewall rule removed");
      triggerArchitectureAudit(newConfig);
    }
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit]);

  const allocateIpForNode = (nodeId: string, subnetId: string, currentConfig: NetworkConfig): string => {
    const subnet = currentConfig.subnets.find(s => s.id === subnetId);
    if (!subnet) return '';
    const cidr = subnet.cidr || '10.99.1.0/24';
    const match = cidr.match(/^(\d+\.\d+\.\d+)\./);
    if (!match) return '';
    const prefix = match[1] + '.';

    const existingIp = currentConfig.nodeIpMap?.[nodeId];
    if (existingIp && existingIp.startsWith(prefix)) {
      return existingIp;
    }

    const assignedIps = Object.entries(currentConfig.nodeIpMap || {})
      .filter(([nid, ip]) => currentConfig.nodeSubnetMap[nid] === subnetId && ip.startsWith(prefix))
      .map(([, ip]) => {
        const parts = ip.split('.');
        return parseInt(parts[3], 10);
      });

    let suffix = 2;
    while (assignedIps.includes(suffix)) {
      suffix++;
    }

    return `${prefix}${suffix}`;
  };

  // Helper to generate default security group rules for network nodes (deny all inbound by default)
  const initDefaultRules = () => {
    return [
      {
        id: `rule-${Math.random().toString(36).substr(2, 9)}`,
        type: 'inbound' as const,
        action: 'DENY' as const,
        protocol: 'ALL' as const,
        port: 'ALL',
        source: '0.0.0.0/0'
      },
      {
        id: `rule-${Math.random().toString(36).substr(2, 9)}`,
        type: 'outbound' as const,
        action: 'ALLOW' as const,
        protocol: 'ALL' as const,
        port: 'ALL',
        source: '0.0.0.0/0'
      }
    ];
  };

  // Load saved positions, network configurations and start polling
  useEffect(() => {
    fetchContainers();
    const savedLayout = localStorage.getItem(`akal-lab-graph-layout-${projectId}`);
    if (savedLayout) {
      try {
        positionsRef.current = JSON.parse(savedLayout);
      } catch (err) {
        console.error(err);
      }
    }

    // Fetch network config from backend, fallback to localStorage if unavailable
    fetch(`${API_BASE}/api/projects/${projectId}/network-config`)
      .then(res => res.json())
      .then(data => {
        if (data && data.vpcConfig) {
          setNetworkConfig(data);
        } else {
          const savedConfig = localStorage.getItem(`akal-lab-network-config-${projectId}`);
          if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            if (!parsed.vpcConfig) {
              parsed.vpcConfig = defaultVpcConfig;
            }
            setNetworkConfig(parsed);
          } else {
            setNetworkConfig({
              vpcConfig: defaultVpcConfig,
              subnets: [],
              nodeSubnetMap: {},
              nodeSecurityGroups: {},
              nodeIpMap: {}
            });
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch network config from backend, using localStorage:', err);
        const savedConfig = localStorage.getItem(`akal-lab-network-config-${projectId}`);
        if (savedConfig) {
          try {
            const parsed = JSON.parse(savedConfig);
            if (!parsed.vpcConfig) {
              parsed.vpcConfig = defaultVpcConfig;
            }
            setNetworkConfig(parsed);
          } catch (e) {
            console.error(e);
          }
        }
      });

    const timer = setInterval(fetchContainers, 4000);
    return () => clearInterval(timer);
  }, [projectId, fetchContainers, defaultVpcConfig]);

  // Sync container data into React Flow nodes when containers change
  useEffect(() => {
    let configChanged = false;
    const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };
    const updatedNodeIpMap = { ...networkConfig.nodeIpMap || {} };

    // Map dropped container positions or subnets if pending
    containers.forEach(c => {
      if (dropSubnetsRef.current[c.name]) {
        const subnetId = dropSubnetsRef.current[c.name];
        updatedNodeSubnetMap[c.id] = subnetId;

        // Auto-configure default security rules on drop
        if (!updatedSecurityGroups[c.id] || updatedSecurityGroups[c.id].length === 0) {
          updatedSecurityGroups[c.id] = initDefaultRules();
        }

        const tempConfig = { ...networkConfig, nodeSubnetMap: updatedNodeSubnetMap, nodeIpMap: updatedNodeIpMap };
        const allocatedIp = allocateIpForNode(c.id, subnetId, tempConfig);
        updatedNodeIpMap[c.id] = allocatedIp;

        delete dropSubnetsRef.current[c.name];
        configChanged = true;
      }
    });

    if (configChanged) {
      saveNetworkConfig({
        ...networkConfig,
        nodeSubnetMap: updatedNodeSubnetMap,
        nodeSecurityGroups: updatedSecurityGroups,
        nodeIpMap: updatedNodeIpMap
      });
    }

    setNodes(prevNodes => {
      // 1. Map Subnet nodes
      const subnetNodes = networkConfig.subnets.map(subnet => {
        const existing = prevNodes.find(n => n.id === subnet.id);
        return {
          ...existing,
          id: subnet.id,
          type: 'subnet',
          parentId: undefined,
          position: subnet.position,
          style: { width: subnet.width, height: subnet.height },
          data: {
            id: subnet.id,
            name: subnet.name,
            type: subnet.type,
            cidr: subnet.cidr,
            width: subnet.width,
            height: subnet.height,
            columns: subnet.columns || 2,
            rows: subnet.rows || 1,
            onManageRoutes: (id: string, name: string) => {
              setInspectingSubnet({ id, name });
            },
            onDelete: handleDeleteSubnet,
            onResize: handleSubnetResize
          }
        };
      });

      // 2. Map container nodes
      const containerNodes = containers.filter(c => !c.isAsgInstance).map((c, index) => {
        const existing = prevNodes.find(n => n.id === c.id);
        const defaultX = 150 + (index % 3) * 280;
        const defaultY = 150 + Math.floor(index / 3) * 220;

        const savedPos = positionsRef.current[c.name];
        const dropPos = dropPositionsRef.current[c.name];
        if (dropPos) {
          positionsRef.current[c.name] = dropPos;
          delete dropPositionsRef.current[c.name];
        }

        const parentId = updatedNodeSubnetMap[c.id] || undefined;
        const isDragging = draggingNodeIdRef.current === c.id;

        let position = dropPos || savedPos || existing?.position || { x: defaultX, y: defaultY };

        // Auto-layout grid for subnet children (if not currently dragging)
        if (parentId && parentId.startsWith('subnet-') && !isDragging) {
          const subnet = networkConfig.subnets.find(s => s.id === parentId);
          const cols = subnet?.columns || 2;
          const rows = subnet?.rows || 1;

          const pos = positionsRef.current[c.name];
          let col = -1;
          let row = -1;
          if (pos) {
            col = Math.round((pos.x - 60) / 340);
            row = Math.round((pos.y - 60) / 190);
          }

          const isOccupied = (colIdx: number, rowIdx: number, excludeId: string) => {
            return containers.filter(node => !node.isAsgInstance).some(node => {
              if (node.id === excludeId) return false;
              if (updatedNodeSubnetMap[node.id] !== parentId) return false;
              const nodePos = positionsRef.current[node.name];
              if (!nodePos) return false;
              const nCol = Math.round((nodePos.x - 60) / 340);
              const nRow = Math.round((nodePos.y - 60) / 190);
              return nCol === colIdx && nRow === rowIdx;
            });
          };

          if (col < 0 || col >= cols || row < 0 || row >= rows) {
            let found = false;
            for (let r = 0; r < rows; r++) {
              for (let cp = 0; cp < cols; cp++) {
                if (!isOccupied(cp, r, c.id)) {
                  col = cp;
                  row = r;
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
            if (!found) {
              col = 0;
              row = 0;
            }
          }

          position = {
            x: 60 + col * 340,
            y: 60 + row * 190
          };
          positionsRef.current[c.name] = position;
        }

        const nodeType = c.type || 'ubuntu';
        const subnet = parentId ? networkConfig.subnets.find(s => s.id === parentId) : undefined;
        const subnetType = subnet?.type || 'private';

        const nodeConfig = nodeType === 'loadbalancer' ? {
          loadBalancerAlgorithm: networkConfig.loadBalancerAlgorithms?.[c.id],
          loadBalancerTargets: networkConfig.loadBalancerTargets?.[c.id],
          loadBalancerTargetPort: networkConfig.loadBalancerTargetPorts?.[c.id],
        } : undefined;

        const asgConfig = nodeType === 'autoscalinggroup' ? networkConfig.asgs?.[c.id] : undefined;
        let parentName = '';
        if (asgConfig && asgConfig.parentId) {
          const parentNode = containers.find(tc => tc.id === asgConfig.parentId);
          if (parentNode) parentName = parentNode.name;
        }
        const instanceCount = containers.filter(tc => tc.asgId === c.id && tc.isAsgInstance).length;
 
        return {
          ...existing,
          id: c.id,
          type: nodeType,
          parentId,
          position,
          data: {
            id: c.id,
            name: c.name,
            state: c.state,
            status: c.status,
            port: c.port,
            ip: networkConfig.nodeIpMap?.[c.id] || 'pending',
            subnetType,
            config: nodeConfig,
            asgConfig: asgConfig ? { ...asgConfig, parentName } : undefined,
            instanceCount,
            onStart: startContainer,
            onStop: stopContainer,
            onDelete: (id: string) => {
              const usingAsgs = Object.keys(networkConfig?.asgs || {}).filter(asgId => networkConfig?.asgs?.[asgId]?.parentId === id);
              const hasActiveAsg = usingAsgs.some(asgId => {
                const container = containers.find(c => c.id === asgId);
                return container && container.state === 'running';
              });
              if (hasActiveAsg) {
                showNotification({
                  type: 'error',
                  message: `Cannot delete node: it is used as a template by an active Auto Scaling Group. Please stop the ASG first.`
                });
                return;
              }
              setDeleteTarget(id);
            },
            onTerminalOpen: (nodeType === 'loadbalancer' || nodeType === 'autoscalinggroup') ? () => {} : onTerminalOpen,
            onInspect: (id: string, name: string) => {
              if (nodeType === 'mysql') {
                setInspectingMysql({ id, name });
              } else if (nodeType === 'postgres') {
                setInspectingPostgres({ id, name });
              } else if (nodeType === 'nat') {
                setInspectingNat({ id, name });
              } else if (nodeType === 'loadbalancer') {
                setInspectingLoadBalancer({ id, name });
              } else if (nodeType === 'autoscalinggroup') {
                setInspectingAsg({ id, name });
              }
            },
            onSecurityGroupOpen: (id: string, name: string) => {
              setInspectingSecurityGroup({ id, name, type: nodeType });
            }
          },
        };
      });

      return [...subnetNodes, ...containerNodes];
    });

    // Save current positions (including auto-placed new nodes) to localStorage
    localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));
  }, [projectId, containers, startContainer, stopContainer, onTerminalOpen, setNodes, networkConfig, saveNetworkConfig, handleDeleteSubnet, handleSubnetResize]);



  // Track start position on drag start to allow rollback/reversion if drop is invalid
  const onNodeDragStart = useCallback((_event: any, node: Node) => {
    draggingNodeIdRef.current = node.id;
    dragStartPositionsRef.current[node.id] = {
      x: node.position.x,
      y: node.position.y,
      parentId: node.parentId
    };
  }, []);

  const onNodeDrag = useCallback((_event: any, draggedNode: Node) => {
    if (!reactFlowInstance) return;

    const currentNodes = reactFlowInstance.getNodes();

    // Calculate absolute coordinates of dragged node center
    let absX = draggedNode.position.x;
    let absY = draggedNode.position.y;
    if (draggedNode.parentId) {
      const parentPos = getAbsoluteCoordinates(draggedNode.parentId, currentNodes);
      absX += parentPos.x;
      absY += parentPos.y;
    }

    const nodeWidth = draggedNode.width || (draggedNode.type === 'subnet' ? 260 : 220);
    const nodeHeight = draggedNode.height || (draggedNode.type === 'subnet' ? 180 : 140);
    const centerX = absX + nodeWidth / 2;
    const centerY = absY + nodeHeight / 2;

    let hoveredId: string | null = null;
    let isValid = false;

    // Check intersection with subnets
    if (draggedNode.type !== 'subnet') {
      // Service node dragged
      for (const subnet of networkConfig.subnets) {
        const subnetAbsX = subnet.position.x;
        const subnetAbsY = subnet.position.y;
        if (
          centerX >= subnetAbsX &&
          centerX <= subnetAbsX + subnet.width &&
          centerY >= subnetAbsY &&
          centerY <= subnetAbsY + subnet.height
        ) {
          hoveredId = subnet.id;
          isValid = true;
          break;
        }
      }
    } else if (draggedNode.type === 'subnet') {
      // Subnet dragged: Check if dropped inside another subnet (invalid)
      for (const subnet of networkConfig.subnets) {
        if (subnet.id === draggedNode.id) continue;
        const subnetAbsX = subnet.position.x;
        const subnetAbsY = subnet.position.y;
        if (
          centerX >= subnetAbsX &&
          centerX <= subnetAbsX + subnet.width &&
          centerY >= subnetAbsY &&
          centerY <= subnetAbsY + subnet.height
        ) {
          hoveredId = subnet.id;
          isValid = false; // invalid!
          break;
        }
      }
    }

    // Update real-time position in coordinates map for auto-growing calculations
    const tempNodeSubnetMap = { ...networkConfig.nodeSubnetMap };

    // If we are hovering a valid container, assume it's parented temporarily for sizing check
    if (hoveredId && isValid) {
      tempNodeSubnetMap[draggedNode.id] = hoveredId;
    } else if (draggedNode.type !== 'subnet') {
      // Dragging service node outside of any container
      delete tempNodeSubnetMap[draggedNode.id];
    }





    const tempConfig = {
      ...networkConfig,
      nodeSubnetMap: tempNodeSubnetMap
    };

    const grownConfig = autoGrowContainers(tempConfig);

    setNodes(prev => prev.map(n => {
      // Apply grew sizes to subnets
      if (n.type === 'subnet') {
        const subnet = grownConfig.subnets.find(s => s.id === n.id);
        const isHoverTarget = n.id === hoveredId;
        return {
          ...n,
          style: { ...n.style, width: subnet?.width, height: subnet?.height },
          data: {
            ...n.data,
            hoverStatus: isHoverTarget ? (isValid ? 'valid' : 'invalid') : null
          }
        };
      }
      return n;
    }));

  }, [reactFlowInstance, networkConfig, containers, setNodes]);

  // Save position to ref and localStorage when drag ends (auto-save with overlapping logic)
  const onNodeDragStop = useCallback((_event: any, draggedNode: Node) => {
    draggingNodeIdRef.current = null;
    if (!reactFlowInstance) return;

    const currentNodes = reactFlowInstance.getNodes();

    // Reset all hoverStatus
    setNodes(prev => prev.map(n => {
      if (n.data && n.data.hoverStatus) {
        return { ...n, data: { ...n.data, hoverStatus: null } };
      }
      return n;
    }));

    // Calculate final absolute coordinates of dragged node
    let absX = draggedNode.position.x;
    let absY = draggedNode.position.y;
    if (draggedNode.parentId) {
      const parentPos = getAbsoluteCoordinates(draggedNode.parentId, currentNodes);
      absX += parentPos.x;
      absY += parentPos.y;
    }

    const revertNode = (message: string) => {
      showNotification({ type: 'error', message });
      const original = dragStartPositionsRef.current[draggedNode.id];
      if (original) {
        setNodes(prev => prev.map(n => {
          if (n.id === draggedNode.id) {
            return {
              ...n,
              position: { x: original.x, y: original.y },
              parentId: original.parentId
            };
          }
          return n;
        }));
      }
    };

    if (draggedNode.type === 'subnet') {
      const subnetWidth = 260;
      const subnetHeight = 180;
      const subnetCenterX = absX + subnetWidth / 2;
      const subnetCenterY = absY + subnetHeight / 2;

      // Check if dropped inside another subnet
      let insideAnotherSubnet = false;
      for (const subnet of networkConfig.subnets) {
        if (subnet.id === draggedNode.id) continue;
        const subnetAbsX = subnet.position.x;
        const subnetAbsY = subnet.position.y;
        if (
          subnetCenterX >= subnetAbsX &&
          subnetCenterX <= subnetAbsX + subnet.width &&
          subnetCenterY >= subnetAbsY &&
          subnetCenterY <= subnetAbsY + subnet.height
        ) {
          insideAnotherSubnet = true;
          break;
        }
      }

      if (insideAnotherSubnet) {
        revertNode('Invalid placement: Subnets cannot be nested inside other subnets.');
        return;
      }

      const updatedSubnets = networkConfig.subnets.map(s => {
        if (s.id === draggedNode.id) {
          return {
            ...s,
            position: { x: absX, y: absY }
          };
        }
        return s;
      });

      const newConfig = { ...networkConfig, subnets: updatedSubnets };
      saveNetworkConfig(newConfig);
      triggerArchitectureAudit(newConfig);
    }
    else {
      // Container/Service node
      const nodeCenterX = absX + 110;
      const nodeCenterY = absY + 70;

      let targetSubnetId: string | null = null;
      let targetSubnetAbsPos = { x: 0, y: 0 };

      for (const subnet of networkConfig.subnets) {
        const subnetAbsX = subnet.position.x;
        const subnetAbsY = subnet.position.y;

        if (
          nodeCenterX >= subnetAbsX &&
          nodeCenterX <= subnetAbsX + subnet.width &&
          nodeCenterY >= subnetAbsY &&
          nodeCenterY <= subnetAbsY + subnet.height
        ) {
          targetSubnetId = subnet.id;
          targetSubnetAbsPos = { x: subnetAbsX, y: subnetAbsY };
          break;
        }
      }

      const original = dragStartPositionsRef.current[draggedNode.id];
      const oldParentId = original?.parentId;
      const newParentId = targetSubnetId || undefined;

      if (oldParentId !== newParentId) {
        const oldSubnet = networkConfig.subnets.find(s => s.id === oldParentId);
        const newSubnet = networkConfig.subnets.find(s => s.id === newParentId);

        if (oldParentId && oldParentId.startsWith('subnet-')) {
          showNotification({ type: 'warning', message: `Node "${draggedNode.data.name}" removed from Subnet "${oldSubnet?.name || 'Subnet'}"` });
        }

        if (newParentId && newParentId.startsWith('subnet-')) {
          showNotification({ type: 'success', message: `Node "${draggedNode.data.name}" added to Subnet "${newSubnet?.name || 'Subnet'}"` });
        }
      }

      const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
      const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };
      const updatedNodeIpMap = { ...networkConfig.nodeIpMap || {} };

      if (targetSubnetId) {
        updatedNodeSubnetMap[draggedNode.id] = targetSubnetId;

        const subnet = networkConfig.subnets.find(s => s.id === targetSubnetId);
        const cols = subnet?.columns || 2;
        const rows = subnet?.rows || 1;

        const relX = absX - targetSubnetAbsPos.x;
        const relY = absY - targetSubnetAbsPos.y;

        const col = Math.max(0, Math.min(cols - 1, Math.round((relX - 60) / 340)));
        const row = Math.max(0, Math.min(rows - 1, Math.round((relY - 60) / 190)));

        const key = (draggedNode.type === 'subnet' ? draggedNode.id : draggedNode.data?.name) as string;
        positionsRef.current[key] = {
          x: 60 + col * 340,
          y: 60 + row * 190
        };

        // Automatically setup default firewall connections when dragged into subnet
        if (!updatedSecurityGroups[draggedNode.id] || updatedSecurityGroups[draggedNode.id].length === 0) {
          updatedSecurityGroups[draggedNode.id] = initDefaultRules();
        }

        const tempConfig = {
          ...networkConfig,
          nodeSubnetMap: updatedNodeSubnetMap,
          nodeIpMap: updatedNodeIpMap
        };
        const allocatedIp = allocateIpForNode(draggedNode.id, targetSubnetId, tempConfig);
        updatedNodeIpMap[draggedNode.id] = allocatedIp;
      } else {
        // Revert container node drag to its original subnet position
        showNotification({ type: 'warning', message: 'Nodes must reside within a subnet.' });
        const original = dragStartPositionsRef.current[draggedNode.id];
        if (original) {
          setNodes(prev => prev.map(n => {
            if (n.id === draggedNode.id) {
              return {
                ...n,
                position: { x: original.x, y: original.y },
                parentId: original.parentId
              };
            }
            return n;
          }));
        }
        return;
      }

      localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));
      const newConfig = {
        ...networkConfig,
        nodeSubnetMap: updatedNodeSubnetMap,
        nodeSecurityGroups: updatedSecurityGroups,
        nodeIpMap: updatedNodeIpMap
      };
      saveNetworkConfig(newConfig);
      triggerArchitectureAudit(newConfig);
    }
  }, [reactFlowInstance, networkConfig, projectId, saveNetworkConfig, setNodes, triggerArchitectureAudit, showNotification]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const blockedNode = deleted.find(node => {
      const usingAsgs = Object.keys(networkConfig?.asgs || {}).filter(asgId => networkConfig?.asgs?.[asgId]?.parentId === node.id);
      return usingAsgs.some(asgId => {
        const container = containers.find(c => c.id === asgId);
        return container && container.state === 'running';
      });
    });

    if (blockedNode) {
      showNotification({
        type: 'error',
        message: `Cannot delete node "${blockedNode.data?.name || 'Node'}": it is used as a template by an active Auto Scaling Group. Please stop the ASG first.`
      });
      fetchContainers();
      return;
    }

    let updatedSubnets = [...networkConfig.subnets];
    const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };
    const updatedNodeIpMap = { ...networkConfig.nodeIpMap || {} };
    let configChanged = false;

    deleted.forEach(node => {
      if (node.type === 'subnet') {
        updatedSubnets = updatedSubnets.filter(s => s.id !== node.id);
        Object.keys(updatedNodeSubnetMap).forEach(nodeId => {
          if (updatedNodeSubnetMap[nodeId] === node.id) {
            delete updatedNodeSubnetMap[nodeId];
            delete updatedNodeIpMap[nodeId];
          }
        });
        configChanged = true;
      }
      // If it's a node being deleted directly
      if (updatedNodeSubnetMap[node.id]) {
        delete updatedNodeSubnetMap[node.id];
        delete updatedNodeIpMap[node.id];
        configChanged = true;
      }
    });

    if (configChanged || deleted.length > 0) {
      saveNetworkConfig({
        ...networkConfig,
        subnets: updatedSubnets,
        nodeSubnetMap: updatedNodeSubnetMap,
        nodeSecurityGroups: updatedSecurityGroups,
        nodeIpMap: updatedNodeIpMap
      });
    }
  }, [networkConfig, saveNetworkConfig, containers, fetchContainers, showNotification]);

  const saveGraphLocally = () => {
    const currentPositions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      if (n.type !== 'subnet') {
        currentPositions[n.id] = { x: n.position.x, y: n.position.y };
      }
    });
    positionsRef.current = currentPositions;
    localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(currentPositions));
    showToast('Graph layout saved successfully');
  };

  const handleCreateNode = async (name: string) => {
    const exists = containers.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      showNotification({
        type: 'error',
        message: `A node named "${name}" already exists in this project.`
      });
      return;
    }

    setShowCreateModal(false);
    const type = dropState?.type || 'ubuntu';
    const position = dropState?.position;

    if (position) {
      dropPositionsRef.current[name] = position;
    }

    let targetSubnetId: string | undefined = undefined;
    if (pendingSubnetIdRef.current) {
      dropSubnetsRef.current[name] = pendingSubnetIdRef.current;
      targetSubnetId = pendingSubnetIdRef.current;
      pendingSubnetIdRef.current = null;
    }

    setDropState(null);
    await createContainer(name, type, targetSubnetId);
  };

  const handleCancelCreate = () => {
    setShowCreateModal(false);
    setDropState(null);
    pendingSubnetIdRef.current = null;
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    const success = await deleteContainer(id);
    if (success) {
      delete positionsRef.current[id];
      localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));

      const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
      delete updatedNodeSubnetMap[id];
      const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };
      delete updatedSecurityGroups[id];
      const updatedNodeIpMap = { ...networkConfig.nodeIpMap || {} };
      delete updatedNodeIpMap[id];
      saveNetworkConfig({
        ...networkConfig,
        nodeSubnetMap: updatedNodeSubnetMap,
        nodeSecurityGroups: updatedSecurityGroups,
        nodeIpMap: updatedNodeIpMap
      });
    }
  };

  // React Flow Drag-and-Drop handlers
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (type === 'subnet-public' || type === 'subnet-private') {
        const isPublic = type === 'subnet-public';
        const cols = 2;
        const rows = 1;
        const subnetWidth = cols * 340;
        const subnetHeight = 70 + rows * 190;
        const subnetCenterX = position.x + subnetWidth / 2;
        const subnetCenterY = position.y + subnetHeight / 2;

        // Check if dropped inside another subnet
        let insideAnotherSubnet = false;
        for (const subnet of networkConfig.subnets) {
          const subnetAbsX = subnet.position.x;
          const subnetAbsY = subnet.position.y;
          if (
            subnetCenterX >= subnetAbsX &&
            subnetCenterX <= subnetAbsX + subnet.width &&
            subnetCenterY >= subnetAbsY &&
            subnetCenterY <= subnetAbsY + subnet.height
          ) {
            insideAnotherSubnet = true;
            break;
          }
        }

        if (insideAnotherSubnet) {
          showNotification({ type: 'error', message: 'Invalid placement: Subnets cannot be nested inside other subnets.' });
          return;
        }

        const newSubnet: Subnet = {
          id: `subnet-${Math.random().toString(36).substr(2, 9)}`,
          name: `${isPublic ? 'Public' : 'Private'} Subnet-${networkConfig.subnets.length + 1}`,
          type: isPublic ? 'public' : 'private',
          cidr: `10.0.${networkConfig.subnets.length + 1}.0/24`,
          vpcId: 'root-vpc',
          position: position,
          width: subnetWidth,
          height: subnetHeight,
          columns: cols,
          rows: rows,
          routes: [
            { destination: '10.0.0.0/16', target: 'local', description: 'Local VPC routing' },
            ...(isPublic ? [{ destination: '0.0.0.0/0', target: 'igw', description: 'Internet access' }] : [])
          ]
        };

        const newConfig = {
          ...networkConfig,
          subnets: [...networkConfig.subnets, newSubnet]
        };
        saveNetworkConfig(newConfig);
        triggerArchitectureAudit(newConfig);
      } else {
        const nodeCenterX = position.x + 110;
        const nodeCenterY = position.y + 70;

        let targetSubnetId: string | null = null;
        let targetSubnetAbsPos = { x: 0, y: 0 };

        for (const subnet of networkConfig.subnets) {
          const subnetAbsX = subnet.position.x;
          const subnetAbsY = subnet.position.y;

          if (
            nodeCenterX >= subnetAbsX &&
            nodeCenterX <= subnetAbsX + subnet.width &&
            nodeCenterY >= subnetAbsY &&
            nodeCenterY <= subnetAbsY + subnet.height
          ) {
            targetSubnetId = subnet.id;
            targetSubnetAbsPos = { x: subnetAbsX, y: subnetAbsY };
            break;
          }
        }

        if (!targetSubnetId) {
          showNotification({ type: 'error', message: 'Nodes must reside within a subnet.' });
          return;
        }

        let finalDropPos = position;
        if (targetSubnetId) {
          const subnet = networkConfig.subnets.find(s => s.id === targetSubnetId);
          const cols = subnet?.columns || 2;
          const rows = subnet?.rows || 1;

          const relX = position.x - targetSubnetAbsPos.x;
          const relY = position.y - targetSubnetAbsPos.y;

          const col = Math.max(0, Math.min(cols - 1, Math.round((relX - 60) / 340)));
          const row = Math.max(0, Math.min(rows - 1, Math.round((relY - 60) / 190)));

          finalDropPos = {
            x: 60 + col * 340,
            y: 60 + row * 190
          };
        }

        setDropState({ position: finalDropPos, type });
        pendingSubnetIdRef.current = targetSubnetId;
        setShowCreateModal(true);
      }
    },
    [reactFlowInstance, networkConfig, saveNetworkConfig, showNotification, triggerArchitectureAudit]
  );



  return (
    <div style={styles.wrapper}>
      <CanvasTopbar
        projectName={projectName}
        loading={loading}
        creating={creating}
        onBack={onBackToProjects}
        onRefresh={fetchContainers}
        onSave={saveGraphLocally}
        onConfigureVpc={() => setShowVpcSettings(true)}
        onSimulateTraffic={() => setShowTrafficSimulator(true)}
      />

      <div style={styles.bodyWrapper}>
        {/* Main React Flow Workspace */}
        <div
          style={styles.canvasContainer}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {/* Floating VPC Header */}
          <div style={styles.floatingHeader} className="glass">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>Project:</span>
              <span style={{ color: '#374151' }}>{projectName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid rgba(0, 0, 0, 0.1)', paddingLeft: '12px' }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>VPC:</span>
              <span style={{ color: '#2563EB', fontWeight: 500 }}>{networkConfig.vpcConfig.name}</span>
              <span style={{ fontSize: '11px', color: '#4B5563', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                {networkConfig.vpcConfig.cidr}
              </span>
            </div>
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} color="#C0C0C0" gap={24} size={1.5} />
            <Controls />
          </ReactFlow>
        </div>

        <NodeLibrary />
      </div>

      <CanvasFooter containers={containers} />

      {/* Modals */}
      {showCreateModal && (
        <InputModal
          title={
            dropState?.type === 'postgres'
              ? "Create PostgreSQL Node"
              : dropState?.type === 'mysql'
                ? "Create MySQL Node"
                : dropState?.type === 'nat'
                  ? "Create NAT Gateway Node"
                  : dropState?.type === 'loadbalancer'
                    ? "Create Load Balancer Node"
                    : dropState?.type === 'autoscalinggroup'
                      ? "Create Auto Scaling Group Node"
                      : "Create Ubuntu Node"
          }
          label="Give your new container a descriptive name."
          placeholder={
            dropState?.type === 'postgres'
              ? "e.g. pg-db, main-store"
              : dropState?.type === 'mysql'
                ? "e.g. mysql-db, orders"
                : dropState?.type === 'nat'
                  ? "e.g. nat-gateway, internet-exit"
                  : dropState?.type === 'loadbalancer'
                    ? "e.g. alb, web-lb"
                    : dropState?.type === 'autoscalinggroup'
                      ? "e.g. asg-web, main-scaling"
                      : "e.g. web-server, api-gateway"
          }
          defaultValue={
            (() => {
              const type = dropState?.type || 'ubuntu';
              const prefix =
                type === 'postgres'
                  ? 'postgres-'
                  : type === 'mysql'
                    ? 'mysql-'
                    : type === 'nat'
                      ? 'NAT-'
                      : type === 'loadbalancer'
                        ? 'alb-'
                        : type === 'autoscalinggroup'
                          ? 'asg-'
                          : 'server-';
              let suffix = 1;
              while (containers.some(c => c.name === `${prefix}${suffix}`)) {
                suffix++;
              }
              return `${prefix}${suffix}`;
            })()
          }
          submitText="Create Node"
          onSubmit={handleCreateNode}
          onCancel={handleCancelCreate}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Container"
          message="This will permanently stop and remove this container. This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {inspectingPostgres && (
        <PostgresModal
          containerId={inspectingPostgres.id}
          nodeName={inspectingPostgres.name}
          projectId={projectId}
          onClose={() => setInspectingPostgres(null)}
        />
      )}

      {inspectingMysql && (
        <MysqlModal
          containerId={inspectingMysql.id}
          nodeName={inspectingMysql.name}
          projectId={projectId}
          onClose={() => setInspectingMysql(null)}
        />
      )}

      {inspectingNat && (
        <NatGatewayModal
          nodeName={inspectingNat.name}
          ipAddress={networkConfig.nodeIpMap?.[inspectingNat.id]}
          state={containers.find(c => c.id === inspectingNat.id)?.state || 'stopped'}
          onClose={() => setInspectingNat(null)}
        />
      )}

       {inspectingLoadBalancer && (
        <LoadBalancerModal
          containerId={inspectingLoadBalancer.id}
          nodeName={inspectingLoadBalancer.name}
          ipAddress={networkConfig.nodeIpMap?.[inspectingLoadBalancer.id]}
          port={containers.find(c => c.id === inspectingLoadBalancer.id)?.port}
          state={containers.find(c => c.id === inspectingLoadBalancer.id)?.state || 'stopped'}
          config={{
            loadBalancerAlgorithm: networkConfig.loadBalancerAlgorithms?.[inspectingLoadBalancer.id],
            loadBalancerTargets: networkConfig.loadBalancerTargets?.[inspectingLoadBalancer.id],
            loadBalancerTargetPort: networkConfig.loadBalancerTargetPorts?.[inspectingLoadBalancer.id],
            loadBalancerRoutingRules: networkConfig.loadBalancerRoutingRules?.[inspectingLoadBalancer.id]
          }}
          allNodes={containers}
          onClose={() => setInspectingLoadBalancer(null)}
          onSaveConfig={async (algorithm, targets, targetPort, routingRules) => {
            const updatedAlgorithms = {
              ...(networkConfig.loadBalancerAlgorithms || {}),
              [inspectingLoadBalancer.id]: algorithm
            };
            const updatedTargets = {
              ...(networkConfig.loadBalancerTargets || {}),
              [inspectingLoadBalancer.id]: targets
            };
            const updatedTargetPorts = {
              ...(networkConfig.loadBalancerTargetPorts || {}),
              [inspectingLoadBalancer.id]: targetPort
            };
            const updatedRoutingRules = {
              ...(networkConfig.loadBalancerRoutingRules || {}),
              [inspectingLoadBalancer.id]: routingRules
            };
            const newConfig = {
              ...networkConfig,
              loadBalancerAlgorithms: updatedAlgorithms,
              loadBalancerTargets: updatedTargets,
              loadBalancerTargetPorts: updatedTargetPorts,
              loadBalancerRoutingRules: updatedRoutingRules
            };
            await saveNetworkConfig(newConfig);
            showToast("Load Balancer configuration applied");
            triggerArchitectureAudit(newConfig);
          }}
        />
      )}

      {inspectingAsg && (
        <AsgModal
          asgId={inspectingAsg.id}
          nodeName={inspectingAsg.name}
          projectId={projectId}
          config={networkConfig}
          containers={containers}
          onClose={() => setInspectingAsg(null)}
          onSaveConfig={async (asgConfig) => {
            const updatedAsgs = {
              ...(networkConfig.asgs || {}),
              [inspectingAsg.id]: asgConfig
            };
            const newConfig = {
              ...networkConfig,
              asgs: updatedAsgs
            };
            await saveNetworkConfig(newConfig);
            showToast("Auto Scaling Group configuration saved");
            triggerArchitectureAudit(newConfig);
          }}
          onRefreshContainers={fetchContainers}
        />
      )}

      {/* Phase 3 Modals */}
      {inspectingSubnet && (
        <RoutingTableModal
          subnetId={inspectingSubnet.id}
          subnetName={inspectingSubnet.name}
          routes={networkConfig.subnets.find(s => s.id === inspectingSubnet.id)?.routes || []}
          natGateways={containers.filter(c => c.type === 'nat').map(c => c.name)}
          onClose={() => setInspectingSubnet(null)}
          onSave={async (updatedRoutes) => {
            const updatedSubnets = networkConfig.subnets.map(s => {
              if (s.id === inspectingSubnet.id) {
                return { ...s, routes: updatedRoutes };
              }
              return s;
            });
            await saveNetworkConfig({ ...networkConfig, subnets: updatedSubnets });
          }}
        />
      )}

      {inspectingSecurityGroup && (
        <SecurityGroupsModal
          nodeId={inspectingSecurityGroup.id}
          nodeName={inspectingSecurityGroup.name}
          nodeType={inspectingSecurityGroup.type}
          allNodes={containers}
          allSubnets={networkConfig.subnets.map(s => ({ id: s.id, name: s.name }))}
          rules={networkConfig.nodeSecurityGroups[inspectingSecurityGroup.id] || []}
          onClose={() => setInspectingSecurityGroup(null)}
          onSaveRules={(rules) => {
            const updatedSecurityGroups = {
              ...networkConfig.nodeSecurityGroups,
              [inspectingSecurityGroup.id]: rules
            };
            const newConfig = { ...networkConfig, nodeSecurityGroups: updatedSecurityGroups };
            saveNetworkConfig(newConfig);
            triggerArchitectureAudit(newConfig);
          }}
        />
      )}

      {showVpcSettings && (
        <VpcModal
          vpcConfig={networkConfig.vpcConfig}
          subnets={networkConfig.subnets}
          nodes={containers}
          nodeSecurityGroups={networkConfig.nodeSecurityGroups}
          nodeSubnetMap={networkConfig.nodeSubnetMap}
          onClose={() => setShowVpcSettings(false)}
          onSaveVpcConfig={(config) => {
            const newConfig = { ...networkConfig, vpcConfig: config };
            saveNetworkConfig(newConfig);
            setShowVpcSettings(false);
            showToast("VPC configuration saved");
            triggerArchitectureAudit(newConfig);
          }}
          initialTab="info"
        />
      )}

      {showTrafficSimulator && (
        <VpcModal
          vpcConfig={networkConfig.vpcConfig}
          subnets={networkConfig.subnets}
          nodes={containers}
          nodeSecurityGroups={networkConfig.nodeSecurityGroups}
          nodeSubnetMap={networkConfig.nodeSubnetMap}
          onClose={() => setShowTrafficSimulator(false)}
          onSaveVpcConfig={(config) => {
            const newConfig = { ...networkConfig, vpcConfig: config };
            saveNetworkConfig(newConfig);
            setShowTrafficSimulator(false);
            showToast("VPC configuration saved");
            triggerArchitectureAudit(newConfig);
          }}
          initialTab="simulator"
        />
      )}

      {toast && (
        <ToastNotification type={toast.type} message={toast.message} onDismiss={dismissToast} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    position: 'relative',
  },
  bodyWrapper: {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    height: 'calc(100% - 57px)',
    width: '100%',
    overflow: 'hidden',
  },
  canvasContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  floatingHeader: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    borderRadius: 8,
    border: '1px solid rgba(229, 231, 235, 0.5)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },
};
