import { useState } from 'react';
import { ChevronLeft, ChevronRight, Server, Database, Library } from 'lucide-react';

interface NodeLibraryProps {
  onCollapseChange?: (collapsed: boolean) => void;
}

export default function NodeLibrary({ onCollapseChange }: NodeLibraryProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapse = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);
    onCollapseChange?.(nextCollapsed);
  };

  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{
      ...styles.sidebar,
      width: isCollapsed ? '48px' : '260px',
    }}>
      <div style={styles.header}>
        {!isCollapsed && (
          <div style={styles.headerTitle}>
            <Library size={16} color="var(--color-accent)" style={{ marginRight: 8 }} />
            <span>Node Library</span>
          </div>
        )}
        <button onClick={toggleCollapse} style={styles.collapseBtn} title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}>
          {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {!isCollapsed && (
        <div style={styles.content}>
          {/* Category: Compute */}
          <div style={styles.category}>
            <span style={styles.categoryTitle}>Compute</span>
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, 'ubuntu')}
              style={styles.draggableNode}
            >
              <div style={styles.iconBox} className="glass">
                <Server size={18} color="#3B82F6" />
              </div>
              <div style={styles.nodeInfo}>
                <span style={styles.nodeName}>Ubuntu Server</span>
                <span style={styles.nodeDesc}>Standard terminal shell</span>
              </div>
            </div>
          </div>

          {/* Category: Databases */}
          <div style={styles.category}>
            <span style={styles.categoryTitle}>Databases</span>
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, 'postgres')}
              style={styles.draggableNode}
            >
              <div style={styles.iconBox} className="glass">
                <Database size={18} color="#10B981" />
              </div>
              <div style={styles.nodeInfo}>
                <span style={styles.nodeName}>PostgreSQL</span>
                <span style={styles.nodeDesc}>Relational DB + Shell</span>
              </div>
            </div>
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, 'mysql')}
              style={styles.draggableNode}
            >
              <div style={styles.iconBox} className="glass">
                <Database size={18} color="#F29111" />
              </div>
              <div style={styles.nodeInfo}>
                <span style={styles.nodeName}>MySQL</span>
                <span style={styles.nodeDesc}>Oracle DB + Shell</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCollapsed && (
        <div style={styles.collapsedIcons}>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, 'ubuntu')}
            style={styles.collapsedIconNode}
            title="Drag Ubuntu Server"
          >
            <Server size={20} color="#3B82F6" />
          </div>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, 'postgres')}
            style={styles.collapsedIconNode}
            title="Drag PostgreSQL"
          >
            <Database size={20} color="#10B981" />
          </div>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, 'mysql')}
            style={styles.collapsedIconNode}
            title="Drag MySQL"
          >
            <Database size={20} color="#F29111" />
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    backgroundColor: 'var(--bg-surface-solid)',
    borderLeft: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    flexShrink: 0,
    zIndex: 5,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderBottom: '1px solid var(--border-color)',
    height: '57px',
    boxSizing: 'border-box',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    fontWeight: 700,
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.2px',
  },
  collapseBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    transition: 'background-color 0.2s',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  category: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  categoryTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  draggableNode: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    cursor: 'grab',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    transition: 'all 0.2s',
    userSelect: 'none',
  },
  iconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '12px',
  },
  nodeInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  nodeName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  nodeDesc: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  collapsedIcons: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    paddingTop: '20px',
  },
  collapsedIconNode: {
    width: '36px',
    height: '36px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    transition: 'all 0.2s',
    backgroundColor: 'var(--bg-surface-solid)',
  },
};
