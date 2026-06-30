import { useState } from 'react';
import { ChevronLeft, ChevronRight, Database, Library, Network, Search, GitFork, Braces, Layers, ArrowRightLeft, Cpu } from 'lucide-react';

interface NodeLibraryProps {
  onCollapseChange?: (collapsed: boolean) => void;
}

export default function NodeLibrary({ onCollapseChange }: NodeLibraryProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCollapse = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);
    onCollapseChange?.(nextCollapsed);
  };

  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const categories = [
    {
      title: 'Networking',
      nodes: [
        {
          type: 'subnet-public',
          name: 'Public Subnet',
          desc: 'Allows public access',
          icon: <Network size={18} color="#10B981" />,
          collapsedIcon: <Network size={20} color="#10B981" />
        },
        {
          type: 'subnet-private',
          name: 'Private Subnet',
          desc: 'Internal instances only',
          icon: <Network size={18} color="#F59E0B" />,
          collapsedIcon: <Network size={20} color="#F59E0B" />
        },
        {
          type: 'nat',
          name: 'NAT Gateway',
          desc: 'Outbound internet routing',
          icon: <ArrowRightLeft size={18} color="#8B5CF6" />,
          collapsedIcon: <ArrowRightLeft size={20} color="#8B5CF6" />
        },
        {
          type: 'loadbalancer',
          name: 'Load Balancer',
          desc: 'Inbound HTTP proxying',
          icon: <GitFork size={18} color="#EF4444" />,
          collapsedIcon: <GitFork size={20} color="#EF4444" />
        }
      ]
    },
    {
      title: 'Compute',
      nodes: [
        {
          type: 'ubuntu',
          name: 'Server',
          desc: 'Standard terminal shell',
          icon: <Cpu size={18} color="#3B82F6" />,
          collapsedIcon: <Cpu size={20} color="#3B82F6" />
        },
        {
          type: 'autoscalinggroup',
          name: 'Auto Scaling Group',
          desc: 'Dynamic instance pool',
          icon: <Layers size={18} color="#EC4899" />,
          collapsedIcon: <Layers size={20} color="#EC4899" />
        }
      ]
    },
    {
      title: 'Databases',
      nodes: [
        {
          type: 'postgres',
          name: 'SQL Database',
          desc: 'Relational DB + Shell',
          icon: <Database size={18} color="#64748B" />,
          collapsedIcon: <Database size={20} color="#64748B" />
        },
        {
          type: 'nosql',
          name: 'NoSQL Database',
          desc: 'Document DB + Shell',
          icon: <Braces size={18} color="#475569" />,
          collapsedIcon: <Braces size={20} color="#475569" />
        },
        {
          type: 'redis',
          name: 'Cache Store',
          desc: 'In-memory key-value cache',
          icon: <Database size={18} color="#DC2626" />,
          collapsedIcon: <Database size={20} color="#DC2626" />
        }
      ]
    }
  ];

  const filteredCategories = categories.map(cat => ({
    ...cat,
    nodes: cat.nodes.filter(node =>
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.desc.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(cat => cat.nodes.length > 0);

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
        <>
          <div style={styles.searchWrapper}>
            <div style={styles.searchContainer}>
              <Search size={14} color="var(--color-text-muted)" style={{ marginRight: 6 }} />
              <input
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
          </div>

          <div style={styles.content}>
            {filteredCategories.map(cat => (
              <div key={cat.title} style={styles.category}>
                <span style={styles.categoryTitle}>{cat.title}</span>
                {cat.nodes.map(node => (
                  <div
                    key={node.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, node.type)}
                    style={styles.draggableNode}
                  >
                    <div style={styles.iconBox} className="glass">
                      {node.icon}
                    </div>
                    <div style={styles.nodeInfo}>
                      <span style={styles.nodeName}>{node.name}</span>
                      <span style={styles.nodeDesc}>{node.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {filteredCategories.length === 0 && (
              <div style={styles.emptySearch}>No matching nodes found</div>
            )}
          </div>
        </>
      )}

      {isCollapsed && (
        <div style={styles.collapsedIcons}>
          {categories.flatMap(cat => cat.nodes).map(node => (
            <div
              key={node.type}
              draggable
              onDragStart={(e) => handleDragStart(e, node.type)}
              style={styles.collapsedIconNode}
              title={`Drag ${node.name}`}
            >
              {node.collapsedIcon}
            </div>
          ))}
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
  searchWrapper: {
    padding: '12px 16px 4px 16px',
    boxSizing: 'border-box',
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    padding: '6px 10px',
  },
  searchInput: {
    border: 'none',
    background: 'transparent',
    outline: 'none',
    fontSize: '12px',
    width: '100%',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-sans)',
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
  emptySearch: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
    marginTop: '20px',
    fontStyle: 'italic',
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
