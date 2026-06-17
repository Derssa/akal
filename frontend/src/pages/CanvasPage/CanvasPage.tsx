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
import SecurityGroupsModal, { SecurityGroupRule } from '../../features/nodes/SecurityGroups/SecurityGroupsModal';
import NetworkSimulatorPanel from '../../features/nodes/SecurityGroups/NetworkSimulatorPanel';

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

export default function CanvasPage({ projectId, projectName, onBackToProjects, onTerminalOpen }: CanvasPageProps) {
  const { toast, showToast, dismissToast } = useToast();

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

  // Drag and drop tracking
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [dropState, setDropState] = useState<{ position: { x: number; y: number }; type: string } | null>(null);
  const dropPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const dropSubnetsRef = useRef<Record<string, string>>({});
  const pendingSubnetIdRef = useRef<string | null>(null);

  // React Flow managed nodes state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const edges: Edge[] = [];

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
    setNetworkConfig(newConfig);
    localStorage.setItem(`akal-lab-network-config-${projectId}`, JSON.stringify(newConfig));
  }, [projectId]);

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

    // Map dropped container positions or subnets if pending
    containers.forEach(c => {
      if (dropSubnetsRef.current[c.name]) {
        updatedNodeSubnetMap[c.id] = dropSubnetsRef.current[c.name];
        delete dropSubnetsRef.current[c.name];
        configChanged = true;
      }
    });

    if (configChanged) {
      saveNetworkConfig({ ...networkConfig, nodeSubnetMap: updatedNodeSubnetMap });
    }

    setNodes(() => {
      // 1. Map VPC nodes
      const vpcNodes = networkConfig.vpcs.map(vpc => ({
        id: vpc.id,
        type: 'vpc',
        position: vpc.position,
        style: { width: vpc.width, height: vpc.height },
        data: { id: vpc.id, name: vpc.name }
      }));

      // 2. Map Subnet nodes
      const subnetNodes = networkConfig.subnets.map(subnet => ({
        id: subnet.id,
        type: 'subnet',
        parentId: subnet.vpcId || undefined,
        extent: subnet.vpcId ? 'parent' as const : undefined,
        position: subnet.position,
        style: { width: subnet.width, height: subnet.height },
        data: {
          id: subnet.id,
          name: subnet.name,
          type: subnet.type,
          onManageRoutes: (id: string, name: string) => {
            setInspectingSubnet({ id, name });
          }
        }
      }));

      // 3. Map container nodes
      const containerNodes = containers.map((c, index) => {
        const defaultX = 150 + (index % 3) * 280;
        const defaultY = 150 + Math.floor(index / 3) * 220;

        const savedPos = positionsRef.current[c.id];
        const dropPos = dropPositionsRef.current[c.name];
        if (dropPos) {
          positionsRef.current[c.id] = dropPos;
          delete dropPositionsRef.current[c.name];
        }

        const position = dropPos || savedPos || { x: defaultX, y: defaultY };
        const nodeType = c.type || 'ubuntu';
        const parentId = updatedNodeSubnetMap[c.id] || undefined;

        return {
          id: c.id,
          type: nodeType,
          parentId,
          extent: parentId ? 'parent' as const : undefined,
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
  }, [containers, startContainer, stopContainer, onTerminalOpen, setNodes, networkConfig, saveNetworkConfig]);

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

    if (draggedNode.type === 'vpc') {
      const updatedVpcs = networkConfig.vpcs.map(v => {
        if (v.id === draggedNode.id) {
          return { ...v, position: { x: absX, y: absY } };
        }
        return v;
      });
      saveNetworkConfig({ ...networkConfig, vpcs: updatedVpcs });
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

      const updatedSubnets = networkConfig.subnets.map(s => {
        if (s.id === draggedNode.id) {
          const finalPos = targetVpcId
            ? { x: absX - targetVpcPos.x, y: absY - targetVpcPos.y }
            : { x: absX, y: absY };
          return {
            ...s,
            vpcId: targetVpcId,
            position: finalPos
          };
        }
        return s;
      });

      saveNetworkConfig({ ...networkConfig, subnets: updatedSubnets });
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

      const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
      if (targetSubnetId) {
        updatedNodeSubnetMap[draggedNode.id] = targetSubnetId;
        positionsRef.current[draggedNode.id] = {
          x: absX - targetSubnetAbsPos.x,
          y: absY - targetSubnetAbsPos.y
        };
      } else {
        delete updatedNodeSubnetMap[draggedNode.id];
        positionsRef.current[draggedNode.id] = { x: absX, y: absY };
      }

      localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));
      saveNetworkConfig({ ...networkConfig, nodeSubnetMap: updatedNodeSubnetMap });
    }
  }, [reactFlowInstance, networkConfig, projectId, saveNetworkConfig]);

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
        const newVpc: VPC = {
          id: `vpc-${Math.random().toString(36).substr(2, 9)}`,
          name: `VPC-${networkConfig.vpcs.length + 1}`,
          position,
          width: 600,
          height: 400
        };
        saveNetworkConfig({
          ...networkConfig,
          vpcs: [...networkConfig.vpcs, newVpc]
        });
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

        const newSubnet: Subnet = {
          id: `subnet-${Math.random().toString(36).substr(2, 9)}`,
          name: `${isPublic ? 'Public' : 'Private'} Subnet-${networkConfig.subnets.length + 1}`,
          type: isPublic ? 'public' : 'private',
          vpcId: targetVpcId,
          position: targetVpcId
            ? { x: position.x - targetVpcPos.x, y: position.y - targetVpcPos.y }
            : position,
          width: subnetWidth,
          height: subnetHeight,
          routes: [
            { destination: '10.0.0.0/16', target: 'local', description: 'Local VPC routing' },
            ...(isPublic ? [{ destination: '0.0.0.0/0', target: 'igw', description: 'Internet access' }] : [])
          ]
        };

        saveNetworkConfig({
          ...networkConfig,
          subnets: [...networkConfig.subnets, newSubnet]
        });
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

        const finalDropPos = targetSubnetId
          ? { x: position.x - targetSubnetAbsPos.x, y: position.y - targetSubnetAbsPos.y }
          : position;

        setDropState({ position: finalDropPos, type });
        pendingSubnetIdRef.current = targetSubnetId;
        setShowCreateModal(true);
      }
    },
    [reactFlowInstance, networkConfig, saveNetworkConfig]
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
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onInit={setReactFlowInstance}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} color="#C0C0C0" gap={24} size={1.5} />
            <Controls />
          </ReactFlow>

          {/* Traffic Route Simulator */}
          <NetworkSimulatorPanel
            nodes={containers}
            subnets={networkConfig.subnets}
            nodeSecurityGroups={networkConfig.nodeSecurityGroups}
            nodeSubnetMap={networkConfig.nodeSubnetMap}
          />
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
            saveNetworkConfig({ ...networkConfig, nodeSecurityGroups: updatedSecurityGroups });
          }}
        />
      )}

      {toast && (
        <ToastNotification message={toast} onDismiss={dismissToast} />
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
