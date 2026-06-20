import { useState } from 'react';
import { X, GitFork, BookOpen, ListOrdered, ShieldAlert, Cpu, Save, ArrowRight } from 'lucide-react';

interface TargetNode {
  id: string;
  name: string;
  ip?: string;
  state: string;
  type?: string;
}

interface LoadBalancerModalProps {
  containerId: string;
  nodeName: string;
  ipAddress?: string;
  port?: string;
  state: string;
  config?: {
    loadBalancerAlgorithm?: 'round_robin' | 'least_conn';
    loadBalancerTargets?: string[];
    loadBalancerTargetPort?: number;
    loadBalancerRoutingRules?: Array<{ path: string; targetId: string }>;
  };
  allNodes: Array<{
    id: string;
    type?: string;
    name?: string;
    ip?: string;
    state?: string;
    isAsgInstance?: boolean;
  }>;
  onClose: () => void;
  onSaveConfig: (
    algorithm: 'round_robin' | 'least_conn',
    targets: string[],
    targetPort: number,
    routingRules: Array<{ path: string; targetId: string }>
  ) => Promise<void>;
}

export default function LoadBalancerModal({
  containerId,
  nodeName,
  ipAddress,
  port,
  state,
  config,
  allNodes,
  onClose,
  onSaveConfig
}: LoadBalancerModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'explain' | 'guide' | 'cheatsheet'>('details');
  const [algorithm, setAlgorithm] = useState<'round_robin' | 'least_conn'>(config?.loadBalancerAlgorithm || 'round_robin');
  const [targetPort, setTargetPort] = useState<number>(config?.loadBalancerTargetPort || 80);
  
  // Get initial targets. If config.loadBalancerTargets doesn't exist, default to empty array
  const [selectedTargets, setSelectedTargets] = useState<string[]>(config?.loadBalancerTargets || []);
  const [routingRules, setRoutingRules] = useState<Array<{ path: string; targetId: string }>>(config?.loadBalancerRoutingRules || []);
  const [saving, setSaving] = useState(false);

  // Filter nodes to show Ubuntu servers and Auto Scaling Groups (excluding load balancers, database, nat, and active ASG dynamic replicas)
  const targetNodes: TargetNode[] = allNodes
    .filter(n => n.id !== containerId && (n.type === 'ubuntu' || n.type === 'autoscalinggroup') && !n.isAsgInstance)
    .map(n => ({
      id: n.id,
      name: n.name || '',
      ip: n.ip,
      state: n.state || 'stopped',
      type: n.type
    }));

  const handleToggleTarget = (nodeId: string) => {
    setSelectedTargets(prev => 
      prev.includes(nodeId)
        ? prev.filter(id => id !== nodeId)
        : [...prev, nodeId]
    );
  };

  const handleAddRule = () => {
    setRoutingRules(prev => [...prev, { path: `/service-${prev.length + 1}`, targetId: '' }]);
  };

  const handleRemoveRule = (index: number) => {
    setRoutingRules(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleRulePathChange = (index: number, path: string) => {
    setRoutingRules(prev => prev.map((r, idx) => idx === index ? { ...r, path } : r));
  };

  const handleRuleTargetChange = (index: number, targetId: string) => {
    setRoutingRules(prev => prev.map((r, idx) => idx === index ? { ...r, targetId } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveConfig(algorithm, selectedTargets, targetPort, routingRules);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <GitFork size={18} color="#EF4444" />
            <span style={styles.title}>{nodeName} - Application Load Balancer</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection */}
        <div style={styles.tabBar}>
          <button 
            style={activeTab === 'details' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('details')}
          >
            <Cpu size={14} /> Details & Config
          </button>
          <button 
            style={activeTab === 'explain' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('explain')}
          >
            <BookOpen size={14} /> What is a Load Balancer?
          </button>
          <button 
            style={activeTab === 'guide' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('guide')}
          >
            <ListOrdered size={14} /> Routing Guide
          </button>
          <button 
            style={activeTab === 'cheatsheet' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('cheatsheet')}
          >
            <ShieldAlert size={14} /> Local Testing
          </button>
        </div>

        <div style={styles.body}>
          {/* Tab 1: Live Details & Target Config */}
          {activeTab === 'details' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>Load Balancer Specifications</h4>
              <div style={styles.grid}>
                <div style={styles.gridItem}>
                  <span style={styles.label}>Resource Name:</span>
                  <span style={styles.value}>{nodeName}</span>
                </div>
                <div style={styles.gridItem}>
                  <span style={styles.label}>Type:</span>
                  <span style={styles.value}>Nginx HTTP Load Balancer</span>
                </div>
                <div style={styles.gridItem}>
                  <span style={styles.label}>Status:</span>
                  <span style={{ 
                    ...styles.value, 
                    color: state === 'running' ? '#10B981' : '#EF4444',
                    fontWeight: 'bold' 
                  }}>
                    {state === 'running' ? 'Active / Available' : 'Offline / Stopped'}
                  </span>
                </div>
                <div style={styles.gridItem}>
                  <span style={styles.label}>Private IP:</span>
                  <span style={{ ...styles.value, fontWeight: 'bold' }}>{ipAddress || 'Pending allocation...'}</span>
                </div>
                <div style={styles.gridItem}>
                  <span style={styles.label}>Dynamic Host Port:</span>
                  <span style={{ ...styles.value, fontWeight: 'bold', color: '#3B82F6' }}>
                    {port ? `${port} (Mapped to port 80)` : 'None (Node Stopped)'}
                  </span>
                </div>
                <div style={styles.gridItem}>
                  <span style={styles.label}>Public Endpoint:</span>
                  <span style={{ ...styles.value, color: '#3B82F6', fontWeight: 600 }}>
                    {port ? `http://localhost:${port}` : 'None'}
                  </span>
                </div>
              </div>

              <h4 style={{ ...styles.sectionTitle, marginTop: '16px' }}>Routing Configuration</h4>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Load Balancing Algorithm:</label>
                <select 
                  value={algorithm} 
                  onChange={(e) => setAlgorithm(e.target.value as 'round_robin' | 'least_conn')}
                  style={styles.select}
                >
                  <option value="round_robin">Round Robin (Distribute traffic sequentially)</option>
                  <option value="least_conn">Least Connections (Route to target with fewest connections)</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Target Port (on destination servers):</label>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={targetPort}
                  onChange={(e) => setTargetPort(parseInt(e.target.value, 10) || 80)}
                  style={styles.select}
                  placeholder="e.g. 80, 3000, 5000"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Target Group Servers (Ubuntu nodes):</label>
                {targetNodes.length === 0 ? (
                  <div style={styles.noNodesMessage}>
                    No targetable Ubuntu servers found in the network. Please create at least one Ubuntu server node.
                  </div>
                ) : (
                  <div style={styles.targetsList}>
                    {targetNodes.map(node => (
                      <label key={node.id} style={styles.targetItem}>
                        <input
                          type="checkbox"
                          checked={selectedTargets.includes(node.id)}
                          onChange={() => handleToggleTarget(node.id)}
                          style={{ marginRight: '8px' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                          <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            {node.name}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            IP: {node.ip || 'No IP'} | Status: {node.state}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: node.state === 'running' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: node.state === 'running' ? '#10B981' : '#EF4444',
                        }}>
                          {node.state === 'running' ? 'Online' : 'Offline'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: '16px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ ...styles.formLabel, fontWeight: 'bold', margin: 0 }}>Path-Based Routing Rules (ALB Listener):</label>
                  <button 
                    onClick={handleAddRule}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      color: '#2563EB',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    + Add Rule
                  </button>
                </div>
                {routingRules.length === 0 ? (
                  <div style={{ ...styles.noNodesMessage, padding: '8px 12px', fontSize: '11px' }}>
                    No path routing rules configured. Defaults to routing all traffic (/) to all selected targets.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {routingRules.map((rule, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="text"
                          value={rule.path}
                          onChange={(e) => handleRulePathChange(idx, e.target.value)}
                          placeholder="/path (e.g. /clinic)"
                          style={{ ...styles.select, flex: 1, padding: '4px 8px', fontSize: '12px' }}
                        />
                        <ArrowRight size={14} color="#6B7280" />
                        <select
                          value={rule.targetId}
                          onChange={(e) => handleRuleTargetChange(idx, e.target.value)}
                          style={{ ...styles.select, flex: 1.5, padding: '4px 8px', fontSize: '12px' }}
                        >
                          <option value="">-- Choose Target --</option>
                          {targetNodes.map(t => (
                            <option key={t.id} value={t.id}>{t.name} ({t.type === 'autoscalinggroup' ? 'ASG' : 'Server'})</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleRemoveRule(idx)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            color: '#EF4444',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 'bold'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={handleSave} 
                disabled={saving} 
                style={{
                  ...styles.saveBtn,
                  opacity: saving ? 0.7 : 1
                }}
              >
                <Save size={16} />
                {saving ? 'Saving changes...' : 'Apply Configuration'}
              </button>

              <div style={styles.infoBox}>
                <p style={styles.infoText}>
                  🚫 <strong>Managed Platform Boundary:</strong> Application Load Balancers are fully managed by the orchestration platform. Direct SSH terminal access is disabled.
                </p>
              </div>
            </div>
          )}

          {/* Tab 2: What is a Load Balancer */}
          {activeTab === 'explain' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>Understanding Load Balancing</h4>
              <p style={styles.para}>
                An <strong>Application Load Balancer (ALB)</strong> serves as a single entry point for client traffic. It acts as a reverse proxy, distributing incoming HTTP/HTTPS requests across multiple target servers in your backend fleet.
              </p>
              <h5 style={styles.subSectionTitle}>Key Benefits:</h5>
              <ul style={styles.list}>
                <li><strong>High Availability:</strong> Spreads load across multiple nodes so that if one server fails, others continue serving requests.</li>
                <li><strong>Scalability:</strong> Allows scaling the application capacity horizontally by simply registering new target servers.</li>
                <li><strong>Traffic Optimization:</strong> Ensures that no single server becomes a performance bottleneck.</li>
              </ul>
              <h5 style={styles.subSectionTitle}>Algorithms:</h5>
              <ul style={styles.list}>
                <li><strong>Round Robin:</strong> Requests are forwarded to targets sequentially. Ideal when target capacities are uniform.</li>
                <li><strong>Least Connections:</strong> Routes traffic to the target with the fewest active connections. Optimal for longer-running requests.</li>
              </ul>
            </div>
          )}

          {/* Tab 3: Routing Guide */}
          {activeTab === 'guide' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>Inbound Traffic Flow</h4>
              <p style={styles.para}>
                The Application Load Balancer functions inside your VPC on the public subnet. Here is how traffic traverses the network:
              </p>
              <div style={styles.steps}>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>1</div>
                  <div style={styles.stepText}>
                    <strong>Client Request:</strong> The client curls or browses to the load balancer's public entrypoint: <code>http://localhost:HOST_PORT</code>.
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>2</div>
                  <div style={styles.stepText}>
                    <strong>Security Group Evaluation:</strong> The Load Balancer security group evaluates the inbound request. Ensure you have an HTTP (Port 80) rule permitting traffic from <code>0.0.0.0/0</code>!
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>3</div>
                  <div style={styles.stepText}>
                    <strong>Reverse Proxy:</strong> The Nginx server picks a target from your active target group according to the selected algorithm (Round Robin / Least Conn) and forwards the HTTP request to the target's IP address on port 80.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Local Testing */}
          {activeTab === 'cheatsheet' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>Testing Load Balancing Locally</h4>
              <p style={styles.para}>
                To observe traffic balancing in action, follow this testing procedure:
              </p>
              <div style={styles.steps}>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>A</div>
                  <div style={styles.stepText}>
                    <strong>Start a web server on target nodes:</strong> Open a terminal on your target Ubuntu servers and start a simple web listener. For instance:
                    <pre style={styles.codeBlock}>python3 -m http.server 80 &</pre>
                    Create a file <code>index.html</code> with a unique label on each target server so you can distinguish which server is replying!
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>B</div>
                  <div style={styles.stepText}>
                    <strong>Verify Security Group Rules:</strong> Ensure the Load Balancer node has a Security Group rule allowing TCP port 80 from <code>0.0.0.0/0</code>.
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>C</div>
                  <div style={styles.stepText}>
                    <strong>Send requests to the Load Balancer:</strong> From your local computer terminal, run curl requests repeatedly to see Nginx cycle between targets:
                    <pre style={styles.codeBlock}>curl http://localhost:{port || 'HOST_PORT'}</pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box' as const,
  },
  container: {
    width: '650px',
    maxWidth: '100%',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-solid, #1F2937)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--color-text-primary, #F9FAFB)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted, #9CA3AF)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: '#111827',
  },
  tab: {
    flex: 1,
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#9CA3AF',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  tabActive: {
    flex: 1,
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #EF4444',
    color: '#EF4444',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  body: {
    backgroundColor: '#FFFFFF',
    padding: '20px',
    maxHeight: '480px',
    overflowY: 'auto' as const,
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  sectionTitle: {
    margin: '0 0 4px 0',
    fontSize: '14px',
    fontWeight: 700,
    color: '#111827',
  },
  subSectionTitle: {
    margin: '10px 0 4px 0',
    fontSize: '12px',
    fontWeight: 700,
    color: '#111827',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    backgroundColor: '#F9FAFB',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #E5E7EB',
  },
  gridItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '11px',
    color: '#6B7280',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  value: {
    fontSize: '13px',
    color: '#1F2937',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    marginBottom: '10px',
  },
  formLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#374151',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #D1D5DB',
    backgroundColor: '#FFF',
    fontSize: '13px',
    color: '#1F2937',
    outline: 'none',
  },
  targetsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    maxHeight: '150px',
    overflowY: 'auto' as const,
    border: '1px solid #E5E7EB',
    borderRadius: '6px',
    padding: '8px',
    backgroundColor: '#F9FAFB',
  },
  targetItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px',
    border: '1px solid #E5E7EB',
    borderRadius: '4px',
    backgroundColor: '#FFF',
    cursor: 'pointer',
  },
  noNodesMessage: {
    fontSize: '12px',
    color: '#9CA3AF',
    fontStyle: 'italic',
    padding: '12px',
    textAlign: 'center' as const,
    backgroundColor: '#F9FAFB',
    border: '1px dashed #D1D5DB',
    borderRadius: '6px',
  },
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: '#EF4444',
    color: '#FFF',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '6px',
    transition: 'background-color 0.2s',
  },
  infoBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '8px',
  },
  infoText: {
    margin: 0,
    fontSize: '12px',
    color: '#4B5563',
    lineHeight: '1.5',
  },
  para: {
    margin: 0,
    fontSize: '13px',
    color: '#4B5563',
    lineHeight: '1.6',
  },
  list: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '13px',
    color: '#4B5563',
    lineHeight: '1.6',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  step: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#EF4444',
    color: '#FFF',
    fontSize: '12px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '2px',
  },
  stepText: {
    fontSize: '13px',
    color: '#4B5563',
    lineHeight: '1.5',
  },
  codeBlock: {
    backgroundColor: '#1F2937',
    color: '#10B981',
    padding: '8px 12px',
    borderRadius: '6px',
    fontFamily: 'Courier New, Courier, monospace',
    fontSize: '12px',
    overflowX: 'auto' as const,
    marginTop: '6px',
    marginBottom: 0,
  }
};
