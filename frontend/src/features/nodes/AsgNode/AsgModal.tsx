import { useState, useEffect } from 'react';
import { X, Cpu, Server, AlertTriangle, RotateCw, Settings, Activity } from 'lucide-react';
import { API_BASE } from '../../../shared/types';
import type { ContainerData } from '../../../shared/types';

interface AsgModalProps {
  asgId: string;
  nodeName: string;
  projectId: string;
  config?: any; // networkConfig
  containers: ContainerData[];
  onClose: () => void;
  onSaveConfig: (asgConfig: {
    desiredCapacity: number;
    minCapacity: number;
    maxCapacity: number;
    parentId: string;
    subnetIds: string[];
  }) => Promise<void>;
  onRefreshContainers: () => Promise<void>;
}

export default function AsgModal({
  asgId,
  nodeName,
  projectId,
  config,
  containers,
  onClose,
  onSaveConfig,
  onRefreshContainers
}: AsgModalProps) {
  const asgData = config?.asgs?.[asgId] || {
    desiredCapacity: 1,
    minCapacity: 1,
    maxCapacity: 4,
    parentId: '',
    subnetIds: []
  };

  const [desiredCapacity, setDesiredCapacity] = useState<number>(asgData.desiredCapacity);
  const [minCapacity, setMinCapacity] = useState<number>(asgData.minCapacity || 1);
  const [maxCapacity, setMaxCapacity] = useState<number>(asgData.maxCapacity || 4);
  const [parentId, setParentId] = useState<string>(asgData.parentId || '');
  const [selectedSubnets, setSelectedSubnets] = useState<string[]>(asgData.subnetIds || []);

  const [activeTab, setActiveTab] = useState<'details' | 'simulation'>('details');
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);

  // Get available template servers (Only general purpose Ubuntu nodes that are NOT ASG instances themselves)
  const availableTemplates = containers.filter(
    c => c.type === 'ubuntu' && !c.isAsgInstance
  );

  // Filter dynamic instances spawned by this ASG
  const asgInstances = containers.filter(
    c => c.asgId === asgId && c.isAsgInstance
  );

  // Trigger self-healing monitor query every 2 seconds when simulation tab is active
  useEffect(() => {
    if (activeTab !== 'simulation') return;
    const interval = setInterval(() => {
      onRefreshContainers();
    }, 2000);
    return () => clearInterval(interval);
  }, [activeTab, onRefreshContainers]);

  const handleToggleSubnet = (subnetId: string) => {
    setSelectedSubnets(prev =>
      prev.includes(subnetId)
        ? prev.filter(id => id !== subnetId)
        : [...prev, subnetId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveConfig({
        desiredCapacity,
        minCapacity,
        maxCapacity,
        parentId,
        subnetIds: selectedSubnets
      });
      // Save changes trigger scaling API
      await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/${asgId}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desiredCapacity,
          subnetIds: selectedSubnets
        })
      });
      await onRefreshContainers();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (!parentId) return;
    setDeploying(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/${asgId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentNodeId: parentId,
          desiredCapacity,
          subnetIds: selectedSubnets
        })
      });
      if (res.ok) {
        await onRefreshContainers();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeploying(false);
    }
  };

  const handleSimulateFailure = async (instanceId: string) => {
    setTerminatingId(instanceId);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId })
      });
      if (res.ok) {
        await onRefreshContainers();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTerminatingId(null);
    }
  };



  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <Cpu size={18} color="#EC4899" />
            <span style={styles.title}>{nodeName} Configuration</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div style={styles.tabBar}>
          <button
            style={activeTab === 'details' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('details')}
          >
            <Settings size={14} /> Design & Scaling settings
          </button>
          <button
            style={activeTab === 'simulation' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('simulation')}
          >
            <Activity size={14} /> Simulation & Live Grid ({asgInstances.length})
          </button>
        </div>

        <div style={styles.content}>
          {activeTab === 'details' ? (
            <div style={styles.tabContent}>
              <div style={styles.grid2Col}>
                {/* Launch Template select */}
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>1. Launch Template Source</h3>
                  <p style={{ fontSize: '11px', color: '#6B7280', marginBottom: '8px' }}>
                    Select a parent Ubuntu server to use as the golden launch template for ASG scaling replica copies:
                  </p>
                  <div style={{ marginTop: '12px' }}>
                    <label style={styles.fieldLabel}>Select Template Server</label>
                    <select
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      style={styles.select}
                    >
                      <option value="">-- Select template server --</option>
                      {availableTemplates.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.ip || 'pending'})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Subnet settings */}
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>2. VPC Subnet Targets</h3>
                  <p style={{ fontSize: '11px', color: '#6B7280', marginBottom: '8px' }}>
                    Choose the subnets where the ASG can deploy scaling replica servers:
                  </p>
                  <div style={styles.subnetList}>
                    {config?.subnets?.map((subnet: any) => (
                      <label key={subnet.id} style={styles.subnetItem}>
                        <input
                          type="checkbox"
                          checked={selectedSubnets.includes(subnet.id)}
                          onChange={() => handleToggleSubnet(subnet.id)}
                          style={{ marginRight: '8px' }}
                        />
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '12px' }}>{subnet.name}</span>
                          <span style={{ fontSize: '10px', color: '#9CA3AF', marginLeft: '6px' }}>({subnet.type})</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scaling values */}
              <div style={{ ...styles.section, marginTop: '16px' }}>
                <h3 style={styles.sectionTitle}>3. Instance Capacity Limits</h3>
                <div style={styles.capacityRow}>
                  <div style={styles.capacityField}>
                    <label style={styles.fieldLabel}>Min Instances</label>
                    <input
                      type="number"
                      min={1}
                      max={maxCapacity}
                      value={minCapacity}
                      onChange={(e) => setMinCapacity(parseInt(e.target.value) || 1)}
                      style={styles.inputNum}
                    />
                  </div>
                  <div style={styles.capacityField}>
                    <label style={styles.fieldLabel}>Max Instances</label>
                    <input
                      type="number"
                      min={minCapacity}
                      max={10}
                      value={maxCapacity}
                      onChange={(e) => setMaxCapacity(parseInt(e.target.value) || 4)}
                      style={styles.inputNum}
                    />
                  </div>
                  <div style={styles.capacityField}>
                    <label style={styles.fieldLabel}>Desired Instances</label>
                    <input
                      type="number"
                      min={minCapacity}
                      max={maxCapacity}
                      value={desiredCapacity}
                      onChange={(e) => setDesiredCapacity(parseInt(e.target.value) || 1)}
                      style={styles.inputNum}
                    />
                  </div>
                </div>
              </div>

              {/* Save / Deploy buttons */}
              <div style={styles.footer}>
                <button
                  onClick={handleSave}
                  disabled={saving || !parentId || selectedSubnets.length === 0}
                  style={{ ...styles.actionBtn, backgroundColor: '#3B82F6' }}
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
                {parentId && (
                  <button
                    onClick={handleDeploy}
                    disabled={deploying}
                    style={{ ...styles.actionBtn, backgroundColor: '#EC4899' }}
                  >
                    {deploying ? (
                      <>
                        <RotateCw size={14} className="spin" style={{ marginRight: '6px' }} />
                        Rolling deployment...
                      </>
                    ) : (
                      'Create Image & Deploy'
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.tabContent}>
              {/* Simulation view */}
              <div style={styles.infoBanner}>
                <Activity size={18} color="#3B82F6" />
                <span style={{ fontSize: '12px', color: '#1E3A8A', fontWeight: '500' }}>
                  Auto Scaling self-healing check runs every 2s. If an instance is crashed, a replacement will launch.
                </span>
              </div>

              <div style={styles.instanceGrid}>
                {asgInstances.length === 0 ? (
                  <div style={styles.emptyState}>
                    <AlertTriangle size={24} color="#F59E0B" />
                    <span style={{ fontSize: '13px', color: '#4B5563', marginTop: '6px', fontWeight: 'bold' }}>
                      No active replicas deployed
                    </span>
                    <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
                      Setup template configuration and click "Deploy Code Changes" to spawn replicas.
                    </span>
                  </div>
                ) : (
                  asgInstances.map(instance => {
                    const isRunning = instance.state === 'running';
                    return (
                      <div key={instance.id} style={styles.instanceCard}>
                        <div style={styles.instanceHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Server size={18} color={isRunning ? '#10B981' : '#EF4444'} />
                            <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#1F2937' }}>
                              {instance.name}
                            </span>
                          </div>
                          <span style={{
                            fontSize: '9px',
                            backgroundColor: isRunning ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: isRunning ? '#10B981' : '#EF4444',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            fontWeight: 'bold'
                          }}>
                            {isRunning ? 'Healthy' : 'Crashed'}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '11px', color: '#6B7280', margin: '8px 0' }}>
                          <div><strong>IP:</strong> {instance.ip || 'Resolving...'}</div>
                          <div><strong>Image:</strong> {instance.image ? instance.image.split('/').pop() : 'ubuntu:latest'}</div>
                        </div>

                        {isRunning ? (
                          <button
                            onClick={() => handleSimulateFailure(instance.id)}
                            disabled={terminatingId === instance.id}
                            style={styles.killBtn}
                          >
                            {terminatingId === instance.id ? 'Stopping...' : 'Simulate Failure'}
                          </button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#EF4444', fontWeight: 'bold' }}>
                            <RotateCw size={12} className="spin" />
                            Self-healing auto-replacing...
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
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
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  container: {
    width: '680px',
    backgroundColor: 'var(--bg-surface-solid, #ffffff)',
    border: '1px solid var(--border-color, #E5E7EB)',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid var(--border-color, #E5E7EB)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontWeight: 'bold',
    fontSize: '15px',
    color: 'var(--color-text-primary, #111827)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#9CA3AF',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color, #E5E7EB)',
    backgroundColor: 'var(--bg-sidebar, #F9FAFB)',
  },
  tab: {
    flex: 1,
    padding: '12px',
    border: 'none',
    background: 'none',
    fontSize: '13px',
    fontWeight: 500,
    color: '#6B7280',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  tabActive: {
    flex: 1,
    padding: '12px',
    border: 'none',
    background: 'none',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#EC4899',
    borderBottom: '2px solid #EC4899',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  content: {
    padding: '20px',
    maxHeight: '480px',
    overflowY: 'auto',
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  grid2Col: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  section: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    border: '1px solid var(--border-color, #E5E7EB)',
    borderRadius: '8px',
    padding: '14px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: 'var(--color-text-primary, #374151)',
    marginBottom: '10px',
    borderBottom: '1px solid rgba(0,0,0,0.05)',
    paddingBottom: '4px',
  },
  dropZone: {
    height: '110px',
    border: '2px dashed #D1D5DB',
    borderRadius: '6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  select: {
    width: '100%',
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid #D1D5DB',
    fontSize: '12px',
  },
  fieldLabel: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#6B7280',
    marginBottom: '4px',
    display: 'block',
  },
  subnetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '140px',
    overflowY: 'auto',
  },
  subnetItem: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '4px 0',
  },
  capacityRow: {
    display: 'flex',
    gap: '20px',
  },
  capacityField: {
    flex: 1,
  },
  inputNum: {
    width: '100%',
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid #D1D5DB',
    fontSize: '12px',
    textAlign: 'center',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '12px',
    borderTop: '1px solid rgba(0,0,0,0.05)',
    paddingTop: '16px',
  },
  actionBtn: {
    padding: '8px 16px',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  infoBanner: {
    backgroundColor: '#EFF6FF',
    border: '1px solid #BFDBFE',
    borderRadius: '6px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  instanceGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px',
    marginTop: '10px',
  },
  instanceCard: {
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '12px',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
  },
  instanceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #F3F4F6',
    paddingBottom: '8px',
  },
  killBtn: {
    width: '100%',
    padding: '6px',
    backgroundColor: '#FEE2E2',
    color: '#EF4444',
    border: '1px solid #FCA5A5',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  emptyState: {
    gridColumn: 'span 2',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
  }
};
