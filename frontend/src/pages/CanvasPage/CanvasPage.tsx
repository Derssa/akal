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
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Track visual node coordinates manually, saved to localStorage
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  const fetchContainers = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:5000/api/containers');
      const data = await res.json();
      if (Array.isArray(data)) {
        setContainers(data);
      }
    } catch (err) {
      console.error('Failed to fetch containers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load visual coordinates on mount and poll container states
  useEffect(() => {
    fetchContainers();
    const savedLayout = localStorage.getItem('akal-lab-graph-layout');
    if (savedLayout) {
      try {
        setPositions(JSON.parse(savedLayout));
      } catch (err) {
        console.error(err);
      }
    }

    const timer = setInterval(fetchContainers, 4000);
    return () => clearInterval(timer);
  }, []);

  const saveGraphLocally = () => {
    localStorage.setItem('akal-lab-graph-layout', JSON.stringify(positions));
    alert('System architecture graph layout saved locally!');
  };

  const handleCreateNode = async () => {
    const nodeName = prompt('Enter a name for your Ubuntu node:', `node-${containers.length + 1}`);
    if (!nodeName) return;

    try {
      setCreating(true);
      const res = await fetch('http://localhost:5000/api/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nodeName })
      });
      if (res.ok) {
        fetchContainers();
      } else {
        const error = await res.json();
        alert(`Failed: ${error.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error creating container node.');
    } finally {
      setCreating(false);
    }
  };

  const handleStart = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:5000/api/containers/${id}/start`, { method: 'POST' });
      if (res.ok) fetchContainers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStop = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:5000/api/containers/${id}/stop`, { method: 'POST' });
      if (res.ok) fetchContainers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this container?')) return;
    try {
      const res = await fetch(`http://localhost:5000/api/containers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setContainers(prev => prev.filter(c => c.id !== id));
        setPositions(prev => {
          const updated = { ...prev };
          delete updated[id];
          localStorage.setItem('akal-lab-graph-layout', JSON.stringify(updated));
          return updated;
        });
        fetchContainers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const refreshNodes = () => {
    fetchContainers();
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
