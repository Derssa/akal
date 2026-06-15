import { useEffect, useState } from 'react';
import { Folder, Plus, Trash2, ArrowRight } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  createdAt: string;
}

interface ProjectsPageProps {
  onSelectProject: (id: string, name: string) => void;
}

export default function ProjectsPage({ onSelectProject }: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:5000/api/projects');
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async () => {
    const name = prompt('Enter project name:');
    if (!name) return;

    try {
      const res = await fetch('http://localhost:5000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm('Are you sure? This will delete the project stack and stop/delete all associated Docker containers.')) return;

    try {
      const res = await fetch(`http://localhost:5000/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // Remove layout positions for deleted project
        localStorage.removeItem(`akal-lab-graph-layout-${id}`);
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logoRow}>
          <Folder size={28} color="#3B82F6" />
          <h1 style={styles.title}>Project Labs Stacks</h1>
        </div>
        <button onClick={handleCreateProject} style={styles.createBtn}>
          <Plus size={18} style={{ marginRight: 6 }} />
          New Project Stack
        </button>
      </div>

      {loading && <p style={styles.loading}>Loading projects...</p>}

      <div style={styles.grid}>
        {projects.map((p) => (
          <div key={p.id} onClick={() => onSelectProject(p.id, p.name)} style={styles.card} className="glass">
            <div style={styles.cardHeader}>
              <Folder size={24} color="#3B82F6" />
              <button onClick={(e) => handleDeleteProject(p.id, e)} style={styles.deleteBtn}>
                <Trash2 size={16} />
              </button>
            </div>
            <h2 style={styles.projectName}>{p.name}</h2>
            <p style={styles.projectMeta}>Created: {new Date(p.createdAt).toLocaleDateString()}</p>
            <div style={styles.cardFooter}>
              <span>Open Stack</span>
              <ArrowRight size={14} style={{ marginLeft: 6 }} />
            </div>
          </div>
        ))}

        {!loading && projects.length === 0 && (
          <div style={styles.empty}>
            <p>No project stacks created yet. Click "New Project Stack" to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '40px 60px',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    overflowY: 'auto',
    height: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#FFF',
    margin: 0,
  },
  createBtn: {
    backgroundColor: '#3B82F6',
    color: '#FFF',
    border: 'none',
    borderRadius: '8px',
    padding: '0 18px',
    height: '42px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  },
  loading: {
    color: '#9CA3AF',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '24px',
  },
  card: {
    padding: '24px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'transform 0.2s, border-color 0.2s',
    display: 'flex',
    flexDirection: 'column',
    height: '180px',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#6B7280',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s',
  },
  projectName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#FFF',
    margin: '12px 0 4px 0',
  },
  projectMeta: {
    fontSize: '12px',
    color: '#6B7280',
    margin: 0,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    color: '#3B82F6',
    fontSize: '13px',
    fontWeight: 500,
    marginTop: '16px',
  },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    color: '#6B7280',
    padding: '60px 0',
  },
};
