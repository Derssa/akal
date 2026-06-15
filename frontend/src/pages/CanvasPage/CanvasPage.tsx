import { useEffect, useState, useMemo } from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import UbuntuNode from '../../features/nodes/UbuntuNode/UbuntuNode';
import { Plus, Server, RefreshCw, Save } from 'lucide-react';

interface ContainerData {
  id: string;
  name: string;
  state: string;
  status: string;
}

interface CanvasPageProps {
  onTerminalOpen: (id: string, name: string) => void;
}

export default function CanvasPage({ onTerminalOpen }: CanvasPageProps) {
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [loading] = useState(false);
  const [creating] = useState(false);
  
  // Track visual node coordinates manually, saved to localStorage
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Load visual coordinates and containers list on mount
  useEffect(() => {
    const savedLayout = localStorage.getItem('akal-lab-graph-layout');
    if (savedLayout) {
      try {
        setPositions(JSON.parse(savedLayout));
      } catch (err) {
        console.error(err);
      }
    }

    const savedNodes = localStorage.getItem('akal-lab-containers-list');
    if (savedNodes) {
      try {
        setContainers(JSON.parse(savedNodes));
      } catch (err) {
        console.error(err);
      }
    }
  }, []);

  const saveGraphLocally = () => {
    localStorage.setItem('akal-lab-graph-layout', JSON.stringify(positions));
    localStorage.setItem('akal-lab-containers-list', JSON.stringify(containers));
    alert('System architecture graph layout saved locally!');
  };

  const handleCreateNode = () => {
    const nodeName = prompt('Enter a name for your Ubuntu node:', `node-${containers.length + 1}`);
    if (!nodeName) return;

    const newId = `ubuntu-node-${Date.now()}`;
    const newContainer: ContainerData = {
      id: newId,
      name: nodeName,
      state: 'running',
      status: 'Up less than a second'
    };

    setContainers(prev => {
      const updated = [...prev, newContainer];
      localStorage.setItem('akal-lab-containers-list', JSON.stringify(updated));
      return updated;
    });
  };

  const handleStart = (id: string) => {
    setContainers(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, state: 'running', status: 'Up 1 second' } : c);
      localStorage.setItem('akal-lab-containers-list', JSON.stringify(updated));
      return updated;
    });
  };

  const handleStop = (id: string) => {
    setContainers(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, state: 'exited', status: 'Exited (0) 1 second ago' } : c);
      localStorage.setItem('akal-lab-containers-list', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this container?')) return;
    setContainers(prev => {
      const updated = prev.filter(c => c.id !== id);
      localStorage.setItem('akal-lab-containers-list', JSON.stringify(updated));
      return updated;
    });
    setPositions(prev => {
      const updated = { ...prev };
      delete updated[id];
      localStorage.setItem('akal-lab-graph-layout', JSON.stringify(updated));
      return updated;
    });
  };

  const refreshNodes = () => {
    const savedNodes = localStorage.getItem('akal-lab-containers-list');
    if (savedNodes) {
      try {
        setContainers(JSON.parse(savedNodes));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const nodeTypes = useMemo(() => ({
    ubuntu: UbuntuNode,
  }), []);

  // Update nodes coordinates when user drags them on the Canvas
  const onNodeDragStop = (_event: any, node: Node) => {
    setPositions(prev => ({
      ...prev,
      [node.id]: { x: node.position.x, y: node.position.y }
    }));
  };

  // Map active containers state to React Flow Nodes
  const nodes: Node[] = containers.map((c, index) => {
    const defaultX = 150 + (index % 3) * 280;
    const defaultY = 150 + Math.floor(index / 3) * 220;
    const position = positions[c.id] || { x: defaultX, y: defaultY };

    return {
      id: c.id,
      type: 'ubuntu',
      position,
      data: {
        id: c.id,
        name: c.name,
        state: c.state,
        status: c.status,
        onStart: handleStart,
        onStop: handleStop,
        onDelete: handleDelete,
        onTerminalOpen: onTerminalOpen,
      },
    };
  });

  const edges: Edge[] = [];

  return (
    <div style={styles.wrapper}>
      {/* Top Header / Control Bar */}
      <div style={styles.topbar} className="glass">
        <div style={styles.brand}>
          <Server size={22} color="#3B82F6" />
          <span style={styles.brandTitle}>Backend Systems Lab</span>
          <span style={styles.badge}>Phase 1</span>
        </div>
        
        <div style={styles.actions}>
          <button 
            onClick={refreshNodes} 
            style={styles.refreshBtn} 
            disabled={loading}
            title="Refresh Nodes"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
          
          <button 
            onClick={saveGraphLocally} 
            style={styles.saveBtn}
            title="Save Layout Locally"
          >
            <Save size={16} style={{ marginRight: 6 }} />
            Save Graph
          </button>

          <button 
            onClick={handleCreateNode} 
            style={styles.addBtn}
            disabled={creating}
          >
            <Plus size={16} style={{ marginRight: 6 }} />
            {creating ? 'Creating...' : 'Add Ubuntu Node'}
          </button>
        </div>
      </div>

      {/* Main React Flow Workspace */}
      <div style={styles.canvasContainer}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeDragStop={onNodeDragStop}
          fitView
        >
          <Background color="#1F2937" gap={16} size={1} />
          <Controls />
        </ReactFlow>
      </div>
      
      {/* Footer / Status Summary */}
      <div style={styles.footer} className="glass">
        <div style={styles.statusSummary}>
          <span>Active: <strong>{containers.filter(c => c.state === 'running').length}</strong></span>
          <span style={{ margin: '0 12px', color: 'rgba(255,255,255,0.15)' }}>|</span>
          <span>Stopped: <strong>{containers.filter(c => c.state !== 'running').length}</strong></span>
        </div>
        <div style={styles.footerNote}>
          Local-first Docker runtime powered by Node.js & Dockerode
        </div>
      </div>
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
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    zIndex: 10,
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  brandTitle: {
    fontWeight: 700,
    fontSize: '18px',
    letterSpacing: '-0.5px',
    color: '#FFF',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#3B82F6',
    padding: '2px 8px',
    borderRadius: '12px',
    border: '1px solid rgba(59, 130, 246, 0.3)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  refreshBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    color: '#9CA3AF',
    cursor: 'pointer',
    width: '38px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  saveBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: '#FFF',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '0 16px',
    height: '38px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  },
  addBtn: {
    backgroundColor: '#3B82F6',
    color: '#FFF',
    border: 'none',
    borderRadius: '8px',
    padding: '0 16px',
    height: '38px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s, transform 0.1s',
  },
  canvasContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 24px',
    fontSize: '12px',
    color: '#9CA3AF',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  },
  statusSummary: {
    display: 'flex',
    alignItems: 'center',
  },
  footerNote: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '11px',
    color: '#6B7280',
  },
};
