import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import InputModal from '../../shared/components/InputModal';
import ConfirmModal from '../../shared/components/ConfirmModal';
import ProjectCard from './components/ProjectCard';
import EmptyState from './components/EmptyState';
import { API_BASE } from '../../shared/types';
import type { Project } from '../../shared/types';
import logo from '../../assets/logo.png';

interface ProjectsPageProps {
  onSelectProject: (id: string, name: string) => void;
}

declare const __APP_VERSION__: string;

export default function ProjectsPage({ onSelectProject }: ProjectsPageProps) {
  const { t, i18n } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'fr' ? 'en' : 'fr';
    i18n.changeLanguage(nextLang);
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/projects`);
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

  const handleCreateProject = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setShowCreateModal(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setDeletingIds(prev => [...prev, id]);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        localStorage.removeItem(`akal-lab-graph-layout-${id}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      await fetchProjects();
      setDeletingIds(prev => prev.filter((x) => x !== id));
    }
  };

  const handleDeleteClick = (project: Project, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeleteTarget(project);
  };

  return (
    <div style={styles.container}>
      {/* Page header */}
      <div style={styles.header}>
        <div style={styles.logoRow}>
          <div style={styles.iconWrap}>
            <img src={logo} alt="Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={styles.title}>{t('projects.title')}</h1>
              <span style={styles.badge}>v{__APP_VERSION__}</span>
            </div>
            <p style={styles.subtitle}>{t('projects.subtitle')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={toggleLanguage} 
            style={{...styles.createBtn, background: 'var(--bg-surface-solid)', color: 'var(--color-text-primary)', border: '1px solid var(--border-color)', padding: '0 12px'}} 
            title="Toggle Language"
          >
            {i18n.language.toUpperCase()}
          </button>
          <button onClick={() => setShowCreateModal(true)} style={styles.createBtn} id="create-project-btn">
            <Plus size={16} style={{ marginRight: 6 }} />
            {t('projects.newProject')}
          </button>
        </div>
      </div>

      {loading && <p style={styles.loading}>{t('projects.loading')}</p>}

      {/* Project grid */}
      <div style={styles.grid}>
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onSelect={onSelectProject}
            onDelete={handleDeleteClick}
            isDeleting={deletingIds.includes(p.id)}
          />
        ))}
        {!loading && projects.length === 0 && <EmptyState />}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <InputModal
          title={t('projects.createTitle')}
          label={t('projects.createLabel')}
          placeholder={t('projects.createPlaceholder')}
          submitText={t('projects.createSubmit')}
          onSubmit={handleCreateProject}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={t('projects.deleteTitle')}
          message={t('projects.deleteMessage').replace('{{name}}', deleteTarget.name)}
          confirmText={t('projects.deleteConfirm')}
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '48px 60px',
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
    marginBottom: '40px',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  iconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: '#FFFFFF',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: '2px 0 0 0',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
    padding: '2px 10px',
    borderRadius: '12px',
    border: '1px solid rgba(37, 99, 235, 0.2)',
    marginTop: '4px',
  },
  createBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '10px',
    padding: '0 20px',
    height: '42px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)',
  },
  loading: {
    color: 'var(--color-text-secondary)',
    fontSize: '14px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
  },
};
