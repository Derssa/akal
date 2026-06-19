import { useState } from 'react';
import { X, Route, Info, Loader2 } from 'lucide-react';

interface RouteEntry {
  destination: string;
  target: string;
  description: string;
}

interface RoutingTableModalProps {
  subnetId: string;
  subnetName: string;
  routes: RouteEntry[];
  natGateways?: string[];
  onClose: () => void;
  onSave: (updatedRoutes: RouteEntry[]) => Promise<void>;
}

export default function RoutingTableModal({
  subnetName,
  routes,
  natGateways = [],
  onClose,
  onSave
}: RoutingTableModalProps) {
  const [localRoutes, setLocalRoutes] = useState<RouteEntry[]>(routes);
  const [isSaving, setIsSaving] = useState(false);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const destination = formData.get('destination') as string;
    const target = formData.get('target') as string;
    const description = formData.get('description') as string;

    if (destination && target) {
      setLocalRoutes([...localRoutes, { destination, target, description }]);
      e.currentTarget.reset();
    }
  };

  const handleDeleteRoute = (index: number) => {
    setLocalRoutes(localRoutes.filter((_, i) => i !== index));
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      await onSave(localRoutes);
      onClose(); // Automatically close the modal after successful save
    } catch (err) {
      console.error('Failed to save route changes:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <Route size={18} color="var(--color-accent)" />
            <span style={styles.title}>{subnetName} - Routing Table</span>
          </div>
          <button 
            onClick={onClose} 
            style={{
              ...styles.closeBtn,
              opacity: isSaving ? 0.4 : 1,
              pointerEvents: isSaving ? 'none' : 'auto'
            }} 
            disabled={isSaving}
          >
            <X size={18} />
          </button>
        </div>

        <div style={styles.body}>
          <div style={styles.infoBox}>
            <Info size={16} color="var(--color-accent)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={styles.infoText}>
              A Routing Table contains a set of rules (called routes) that determine where network traffic from your subnet is directed. Traffic matching the destination CIDR will be forwarded to the corresponding target.
            </p>
          </div>

          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}>Destination CIDR</th>
                <th style={styles.th}>Target</th>
                <th style={styles.th}>Description</th>
                <th style={styles.thAction}>Action</th>
              </tr>
            </thead>
            <tbody>
              {localRoutes.map((route, idx) => (
                <tr key={idx} style={styles.tr}>
                  <td style={styles.tdCode}><code>{route.destination}</code></td>
                  <td style={styles.tdCode}><code>{route.target}</code></td>
                  <td style={styles.td}>{route.description || 'N/A'}</td>
                  <td style={styles.tdAction}>
                    <button 
                      onClick={() => handleDeleteRoute(idx)}
                      style={{
                        ...styles.deleteBtn,
                        opacity: isSaving ? 0.4 : 1,
                        pointerEvents: isSaving ? 'none' : 'auto'
                      }}
                      disabled={isSaving}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {localRoutes.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    No routes defined. Subnet traffic will be isolated.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={styles.formSection}>
            <h4 style={styles.formTitle}>Add Route Rule</h4>
            <form onSubmit={handleFormSubmit} style={styles.form}>
              <input
                required
                disabled={isSaving}
                name="destination"
                type="text"
                placeholder="e.g. 0.0.0.0/0, 10.0.0.0/16"
                style={styles.input}
              />
              <select
                required
                disabled={isSaving}
                name="target"
                style={styles.select}
              >
                <option value="local">local</option>
                <option value="igw">igw</option>
                {natGateways.map(nat => (
                  <option key={nat} value={nat}>{nat}</option>
                ))}
              </select>
              <input
                disabled={isSaving}
                name="description"
                type="text"
                placeholder="Rule description (optional)"
                style={styles.inputWide}
              />
              <button 
                type="submit" 
                style={{
                  ...styles.addBtn,
                  opacity: isSaving ? 0.5 : 1,
                  cursor: isSaving ? 'not-allowed' : 'pointer'
                }} 
                disabled={isSaving}
              >
                Add Route
              </button>
            </form>
          </div>

          <div style={styles.footerSection}>
            <button
              onClick={handleSaveChanges}
              disabled={isSaving}
              style={{
                ...styles.saveBtn,
                opacity: isSaving ? 0.7 : 1,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isSaving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {isSaving ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
  },
  container: {
    width: '650px',
    maxWidth: '100%',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-solid)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  body: {
    backgroundColor: '#FFFFFF',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  infoBox: {
    display: 'flex',
    gap: '10px',
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
    border: '1px solid rgba(37, 99, 235, 0.15)',
    borderRadius: '8px',
    padding: '12px',
  },
  infoText: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  thRow: {
    backgroundColor: 'var(--bg-main)',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border-color)',
  },
  thAction: {
    textAlign: 'right',
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border-color)',
  },
  tr: {
    borderBottom: '1px solid var(--border-color)',
  },
  tdCode: {
    padding: '10px 12px',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-primary)',
  },
  td: {
    padding: '10px 12px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  tdAction: {
    padding: '10px 12px',
    textAlign: 'right',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#EF4444',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  formSection: {
    borderTop: '1px solid var(--border-color)',
    paddingTop: '16px',
    marginTop: '8px',
  },
  formTitle: {
    margin: '0 0 12px 0',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  form: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  input: {
    flex: '1 1 140px',
    padding: '6px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
  },
  select: {
    flex: '1 1 140px',
    padding: '6px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  inputWide: {
    flex: '2 1 200px',
    padding: '6px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
  },
  addBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  footerSection: {
    display: 'flex',
    justifyContent: 'flex-end',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '16px',
    marginTop: '8px',
  },
  saveBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 20px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }
};
