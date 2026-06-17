import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, BackgroundVariant, useNodesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import UbuntuNode from '../../features/nodes/UbuntuNode/UbuntuNode';
import PostgresNode from '../../features/nodes/PostgresNode/PostgresNode';
import PostgresModal from '../../features/nodes/PostgresNode/PostgresModal';
import MysqlNode from '../../features/nodes/MysqlNode/MysqlNode';
import MysqlModal from '../../features/nodes/MysqlNode/MysqlModal';
import NodeLibrary from './components/NodeLibrary';
import { useContainers } from '../../shared/hooks/useContainers';
import { useToast, ToastNotification } from '../../shared/components/Toast';
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
import { validateArchitecture } from '../../shared/utils/architectureValidator';

interface CanvasPageProps {
  projectId: string;
  projectName: string;
  onBackToProjects: () => void;
  onTerminalOpen: (id: string, name: string) => void;
}

interface VPC {
  id: string;
  name: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

interface Subnet {
  id: string;
  name: string;
  type: 'public' | 'private';
  vpcId: string | null;
  position: { x: number; y: number };
  width: number;
  height: number;
  routes: Array<{ destination: string; target: string; description: string }>;
}

interface NetworkConfig {
  vpcs: VPC[];
  subnets: Subnet[];
  nodeSubnetMap: Record<string, string>; // nodeId -> subnetId
  nodeSecurityGroups: Record<string, SecurityGroupRule[]>; // nodeId -> SecurityGroupRule[]
}

function autoGrowContainers(
  config: NetworkConfig,
  containers: any[],
  positions: Record<string, { x: number; y: number }>
): NetworkConfig {
  const defaultSubnetWidth = 260;
  const defaultSubnetHeight = 180;
  const defaultVpcWidth = 600;
  const defaultVpcHeight = 400;

  const paddingRight = 40;
  const paddingBottom = 80;

  // 1. Grow Subnets based on nested services
  const updatedSubnets = config.subnets.map(subnet => {
    const subnetNodes = containers.filter(c => config.nodeSubnetMap[c.id] === subnet.id);
    if (subnetNodes.length === 0) {
      return { ...subnet, width: defaultSubnetWidth, height: defaultSubnetHeight };
    }

    let maxRight = defaultSubnetWidth - paddingRight;
    let maxBottom = defaultSubnetHeight - paddingBottom;

    subnetNodes.forEach(node => {
      const pos = positions[node.id];
      if (pos) {
        // Node size is roughly 220x140
        const right = pos.x + 220;
        const bottom = pos.y + 140;
        if (right > maxRight) maxRight = right;
        if (bottom > maxBottom) maxBottom = bottom;
      }
    });

    return {
      ...subnet,
      width: Math.max(defaultSubnetWidth, maxRight + paddingRight),
      height: Math.max(defaultSubnetHeight, maxBottom + paddingBottom)
    };
  });

  // 2. Grow VPCs based on nested subnets and direct service nodes
  const updatedVpcs = config.vpcs.map(vpc => {
    const vpcSubnets = updatedSubnets.filter(s => s.vpcId === vpc.id);
    const vpcDirectNodes = containers.filter(c => config.nodeSubnetMap[c.id] === vpc.id);

    let maxRight = defaultVpcWidth - paddingRight;
    let maxBottom = defaultVpcHeight - paddingBottom;

    vpcSubnets.forEach(subnet => {
      const right = subnet.position.x + subnet.width;
      const bottom = subnet.position.y + subnet.height;
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    });

    vpcDirectNodes.forEach(node => {
      const pos = positions[node.id];
      if (pos) {
        const right = pos.x + 220;
        const bottom = pos.y + 140;
        if (right > maxRight) maxRight = right;
        if (bottom > maxBottom) maxBottom = bottom;
      }
    });

    return {
      ...vpc,
      width: Math.max(defaultVpcWidth, maxRight + paddingRight),
      height: Math.max(defaultVpcHeight, maxBottom + paddingBottom)
    };
  });

  return {
    ...config,
    subnets: updatedSubnets,
    vpcs: updatedVpcs
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

  // Phase 3 Modal states
  const [inspectingSubnet, setInspectingSubnet] = useState<{ id: string; name: string } | null>(null);
  const [inspectingSecurityGroup, setInspectingSecurityGroup] = useState<{ id: string; name: string; type: string } | null>(null);
  const [inspectingVpc, setInspectingVpc] = useState<{ id: string; name: string } | null>(null);

  // Drag and drop tracking
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [dropState, setDropState] = useState<{ position: { x: number; y: number }; type: string } | null>(null);
  const dropPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const dropSubnetsRef = useRef<Record<string, string>>({});
  const pendingSubnetIdRef = useRef<string | null>(null);
  const dragStartPositionsRef = useRef<Record<string, { x: number; y: number; parentId?: string }>>({});

  // React Flow managed nodes state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  // Ref to track saved positions (avoids re-render loops)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // Network Simulation state
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>({
    vpcs: [],
    subnets: [],
    nodeSubnetMap: {},
    nodeSecurityGroups: {}
  });

  const nodeTypes = useMemo(() => ({ 
    ubuntu: UbuntuNode,
    postgres: PostgresNode,
    mysql: MysqlNode,
    vpc: VpcNode,
    subnet: SubnetNode
  }), []);

  // Save/load network config helper
  const saveNetworkConfig = useCallback((newConfig: NetworkConfig) => {
    const grownConfig = autoGrowContainers(newConfig, containers, positionsRef.current);
    setNetworkConfig(grownConfig);
    localStorage.setItem(`akal-lab-network-config-${projectId}`, JSON.stringify(grownConfig));
  }, [projectId, containers]);

  const triggerArchitectureAudit = useCallback((configToValidate: NetworkConfig) => {
    const result = validateArchitecture(configToValidate, containers);
    if (result.errors.length > 0) {
      showNotification({ type: 'error', message: result.errors[0] });
    } else if (result.warnings.length > 0) {
      showNotification({ type: 'warning', message: result.warnings[0] });
    } else if (result.successes.length > 0) {
      showNotification({ type: 'success', message: result.successes[0] });
    }
  }, [containers, showNotification]);

  // VPC and Subnet direct deletion handlers
  const handleDeleteVpc = useCallback((vpcId: string) => {
    const updatedVpcs = networkConfig.vpcs.filter(v => v.id !== vpcId);
    const updatedSubnets = networkConfig.subnets.map(s => {
      if (s.vpcId === vpcId) return { ...s, vpcId: null };
      return s;
    });
    const newConfig = { ...networkConfig, vpcs: updatedVpcs, subnets: updatedSubnets };
    saveNetworkConfig(newConfig);
    showToast("VPC deleted successfully");
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit]);

  const handleDeleteSubnet = useCallback((subnetId: string) => {
    const updatedSubnets = networkConfig.subnets.filter(s => s.id !== subnetId);
    const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    Object.keys(updatedNodeSubnetMap).forEach(k => {
      if (updatedNodeSubnetMap[k] === subnetId) delete updatedNodeSubnetMap[k];
    });
    const newConfig = { ...networkConfig, subnets: updatedSubnets, nodeSubnetMap: updatedNodeSubnetMap };
    saveNetworkConfig(newConfig);
    showToast("Subnet deleted successfully");
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit]);

  // Dynamic Edges builder representing firewall rules
  const edges = useMemo(() => {
    const edgesList: Edge[] = [];
    
    containers.forEach(destNode => {
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
  }, [containers, networkConfig]);

  // Handle manual connection line draws (automatically updates security group)
  const onConnect = useCallback((connection: any) => {
    const { source, target } = connection;
    const targetNode = containers.find(n => n.id === target);
    if (!targetNode) return;
    const targetType = targetNode.type || 'ubuntu';
    const defaultPort = targetType === 'postgres' ? '5432' : targetType === 'mysql' ? '3306' : '80';

    const currentRules = networkConfig.nodeSecurityGroups[target] || [];
    const alreadyExists = currentRules.some(r => r.type === 'inbound' && r.action === 'ALLOW' && r.port === defaultPort && r.source === source);
    if (alreadyExists) return;

    const newRule: SecurityGroupRule = {
      id: `rule-${Math.random().toString(36).substr(2, 9)}`,
      type: 'inbound',
      action: 'ALLOW',
      port: defaultPort,
      source: source
    };

    const updatedSecurityGroups = {
      ...networkConfig.nodeSecurityGroups,
      [target]: [...currentRules, newRule]
    };
    const newConfig = { ...networkConfig, nodeSecurityGroups: updatedSecurityGroups };
    saveNetworkConfig(newConfig);
    showToast(`Security Group: Allowed Port ${defaultPort} inbound from ${targetNode.name}`);
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

  // Helper to generate default security group rules for network nodes
  const initDefaultRules = (nodeId: string, nodeType: string, subnetId: string) => {
    const defaultPort = nodeType === 'postgres' ? '5432' : nodeType === 'mysql' ? '3306' : '80';
    return [
      {
        id: `rule-${Math.random().toString(36).substr(2, 9)}`,
        type: 'inbound' as const,
        action: 'ALLOW' as const,
        port: defaultPort,
        source: subnetId
      },
      {
        id: `rule-${Math.random().toString(36).substr(2, 9)}`,
        type: 'outbound' as const,
        action: 'ALLOW' as const,
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

    const savedConfig = localStorage.getItem(`akal-lab-network-config-${projectId}`);
    if (savedConfig) {
      try {
        setNetworkConfig(JSON.parse(savedConfig));
      } catch (err) {
        console.error(err);
      }
    } else {
      setNetworkConfig({
        vpcs: [],
        subnets: [],
        nodeSubnetMap: {},
        nodeSecurityGroups: {}
      });
    }

    const timer = setInterval(fetchContainers, 4000);
    return () => clearInterval(timer);
  }, [projectId, fetchContainers]);

  // Sync container data into React Flow nodes when containers change
  useEffect(() => {
    let configChanged = false;
    const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };

    // Map dropped container positions or subnets if pending
    containers.forEach(c => {
      if (dropSubnetsRef.current[c.name]) {
        const subnetId = dropSubnetsRef.current[c.name];
        updatedNodeSubnetMap[c.id] = subnetId;
        
        // Auto-configure default security rules on drop
        if (!updatedSecurityGroups[c.id] || updatedSecurityGroups[c.id].length === 0) {
          updatedSecurityGroups[c.id] = initDefaultRules(c.id, c.type || 'ubuntu', subnetId);
        }

        delete dropSubnetsRef.current[c.name];
        configChanged = true;
      }
    });

    if (configChanged) {
      saveNetworkConfig({ ...networkConfig, nodeSubnetMap: updatedNodeSubnetMap, nodeSecurityGroups: updatedSecurityGroups });
    }

    setNodes(prevNodes => {
      // 1. Map VPC nodes
      const vpcNodes = networkConfig.vpcs.map(vpc => {
        const existing = prevNodes.find(n => n.id === vpc.id);
        return {
          ...existing,
          id: vpc.id,
          type: 'vpc',
          position: vpc.position,
          style: { width: vpc.width, height: vpc.height },
          data: {
            id: vpc.id,
            name: vpc.name,
            onConfigure: (id: string, name: string) => {
              setInspectingVpc({ id, name });
            },
            onDelete: handleDeleteVpc
          }
        };
      });

      // 2. Map Subnet nodes
      const subnetNodes = networkConfig.subnets.map(subnet => {
        const existing = prevNodes.find(n => n.id === subnet.id);
        return {
          ...existing,
          id: subnet.id,
          type: 'subnet',
          parentId: subnet.vpcId || undefined,
          position: subnet.position,
          style: { width: subnet.width, height: subnet.height },
          data: {
            id: subnet.id,
            name: subnet.name,
            type: subnet.type,
            onManageRoutes: (id: string, name: string) => {
              setInspectingSubnet({ id, name });
            },
            onDelete: handleDeleteSubnet
          }
        };
      });

      // 3. Map container nodes
      const containerNodes = containers.map((c, index) => {
        const existing = prevNodes.find(n => n.id === c.id);
        const defaultX = 150 + (index % 3) * 280;
        const defaultY = 150 + Math.floor(index / 3) * 220;
        
        const savedPos = positionsRef.current[c.id];
        const dropPos = dropPositionsRef.current[c.name];
        if (dropPos) {
          positionsRef.current[c.id] = dropPos;
          delete dropPositionsRef.current[c.name];
        }

                const position = dropPos || savedPos || existing?.position || { x: defaultX, y: defaultY };
        const nodeType = c.type || 'ubuntu';
        const parentId = updatedNodeSubnetMap[c.id] || undefined;

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
            onStart: startContainer,
            onStop: stopContainer,
            onDelete: (id: string) => setDeleteTarget(id),
            onTerminalOpen: onTerminalOpen,
            onInspect: (id: string, name: string) => {
              if (nodeType === 'mysql') {
                setInspectingMysql({ id, name });
              } else {
                setInspectingPostgres({ id, name });
              }
            },
            onSecurityGroupOpen: (id: string, name: string) => {
              setInspectingSecurityGroup({ id, name, type: nodeType });
            }
          },
        };
      });

      return [...vpcNodes, ...subnetNodes, ...containerNodes];
    });
  }, [containers, startContainer, stopContainer, onTerminalOpen, setNodes, networkConfig, saveNetworkConfig, handleDeleteVpc, handleDeleteSubnet]);

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

  // Track start position on drag start to allow rollback/reversion if drop is invalid
  const onNodeDragStart = useCallback((_event: any, node: Node) => {
    dragStartPositionsRef.current[node.id] = {
      x: node.position.x,
      y: node.position.y,
      parentId: node.parentId
    };
  }, []);

  // Save position to ref and localStorage when drag ends (auto-save with overlapping logic)
  const onNodeDragStop = useCallback((_event: any, draggedNode: Node) => {
    if (!reactFlowInstance) return;

    const currentNodes = reactFlowInstance.getNodes();

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

    if (draggedNode.type === 'vpc') {
      // VPC cannot overlap or be nested inside another VPC
      const vpcCenterX = absX + 300; // 600/2
      const vpcCenterY = absY + 200; // 400/2
      let insideAnotherVpc = false;
      for (const vpc of networkConfig.vpcs) {
        if (vpc.id === draggedNode.id) continue;
        if (
          vpcCenterX >= vpc.position.x &&
          vpcCenterX <= vpc.position.x + vpc.width &&
          vpcCenterY >= vpc.position.y &&
          vpcCenterY <= vpc.position.y + vpc.height
        ) {
          insideAnotherVpc = true;
          break;
        }
      }

      if (insideAnotherVpc) {
        revertNode('Invalid placement: VPC cannot be nested inside another VPC.');
        return;
      }

      const updatedVpcs = networkConfig.vpcs.map(v => {
        if (v.id === draggedNode.id) {
          return { ...v, position: { x: absX, y: absY } };
        }
        return v;
      });
      const newConfig = { ...networkConfig, vpcs: updatedVpcs };
      saveNetworkConfig(newConfig);
      triggerArchitectureAudit(newConfig);
    }
    else if (draggedNode.type === 'subnet') {
      const vpcWidth = 600;
      const vpcHeight = 400;
      const subnetWidth = 260;
      const subnetHeight = 180;
      const subnetCenterX = absX + subnetWidth / 2;
      const subnetCenterY = absY + subnetHeight / 2;

      let targetVpcId: string | null = null;
      let targetVpcPos = { x: 0, y: 0 };

      for (const vpc of networkConfig.vpcs) {
        if (
          subnetCenterX >= vpc.position.x &&
          subnetCenterX <= vpc.position.x + vpcWidth &&
          subnetCenterY >= vpc.position.y &&
          subnetCenterY <= vpc.position.y + vpcHeight
        ) {
          targetVpcId = vpc.id;
          targetVpcPos = vpc.position;
          break;
        }
      }

      if (!targetVpcId) {
        revertNode('Invalid placement: Subnets must reside inside a VPC boundary.');
        return;
      }

      // Check if dropped inside another subnet
      let insideAnotherSubnet = false;
      for (const subnet of networkConfig.subnets) {
        if (subnet.id === draggedNode.id) continue;
        let subnetAbsX = subnet.position.x;
        let subnetAbsY = subnet.position.y;
        if (subnet.vpcId) {
          const parentVpc = networkConfig.vpcs.find(v => v.id === subnet.vpcId);
          if (parentVpc) {
            subnetAbsX += parentVpc.position.x;
            subnetAbsY += parentVpc.position.y;
          }
        }
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
          const finalPos = { x: absX - targetVpcPos.x, y: absY - targetVpcPos.y };
          return {
            ...s,
            vpcId: targetVpcId,
            position: finalPos
          };
        }
        return s;
      });

      const newConfig = { ...networkConfig, subnets: updatedSubnets };
      saveNetworkConfig(newConfig);
      triggerArchitectureAudit(newConfig);
    }
    else {
      // Container node
      const subnetWidth = 260;
      const subnetHeight = 180;
      const nodeCenterX = absX + 120;
      const nodeCenterY = absY + 60;

      let targetSubnetId: string | null = null;
      let targetSubnetAbsPos = { x: 0, y: 0 };

      for (const subnet of networkConfig.subnets) {
        let subnetAbsX = subnet.position.x;
        let subnetAbsY = subnet.position.y;
        if (subnet.vpcId) {
          const parentVpc = networkConfig.vpcs.find(v => v.id === subnet.vpcId);
          if (parentVpc) {
            subnetAbsX += parentVpc.position.x;
            subnetAbsY += parentVpc.position.y;
          }
        }

        if (
          nodeCenterX >= subnetAbsX &&
          nodeCenterX <= subnetAbsX + subnetWidth &&
          nodeCenterY >= subnetAbsY &&
          nodeCenterY <= subnetAbsY + subnetHeight
        ) {
          targetSubnetId = subnet.id;
          targetSubnetAbsPos = { x: subnetAbsX, y: subnetAbsY };
          break;
        }
      }

      // Check if it is inside any VPC directly
      let targetVpcId: string | null = null;
      if (!targetSubnetId) {
        for (const vpc of networkConfig.vpcs) {
          if (
            nodeCenterX >= vpc.position.x &&
            nodeCenterX <= vpc.position.x + 600 &&
            nodeCenterY >= vpc.position.y &&
            nodeCenterY <= vpc.position.y + 400
          ) {
            targetVpcId = vpc.id;
            break;
          }
        }
      }

      if (!targetSubnetId && !targetVpcId) {
        revertNode('Invalid placement: Service nodes must reside inside a VPC boundary.');
        return;
      }

      const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
      const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };

      if (targetSubnetId) {
        updatedNodeSubnetMap[draggedNode.id] = targetSubnetId;
        positionsRef.current[draggedNode.id] = {
          x: absX - targetSubnetAbsPos.x,
          y: absY - targetSubnetAbsPos.y
        };

        // Automatically setup default firewall connections when dragged into subnet
        if (!updatedSecurityGroups[draggedNode.id] || updatedSecurityGroups[draggedNode.id].length === 0) {
          updatedSecurityGroups[draggedNode.id] = initDefaultRules(draggedNode.id, draggedNode.type || 'ubuntu', targetSubnetId);
        }
      } else {
        delete updatedNodeSubnetMap[draggedNode.id];
        positionsRef.current[draggedNode.id] = { x: absX, y: absY };
      }

      localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));
      const newConfig = { ...networkConfig, nodeSubnetMap: updatedNodeSubnetMap, nodeSecurityGroups: updatedSecurityGroups };
      saveNetworkConfig(newConfig);
      triggerArchitectureAudit(newConfig);
    }
  }, [reactFlowInstance, networkConfig, projectId, saveNetworkConfig, setNodes, triggerArchitectureAudit, showNotification]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    let updatedVpcs = [...networkConfig.vpcs];
    let updatedSubnets = [...networkConfig.subnets];
    const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };
    let configChanged = false;

    deleted.forEach(node => {
      if (node.type === 'vpc') {
        updatedVpcs = updatedVpcs.filter(v => v.id !== node.id);
        updatedSubnets = updatedSubnets.map(s => {
          if (s.vpcId === node.id) {
            configChanged = true;
            return { ...s, vpcId: null };
          }
          return s;
        });
        configChanged = true;
      } else if (node.type === 'subnet') {
        updatedSubnets = updatedSubnets.filter(s => s.id !== node.id);
        Object.keys(updatedNodeSubnetMap).forEach(nodeId => {
          if (updatedNodeSubnetMap[nodeId] === node.id) {
            delete updatedNodeSubnetMap[nodeId];
          }
        });
        configChanged = true;
      }
    });

    if (configChanged || deleted.length > 0) {
      saveNetworkConfig({
        vpcs: updatedVpcs,
        subnets: updatedSubnets,
        nodeSubnetMap: updatedNodeSubnetMap,
        nodeSecurityGroups: updatedSecurityGroups
      });
    }
  }, [networkConfig, saveNetworkConfig]);

  const saveGraphLocally = () => {
    const currentPositions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      // Only persist container nodes to the direct container coordinates JSON
      if (n.type !== 'vpc' && n.type !== 'subnet') {
        currentPositions[n.id] = { x: n.position.x, y: n.position.y };
      }
    });
    positionsRef.current = currentPositions;
    localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(currentPositions));
    showToast('Graph layout saved successfully');
  };

  const handleCreateNode = async (name: string) => {
    setShowCreateModal(false);
    const type = dropState?.type || 'ubuntu';
    const position = dropState?.position;

    if (position) {
      dropPositionsRef.current[name] = position;
    }

    if (pendingSubnetIdRef.current) {
      dropSubnetsRef.current[name] = pendingSubnetIdRef.current;
      pendingSubnetIdRef.current = null;
    }

    setDropState(null);
    await createContainer(name, type);
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
      saveNetworkConfig({
        ...networkConfig,
        nodeSubnetMap: updatedNodeSubnetMap,
        nodeSecurityGroups: updatedSecurityGroups
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

      if (type === 'vpc') {
        const vpcCenterX = position.x + 300;
        const vpcCenterY = position.y + 200;
        let insideAnotherVpc = false;
        for (const vpc of networkConfig.vpcs) {
          if (
            vpcCenterX >= vpc.position.x &&
            vpcCenterX <= vpc.position.x + vpc.width &&
            vpcCenterY >= vpc.position.y &&
            vpcCenterY <= vpc.position.y + vpc.height
          ) {
            insideAnotherVpc = true;
            break;
          }
        }

        if (insideAnotherVpc) {
          showNotification({ type: 'error', message: 'Invalid placement: VPC cannot be nested inside another VPC.' });
          return;
        }

        const newVpc: VPC = {
          id: `vpc-${Math.random().toString(36).substr(2, 9)}`,
          name: `VPC-${networkConfig.vpcs.length + 1}`,
          position,
          width: 600,
          height: 400
        };
        const newConfig = {
          ...networkConfig,
          vpcs: [...networkConfig.vpcs, newVpc]
        };
        saveNetworkConfig(newConfig);
        triggerArchitectureAudit(newConfig);
      } else if (type === 'subnet-public' || type === 'subnet-private') {
        const isPublic = type === 'subnet-public';
        const subnetWidth = 260;
        const subnetHeight = 180;
        const subnetCenterX = position.x + subnetWidth / 2;
        const subnetCenterY = position.y + subnetHeight / 2;

        let targetVpcId: string | null = null;
        let targetVpcPos = { x: 0, y: 0 };

        for (const vpc of networkConfig.vpcs) {
          if (
            subnetCenterX >= vpc.position.x &&
            subnetCenterX <= vpc.position.x + 600 &&
            subnetCenterY >= vpc.position.y &&
            subnetCenterY <= vpc.position.y + 400
          ) {
            targetVpcId = vpc.id;
            targetVpcPos = vpc.position;
            break;
          }
        }

        if (!targetVpcId) {
          showNotification({ type: 'error', message: 'Invalid placement: Subnets must reside inside a VPC boundary.' });
          return;
        }

        // Check if dropped inside another subnet
        let insideAnotherSubnet = false;
        for (const subnet of networkConfig.subnets) {
          let subnetAbsX = subnet.position.x;
          let subnetAbsY = subnet.position.y;
          if (subnet.vpcId) {
            const parentVpc = networkConfig.vpcs.find(v => v.id === subnet.vpcId);
            if (parentVpc) {
              subnetAbsX += parentVpc.position.x;
              subnetAbsY += parentVpc.position.y;
            }
          }
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
          vpcId: targetVpcId,
          position: { x: position.x - targetVpcPos.x, y: position.y - targetVpcPos.y },
          width: subnetWidth,
          height: subnetHeight,
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
        const subnetWidth = 260;
        const subnetHeight = 180;
        const nodeCenterX = position.x + 120;
        const nodeCenterY = position.y + 60;

        let targetSubnetId: string | null = null;
        let targetSubnetAbsPos = { x: 0, y: 0 };

        for (const subnet of networkConfig.subnets) {
          let subnetAbsX = subnet.position.x;
          let subnetAbsY = subnet.position.y;
          if (subnet.vpcId) {
            const parentVpc = networkConfig.vpcs.find(v => v.id === subnet.vpcId);
            if (parentVpc) {
              subnetAbsX += parentVpc.position.x;
              subnetAbsY += parentVpc.position.y;
            }
          }

          if (
            nodeCenterX >= subnetAbsX &&
            nodeCenterX <= subnetAbsX + subnetWidth &&
            nodeCenterY >= subnetAbsY &&
            nodeCenterY <= subnetAbsY + subnetHeight
          ) {
            targetSubnetId = subnet.id;
            targetSubnetAbsPos = { x: subnetAbsX, y: subnetAbsY };
            break;
          }
        }

        let targetVpcId: string | null = null;
        if (!targetSubnetId) {
          for (const vpc of networkConfig.vpcs) {
            if (
              nodeCenterX >= vpc.position.x &&
              nodeCenterX <= vpc.position.x + 600 &&
              nodeCenterY >= vpc.position.y &&
              nodeCenterY <= vpc.position.y + 400
            ) {
              targetVpcId = vpc.id;
              break;
            }
          }
        }

        if (!targetSubnetId && !targetVpcId) {
          showNotification({ type: 'error', message: 'Invalid placement: Service nodes must reside inside a VPC boundary.' });
          return;
        }

        const finalDropPos = targetSubnetId
          ? { x: position.x - targetSubnetAbsPos.x, y: position.y - targetSubnetAbsPos.y }
          : position;

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
      />

      <div style={styles.bodyWrapper}>
        {/* Main React Flow Workspace */}
        <div 
          style={styles.canvasContainer}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
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
                : "Create Ubuntu Node"
          }
          label="Give your new container a descriptive name."
          placeholder={
            dropState?.type === 'postgres'
              ? "e.g. pg-db, main-store"
              : dropState?.type === 'mysql'
                ? "e.g. mysql-db, orders"
                : "e.g. web-server, api-gateway"
          }
          defaultValue={
            dropState?.type === 'postgres'
              ? `postgres-${containers.filter(c => c.type === 'postgres').length + 1}`
              : dropState?.type === 'mysql'
                ? `mysql-${containers.filter(c => c.type === 'mysql').length + 1}`
                : `node-${containers.filter(c => !c.type || c.type === 'ubuntu').length + 1}`
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

      {/* Phase 3 Modals */}
      {inspectingSubnet && (
        <RoutingTableModal
          subnetId={inspectingSubnet.id}
          subnetName={inspectingSubnet.name}
          routes={networkConfig.subnets.find(s => s.id === inspectingSubnet.id)?.routes || []}
          onClose={() => setInspectingSubnet(null)}
          onAddRoute={(route) => {
            const updatedSubnets = networkConfig.subnets.map(s => {
              if (s.id === inspectingSubnet.id) {
                return { ...s, routes: [...s.routes, route] };
              }
              return s;
            });
            saveNetworkConfig({ ...networkConfig, subnets: updatedSubnets });
          }}
          onDeleteRoute={(idx) => {
            const updatedSubnets = networkConfig.subnets.map(s => {
              if (s.id === inspectingSubnet.id) {
                return { ...s, routes: s.routes.filter((_, i) => i !== idx) };
              }
              return s;
            });
            saveNetworkConfig({ ...networkConfig, subnets: updatedSubnets });
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

      {inspectingVpc && (
        <VpcModal
          vpcId={inspectingVpc.id}
          vpcName={inspectingVpc.name}
          subnets={networkConfig.subnets}
          nodes={containers}
          nodeSecurityGroups={networkConfig.nodeSecurityGroups}
          nodeSubnetMap={networkConfig.nodeSubnetMap}
          onClose={() => setInspectingVpc(null)}
          onRenameVpc={(newName) => {
            const updatedVpcs = networkConfig.vpcs.map(v => {
              if (v.id === inspectingVpc.id) {
                return { ...v, name: newName };
              }
              return v;
            });
            saveNetworkConfig({ ...networkConfig, vpcs: updatedVpcs });
            setInspectingVpc({ id: inspectingVpc.id, name: newName });
          }}
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
};
