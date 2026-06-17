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
import type { VPCConfig } from '../../features/nodes/VpcNode/VpcModal';
import ButtonEdge from './components/ButtonEdge';
import { validateArchitecture } from '../../shared/utils/architectureValidator';

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
  vpcId: string | null;
  position: { x: number; y: number };
  width: number;
  height: number;
  routes: Array<{ destination: string; target: string; description: string }>;
}

interface NetworkConfig {
  vpcConfig: VPCConfig;
  subnets: Subnet[];
  nodeSubnetMap: Record<string, string>; // nodeId -> subnetId or vpcId
  nodeSecurityGroups: Record<string, SecurityGroupRule[]>; // nodeId -> SecurityGroupRule[]
}

function autoGrowContainers(
  config: NetworkConfig,
  containers: any[],
  positions: Record<string, { x: number; y: number }>
): NetworkConfig {
  const defaultSubnetWidth = 280;
  const defaultSubnetHeight = 220;

  const nodeWidth = 220;
  const nodeHeight = 140;
  const gapX = 30;
  const gapY = 30;
  const paddingLeft = 30;
  const paddingRight = 30;
  const paddingTop = 50;
  const paddingBottom = 40;
  const numColumns = 2;

  // 1. Grow Subnets based on nested services and auto-position them
  const updatedSubnets = config.subnets.map(subnet => {
    const subnetNodes = containers.filter(c => config.nodeSubnetMap[c.id] === subnet.id);
    if (subnetNodes.length === 0) {
      return { ...subnet, width: defaultSubnetWidth, height: defaultSubnetHeight };
    }

    const cols = Math.min(subnetNodes.length, numColumns);
    const rows = Math.ceil(subnetNodes.length / numColumns);

    const calculatedWidth = paddingLeft + cols * (nodeWidth + gapX) - gapX + paddingRight;
    const calculatedHeight = paddingTop + rows * (nodeHeight + gapY) - gapY + paddingBottom;

    return {
      ...subnet,
      width: Math.max(defaultSubnetWidth, calculatedWidth),
      height: Math.max(defaultSubnetHeight, calculatedHeight)
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
    nodeSecurityGroups: {}
  });

  const [showVpcSettings, setShowVpcSettings] = useState(false);
  const [showTrafficSimulator, setShowTrafficSimulator] = useState(false);

  const nodeTypes = useMemo(() => ({ 
    ubuntu: UbuntuNode,
    postgres: PostgresNode,
    mysql: MysqlNode,
    vpc: VpcNode,
    subnet: SubnetNode
  }), []);

  const edgeTypes = useMemo(() => ({
    buttonEdge: ButtonEdge
  }), []);

  // Save/load network config helper
  const saveNetworkConfig = useCallback((newConfig: NetworkConfig) => {
    const grownConfig = autoGrowContainers(newConfig, containers, positionsRef.current);
    setNetworkConfig(grownConfig);
    localStorage.setItem(`akal-lab-network-config-${projectId}`, JSON.stringify(grownConfig));
  }, [projectId, containers]);

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

  // Helper to generate default security group rules for network nodes (deny all inbound by default)
  const initDefaultRules = (nodeId: string, nodeType: string, subnetId: string) => {
    return [
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
        const parsed = JSON.parse(savedConfig);
        if (!parsed.vpcConfig) {
          parsed.vpcConfig = defaultVpcConfig;
        }
        setNetworkConfig(parsed);
      } catch (err) {
        console.error(err);
      }
    } else {
      setNetworkConfig({
        vpcConfig: defaultVpcConfig,
        subnets: [],
        nodeSubnetMap: {},
        nodeSecurityGroups: {}
      });
    }

    const timer = setInterval(fetchContainers, 4000);
    return () => clearInterval(timer);
  }, [projectId, fetchContainers, defaultVpcConfig]);

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
            onManageRoutes: (id: string, name: string) => {
              setInspectingSubnet({ id, name });
            },
            onDelete: handleDeleteSubnet
          }
        };
      });

      // 2. Map container nodes
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

        const parentId = updatedNodeSubnetMap[c.id] || undefined;
        const isDragging = draggingNodeIdRef.current === c.id;

        let position = dropPos || savedPos || existing?.position || { x: defaultX, y: defaultY };

        // Auto-layout grid for subnet children (if not currently dragging)
        if (parentId && parentId.startsWith('subnet-') && !isDragging) {
          const subnetNodes = containers.filter(node => updatedNodeSubnetMap[node.id] === parentId);
          const indexInSubnet = subnetNodes.findIndex(node => node.id === c.id);
          if (indexInSubnet !== -1) {
            const nodeWidth = 220;
            const nodeHeight = 140;
            const gapX = 30;
            const gapY = 30;
            const paddingLeft = 30;
            const paddingTop = 50;
            const numColumns = 2;

            const col = indexInSubnet % numColumns;
            const row = Math.floor(indexInSubnet / numColumns);
            
            position = {
              x: paddingLeft + col * (nodeWidth + gapX),
              y: paddingTop + row * (nodeHeight + gapY)
            };
            positionsRef.current[c.id] = position;
          }
        }

        const nodeType = c.type || 'ubuntu';

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

      return [...subnetNodes, ...containerNodes];
    });
  }, [containers, startContainer, stopContainer, onTerminalOpen, setNodes, networkConfig, saveNetworkConfig, handleDeleteSubnet]);

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
        let subnetAbsX = subnet.position.x;
        let subnetAbsY = subnet.position.y;
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
        let subnetAbsX = subnet.position.x;
        let subnetAbsY = subnet.position.y;
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
    let tempNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    
    // If we are hovering a valid container, assume it's parented temporarily for sizing check
    if (hoveredId && isValid) {
      tempNodeSubnetMap[draggedNode.id] = hoveredId;
    } else if (draggedNode.type !== 'subnet') {
      // Dragging service node outside of any container
      delete tempNodeSubnetMap[draggedNode.id];
    }

    // Calculate temp positions relative to the hovered container
    let tempPos = { x: absX, y: absY };
    if (hoveredId && isValid) {
      if (hoveredId.startsWith('subnet-')) {
        const subnet = networkConfig.subnets.find(s => s.id === hoveredId);
        if (subnet) {
          let subnetAbsX = subnet.position.x;
          let subnetAbsY = subnet.position.y;
          tempPos = { x: absX - subnetAbsX, y: absY - subnetAbsY };
        }
      }
    }

    const currentPositions = {
      ...positionsRef.current,
      [draggedNode.id]: tempPos
    };

    const tempConfig = {
      ...networkConfig,
      nodeSubnetMap: tempNodeSubnetMap
    };

    const grownConfig = autoGrowContainers(tempConfig, containers, currentPositions);

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
        let subnetAbsX = subnet.position.x;
        let subnetAbsY = subnet.position.y;
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
      const subnetWidth = 260;
      const subnetHeight = 180;
      const nodeCenterX = absX + 120;
      const nodeCenterY = absY + 60;

      let targetSubnetId: string | null = null;
      let targetSubnetAbsPos = { x: 0, y: 0 };

      for (const subnet of networkConfig.subnets) {
        let subnetAbsX = subnet.position.x;
        let subnetAbsY = subnet.position.y;

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
  }, [reactFlowInstance, networkConfig, projectId, saveNetworkConfig, setNodes, triggerArchitectureAudit, showNotification, containers]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    let updatedSubnets = [...networkConfig.subnets];
    const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };
    let configChanged = false;

    deleted.forEach(node => {
      if (node.type === 'subnet') {
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
        ...networkConfig,
        subnets: updatedSubnets,
        nodeSubnetMap: updatedNodeSubnetMap,
        nodeSecurityGroups: updatedSecurityGroups
      });
    }
  }, [networkConfig, saveNetworkConfig]);

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

      if (type === 'subnet-public' || type === 'subnet-private') {
        const isPublic = type === 'subnet-public';
        const subnetWidth = 260;
        const subnetHeight = 180;
        const subnetCenterX = position.x + subnetWidth / 2;
        const subnetCenterY = position.y + subnetHeight / 2;

        // Check if dropped inside another subnet
        let insideAnotherSubnet = false;
        for (const subnet of networkConfig.subnets) {
          let subnetAbsX = subnet.position.x;
          let subnetAbsY = subnet.position.y;
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
          vpcId: 'root-vpc',
          position: position,
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
