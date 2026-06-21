import { X, ShieldAlert, Plus, Trash, ChevronUp, ChevronDown } from 'lucide-react';
import type { ContainerData } from '../../../shared/types';

export interface SecurityGroupRule {
  id: string;
  type: 'inbound' | 'outbound';
  action: 'ALLOW' | 'DENY';
  protocol: 'ALL' | 'TCP' | 'UDP' | 'ICMP';
  port: string; // e.g. "80", "5432", "ALL"
  source: string; // e.g. "0.0.0.0/0", "subnet-id", "node-id"
}

interface SecurityGroupsModalProps {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  allNodes: ContainerData[];
  allSubnets: Array<{ id: string; name: string }>;
  rules: SecurityGroupRule[];
  onClose: () => void;
  onSaveRules: (rules: SecurityGroupRule[]) => void;
}

export default function SecurityGroupsModal({
  nodeName,
  nodeType,
  allNodes,
  allSubnets,
  rules,
  onClose,
  onSaveRules
}: SecurityGroupsModalProps) {

  const handleAddRule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const type = formData.get('type') as 'inbound' | 'outbound';
    const action = formData.get('action') as 'ALLOW' | 'DENY';
    const protocol = (formData.get('protocol') || 'ALL') as 'ALL' | 'TCP' | 'UDP' | 'ICMP';
    const port = formData.get('port') as string;
    const source = formData.get('source') as string;

    const newRule: SecurityGroupRule = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      action,
      protocol,
      port: port || 'ALL',
      source: source || '0.0.0.0/0'
    };

    onSaveRules([newRule, ...rules]);
    e.currentTarget.reset();
  };

  const handleDeleteRule = (ruleId: string) => {
    onSaveRules(rules.filter(r => r.id !== ruleId));
  };

  const handleMoveRuleUp = (index: number) => {
    if (index > 0) {
      const newRules = [...rules];
      const temp = newRules[index];
      newRules[index] = newRules[index - 1];
      newRules[index - 1] = temp;
      onSaveRules(newRules);
    }
  };

  const handleMoveRuleDown = (index: number) => {
    if (index < rules.length - 1) {
      const newRules = [...rules];
      const temp = newRules[index];
      newRules[index] = newRules[index + 1];
      newRules[index + 1] = temp;
      onSaveRules(newRules);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <ShieldAlert size={18} color="#EF4444" />
            <span style={styles.title}>Security Group: {nodeName} ({nodeType})</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.body}>
          <div style={styles.infoBox}>
            <p style={styles.infoText}>
              Security groups act as a virtual firewall for your container instance to control inbound and outbound traffic. By default, all traffic that is not explicitly allowed is denied.
            </p>
          </div>

          <div style={styles.rulesListSection}>
            <h4 style={styles.sectionTitle}>Active Traffic Rules</h4>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}>
                    <th style={styles.th}>Direction</th>
                    <th style={styles.th}>Action</th>
                    <th style={styles.th}>Protocol</th>
                    <th style={styles.th}>Port</th>
                    <th style={styles.th}>Source / Dest</th>
                    <th style={styles.thAction}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length > 0 ? (
                    rules.map((rule, index) => {
                      // Resolve source name
                      let resolvedSource = rule.source;
                      const matchedNode = allNodes.find(n => n.id === rule.source);
                      if (matchedNode) resolvedSource = `Node: ${matchedNode.name}`;
                      else {
                        const matchedSubnet = allSubnets.find(s => s.id === rule.source);
                        if (matchedSubnet) resolvedSource = `Subnet: ${matchedSubnet.name}`;
                      }

                      return (
                        <tr key={rule.id} style={styles.tr}>
                          <td style={styles.td}>
                            <span style={{ 
                              ...styles.badge, 
                              backgroundColor: rule.type === 'inbound' ? '#DBEAFE' : '#F3E8FF',
                              color: rule.type === 'inbound' ? '#1E40AF' : '#6B21A8'
                            }}>
                              {rule.type.toUpperCase()}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span style={{ 
                              ...styles.badge, 
                              backgroundColor: rule.action === 'ALLOW' ? '#D1FAE5' : '#FEE2E2',
                              color: rule.action === 'ALLOW' ? '#065F46' : '#991B1B'
                            }}>
                              {rule.action}
                            </span>
                          </td>
                          <td style={styles.tdCode}><code>{rule.protocol || 'ALL'}</code></td>
                          <td style={styles.tdCode}><code>{rule.port}</code></td>
                          <td style={styles.td}>{resolvedSource}</td>
                          <td style={styles.tdAction}>
                            <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                              <button
                                disabled={index === 0}
                                onClick={() => handleMoveRuleUp(index)}
                                style={{
                                  ...styles.moveBtn,
                                  opacity: index === 0 ? 0.3 : 1,
                                  cursor: index === 0 ? 'not-allowed' : 'pointer'
                                }}
                                title="Move Up"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                disabled={index === rules.length - 1}
                                onClick={() => handleMoveRuleDown(index)}
                                style={{
                                  ...styles.moveBtn,
                                  opacity: index === rules.length - 1 ? 0.3 : 1,
                                  cursor: index === rules.length - 1 ? 'not-allowed' : 'pointer'
                                }}
                                title="Move Down"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteRule(rule.id)}
                                style={styles.deleteBtn}
                                title="Delete Rule"
                              >
                                <Trash size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr style={styles.tr}>
                      <td colSpan={6} style={styles.tdEmpty}>No rules configured. All traffic is blocked.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.formSection}>
            <h4 style={styles.sectionTitle}>Add Rule</h4>
            <form onSubmit={handleAddRule} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Direction</label>
                <select name="type" style={styles.select}>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Action</label>
                <select name="action" style={styles.select}>
                  <option value="ALLOW">ALLOW</option>
                  <option value="DENY">DENY</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Protocol</label>
                <select name="protocol" style={styles.select}>
                  <option value="ALL">ALL</option>
                  <option value="TCP">TCP</option>
                  <option value="UDP">UDP</option>
                  <option value="ICMP">ICMP</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Port Range</label>
                <input
                  required
                  name="port"
                  type="text"
                  placeholder="e.g. 80, 5432, ALL"
                  defaultValue={
                    (nodeType === 'postgres' || nodeType === 'sql')
                      ? '5432'
                      : nodeType === 'nosql'
                        ? '27017'
                        : nodeType === 'mysql'
                          ? '3306'
                          : '80'
                  }
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroupWide}>
                <label style={styles.label}>Source / Destination</label>
                <select name="source" style={styles.select}>
                  <option value="0.0.0.0/0">Anywhere (0.0.0.0/0)</option>
                  <optgroup label="Subnets">
                    {allSubnets.map(s => (
                      <option key={s.id} value={s.id}>Subnet: {s.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Nodes">
                    {allNodes.map(n => (
                      <option key={n.id} value={n.id}>Node: {n.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <button type="submit" style={styles.addBtn}>
                <Plus size={14} style={{ marginRight: 4 }} />
                Add Rule
              </button>
            </form>
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
    width: '850px',
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
    overflowY: 'auto',
    maxHeight: '80vh',
  },
  infoBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
    border: '1px solid rgba(239, 68, 68, 0.1)',
    borderRadius: '8px',
    padding: '12px',
  },
  infoText: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
  },
  rulesListSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    margin: '0 0 4px 0',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  tableWrapper: {
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  thRow: {
    backgroundColor: 'var(--bg-main)',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
  },
  thAction: {
    textAlign: 'right',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid var(--border-color)',
  },
  td: {
    padding: '8px 12px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
  },
  tdCode: {
    padding: '8px 12px',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap',
  },
  tdAction: {
    padding: '8px 12px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  tdEmpty: {
    padding: '16px',
    textAlign: 'center',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  badge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#EF4444',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  moveBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    transition: 'background-color 0.2s, color 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSection: {
    borderTop: '1px solid var(--border-color)',
    paddingTop: '16px',
    marginTop: '8px',
  },
  form: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: '1 1 100px',
  },
  formGroupWide: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: '2 1 180px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
  },
  select: {
    padding: '6px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    fontSize: '12px',
    backgroundColor: '#FFF',
    outline: 'none',
    height: '32px',
  },
  input: {
    padding: '6px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
    height: '32px',
    boxSizing: 'border-box',
  },
  addBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '6px',
    padding: '0 16px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
};
