import { useState } from 'react';
import { X, Shield, Send, CheckCircle2, XCircle } from 'lucide-react';
import type { ContainerData } from '../../../shared/types';
import type { SecurityGroupRule } from '../SecurityGroups/SecurityGroupsModal';

export interface VPCConfig {
  name: string;
  cidr: string;
  dnsEnabled: boolean;
  igwEnabled: boolean;
  description: string;
}

interface VpcModalProps {
  vpcConfig: VPCConfig;
  subnets: Array<{ id: string; name: string; type: 'public' | 'private'; vpcId: string | null }>;
  nodes: ContainerData[];
  nodeSecurityGroups: Record<string, SecurityGroupRule[]>;
  nodeSubnetMap: Record<string, string>;
  onClose: () => void;
  onSaveVpcConfig: (config: VPCConfig) => void;
}

export default function VpcModal({
  vpcConfig,
  subnets,
  nodes,
  nodeSecurityGroups,
  nodeSubnetMap,
  onClose,
  onSaveVpcConfig
}: VpcModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'simulator'>('info');
  
  // VPC Config State Form
  const [name, setName] = useState(vpcConfig.name);
  const [cidr, setCidr] = useState(vpcConfig.cidr);
  const [dnsEnabled, setDnsEnabled] = useState(vpcConfig.dnsEnabled);
  const [igwEnabled, setIgwEnabled] = useState(vpcConfig.igwEnabled);
  const [description, setDescription] = useState(vpcConfig.description);

  // Traffic Simulator state
  const [sourceNodeId, setSourceNodeId] = useState('');
  const [destNodeId, setDestNodeId] = useState('');
  const [port, setPort] = useState('80');
  const [simulationResult, setSimulationResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveVpcConfig({
      name,
      cidr,
      dnsEnabled,
      igwEnabled,
      description
    });
  };

  const handleSimulate = () => {
    if (!sourceNodeId || !destNodeId) {
      setSimulationResult({
        success: false,
        message: 'Simulation Error',
        details: 'Please select both source and destination nodes.'
      });
      return;
    }

    if (sourceNodeId === destNodeId) {
      setSimulationResult({
        success: false,
        message: 'Loopback Connection',
        details: 'Local loopback connection (localhost) is always allowed.'
      });
      return;
    }

    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    const destNode = nodes.find(n => n.id === destNodeId);

    if (!sourceNode || !destNode) {
      setSimulationResult({
        success: false,
        message: 'Simulation Error',
        details: 'Selected nodes could not be found.'
      });
      return;
    }

    const sourceSubnetId = nodeSubnetMap[sourceNode.id];
    const destSubnetId = nodeSubnetMap[destNode.id];

    // 1. Check Security Group Rules (Destination Inbound Rules)
    const destRules = nodeSecurityGroups[destNode.id] || [];
    const inboundRules = destRules.filter(r => r.type === 'inbound');

    let isAllowed = false;
    let matchingRule: SecurityGroupRule | null = null;

    for (const rule of inboundRules) {
      const portMatch = rule.port === 'ALL' || rule.port === port;
      if (!portMatch) continue;

      let sourceMatch = false;
      if (rule.source === '0.0.0.0/0') {
        sourceMatch = true;
      } else if (rule.source === sourceSubnetId) {
        sourceMatch = true;
      } else if (rule.source === sourceNode.id) {
        sourceMatch = true;
      }

      if (sourceMatch) {
        if (rule.action === 'ALLOW') {
          isAllowed = true;
          matchingRule = rule;
        } else if (rule.action === 'DENY') {
          isAllowed = false;
          matchingRule = rule;
          break;
        }
      }
    }

    if (isAllowed) {
      setSimulationResult({
        success: true,
        message: 'Connection Allowed',
        details: `Allowed by rule: Inbound ALLOW port ${matchingRule?.port} from ${
          matchingRule?.source === '0.0.0.0/0' ? 'Anywhere' : 'authorized source'
        }.`
      });
    } else {
      setSimulationResult({
        success: false,
        message: 'Blocked by Security Group',
        details: `Implicit Deny: No security group rule on "${destNode.name}" allows inbound traffic on port ${port} from "${sourceNode.name}".`
      });
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <Shield size={18} color="var(--color-accent)" />
            <span style={styles.title}>Project VPC Configuration</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div style={styles.tabsRow}>
          <button
            onClick={() => setActiveTab('info')}
            style={{
              ...styles.tabBtn,
              borderBottom: activeTab === 'info' ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: activeTab === 'info' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'info' ? 700 : 500
            }}
          >
            VPC settings & Info
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            style={{
              ...styles.tabBtn,
              borderBottom: activeTab === 'simulator' ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: activeTab === 'simulator' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'simulator' ? 700 : 500
            }}
          >
            Traffic Route Simulator
          </button>
        </div>

        <div style={styles.body}>
          {activeTab === 'info' && (
            <div style={styles.tabContent}>
              <form onSubmit={handleSaveSettings} style={styles.formSettings}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>VPC Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={styles.input}
                    placeholder="e.g. Primary VPC"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>CIDR Block</label>
                  <input
                    type="text"
                    value={cidr}
                    onChange={(e) => setCidr(e.target.value)}
                    style={styles.input}
                    placeholder="e.g. 10.0.0.0/16"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={styles.textarea}
                    placeholder="Describe this VPC..."
                  />
                </div>
                <div style={styles.checkboxGroup}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={dnsEnabled}
                      onChange={(e) => setDnsEnabled(e.target.checked)}
                      style={styles.checkbox}
                    />
                    <span>DNS Resolution Enabled</span>
                  </label>
                </div>
                <div style={styles.checkboxGroup}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={igwEnabled}
                      onChange={(e) => setIgwEnabled(e.target.checked)}
                      style={styles.checkbox}
                    />
                    <span>Internet Gateway (IGW) Attached</span>
                  </label>
                </div>
                <button type="submit" style={styles.saveBtnSettings}>Save Configurations</button>
              </form>

              <div style={styles.section}>
                <h4 style={styles.sectionTitle}>Active Subnets ({subnets.length})</h4>
                {subnets.length > 0 ? (
                  <div style={styles.list}>
                    {subnets.map(subnet => (
                      <div key={subnet.id} style={styles.listItem}>
                        <div style={styles.listItemTitle}>{subnet.name}</div>
                        <span style={{
                          ...styles.badge,
                          backgroundColor: subnet.type === 'public' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          color: subnet.type === 'public' ? '#10B981' : '#F59E0B'
                        }}>
                          {subnet.type.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={styles.emptyText}>No subnets exist in the VPC. Add subnets from the Node Library sidebar.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'simulator' && (
            <div style={styles.tabContent}>
              <div style={styles.simulatorGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Source Node</label>
                  <select 
                    value={sourceNodeId}
                    onChange={(e) => setSourceNodeId(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">-- Select Source --</option>
                    {nodes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({nodeSubnetMap[n.id] ? 'Subnet' : 'Root VPC'})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Destination Node</label>
                  <select 
                    value={destNodeId}
                    onChange={(e) => setDestNodeId(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">-- Select Destination --</option>
                    {nodes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({nodeSubnetMap[n.id] ? 'Subnet' : 'Root VPC'})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroupShort}>
                  <label style={styles.label}>Dest Port</label>
                  <input 
                    type="text" 
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="e.g. 80, 5432"
                    style={styles.inputPort}
                  />
                </div>
              </div>

              <button onClick={handleSimulate} style={styles.simulateBtn}>
                <Send size={14} style={{ marginRight: 6 }} />
                Test Packet Communication
              </button>

              {simulationResult && (
                <div style={{
                  ...styles.resultBox,
                  backgroundColor: simulationResult.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${simulationResult.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                }}>
                  <div style={styles.resultTitleRow}>
                    {simulationResult.success ? (
                      <CheckCircle2 size={18} color="#10B981" />
                    ) : (
                      <XCircle size={18} color="#EF4444" />
                    )}
                    <span style={{
                      ...styles.resultTitle,
                      color: simulationResult.success ? '#10B981' : '#EF4444'
                    }}>
                      {simulationResult.message}
                    </span>
                  </div>
                  <p style={styles.resultDetails}>{simulationResult.details}</p>
                </div>
              )}
            </div>
          )}
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
    width: '600px',
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
  tabsRow: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-main)',
  },
  tabBtn: {
    flex: 1,
    padding: '12px',
    border: 'none',
    background: 'none',
    fontSize: '12px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
  },
  body: {
    backgroundColor: '#FFFFFF',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxHeight: '70vh',
    overflowY: 'auto',
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formSettings: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
  },
  formGroupShort: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
  },
  input: {
    padding: '8px 12px',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
  },
  textarea: {
    padding: '8px 12px',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
    resize: 'vertical',
    minHeight: '60px',
    fontFamily: 'var(--font-sans)',
  },
  checkboxGroup: {
    display: 'flex',
    alignItems: 'center',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  saveBtnSettings: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '6px',
    transition: 'background-color 0.2s',
  },
  inputPort: {
    padding: '6px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box',
    height: '32px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: 'var(--bg-main)',
    borderBottom: '1px solid var(--border-color)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  listItemTitle: {
    fontWeight: 600,
  },
  badge: {
    fontSize: '9px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
  },
  emptyText: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  simulatorGrid: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
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
  simulateBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '6px',
    padding: '8px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '6px',
  },
  resultBox: {
    borderRadius: '6px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '10px',
  },
  resultTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  resultTitle: {
    fontSize: '13px',
    fontWeight: 700,
  },
  resultDetails: {
    margin: 0,
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.4',
  }
};
