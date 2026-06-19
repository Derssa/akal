import { Server, ArrowLeft, RefreshCw, Save, Network, Play } from 'lucide-react';

interface CanvasTopbarProps {
  projectName: string;
  loading: boolean;
  creating?: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onConfigureVpc: () => void;
  onSimulateTraffic: () => void;
}

export default function CanvasTopbar({
  projectName,
  loading,
  onBack,
  onRefresh,
  onSave,
  onConfigureVpc,
  onSimulateTraffic,
}: CanvasTopbarProps) {
  return (
    <div style={styles.topbar} className="glass">
      <div style={styles.brand}>
        <button onClick={onBack} style={styles.backBtn} title="Back to Projects">
          <ArrowLeft size={16} />
        </button>
        <Server size={22} color="var(--color-accent)" style={{ marginLeft: 8 }} />
        <span style={styles.brandTitle}>{projectName}</span>
        <span style={styles.badge}>Phase 1</span>
      </div>

      <div style={styles.actions}>
        <button
          onClick={onRefresh}
          style={styles.refreshBtn}
          disabled={loading}
          title="Refresh Nodes"
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>

        <button onClick={onConfigureVpc} style={styles.saveBtn} title="Configure VPC Settings">
          <Network size={16} style={{ marginRight: 6 }} />
          VPC Settings
        </button>

        <button onClick={onSimulateTraffic} style={styles.saveBtn} title="Simulate Traffic Routing">
          <Play size={16} style={{ marginRight: 6 }} />
          Traffic Simulator
        </button>

        <button onClick={onSave} style={styles.saveBtn} title="Save Layout Locally">
          <Save size={16} style={{ marginRight: 6 }} />
          Save Graph
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    zIndex: 10,
    borderBottom: '1px solid var(--border-color)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  backBtn: {
    background: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  brandTitle: {
    fontWeight: 700,
    fontSize: '18px',
    letterSpacing: '-0.5px',
    color: 'var(--color-text-primary)',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
    padding: '2px 10px',
    borderRadius: '12px',
    border: '1px solid rgba(37, 99, 235, 0.2)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  refreshBtn: {
    background: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    width: '38px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  saveBtn: {
    backgroundColor: 'var(--bg-surface-solid)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '0 16px',
    height: '38px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  addBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '10px',
    padding: '0 18px',
    height: '38px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s, transform 0.1s',
    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)',
  },
};
