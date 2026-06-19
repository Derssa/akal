import { useState } from 'react';
import { X, Globe, BookOpen, ListOrdered, ShieldAlert, Cpu } from 'lucide-react';

interface NatGatewayModalProps {
  nodeName: string;
  ipAddress?: string;
  state: string;
  onClose: () => void;
}

export default function NatGatewayModal({
  nodeName,
  ipAddress,
  state,
  onClose
}: NatGatewayModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'explain' | 'guide' | 'cheatsheet'>('details');

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <Globe size={18} color="#8B5CF6" />
            <span style={styles.title}>{nodeName} - Managed NAT Gateway</span>
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
            <Cpu size={14} /> Details
          </button>
          <button 
            style={activeTab === 'explain' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('explain')}
          >
            <BookOpen size={14} /> What is a NAT?
          </button>
          <button 
            style={activeTab === 'guide' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('guide')}
          >
            <ListOrdered size={14} /> Setup Guide
          </button>
          <button 
            style={activeTab === 'cheatsheet' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('cheatsheet')}
          >
            <ShieldAlert size={14} /> Cheat Sheet
          </button>
        </div>

        <div style={styles.body}>
          {/* Tab 1: Live Details */}
          {activeTab === 'details' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>Gateway Specifications (Cloud Simulator)</h4>
              <div style={styles.grid}>
                <div style={styles.gridItem}>
                  <span style={styles.label}>Resource Name:</span>
                  <span style={styles.value}>{nodeName}</span>
                </div>
                <div style={styles.gridItem}>
                  <span style={styles.label}>Type:</span>
                  <span style={styles.value}>Managed NAT Gateway (AWS Style)</span>
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
                  <span style={styles.label}>Public IP Address:</span>
                  <span style={{ ...styles.value, fontWeight: 'bold' }}>{ipAddress || 'Pending allocation...'}</span>
                </div>
              </div>
              <div style={styles.infoBox}>
                <p style={styles.infoText}>
                  ℹ️ <strong>Cloud Standard:</strong> In real clouds (AWS, GCP, Azure), NAT Gateways are fully managed services. Users cannot SSH or launch a terminal session on them. They operate purely as serverless routing assets.
                </p>
                <p style={{ ...styles.infoText, marginTop: '8px' }}>
                  🚫 <strong>No Direct Pings:</strong> Real managed NAT Gateways do not respond to direct pings or port connections themselves. They will drop any direct traffic destined for their IP addresses, but they will successfully forward transit traffic (like pings from a private subnet server to 8.8.8.8).
                </p>
              </div>
            </div>
          )}

          {/* Tab 2: What is NAT */}
          {activeTab === 'explain' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>What is a NAT Gateway?</h4>
              <p style={styles.para}>
                A <strong>NAT (Network Address Translation) Gateway</strong> allows instances in a <strong>private subnet</strong> to connect to services outside your VPC (like the public internet or external APIs), but prevents external services from initiating unsolicited inbound connections with those private instances.
              </p>
              <h5 style={styles.subSectionTitle}>Key Characteristics</h5>
              <ul style={styles.list}>
                <li><strong>One-Way Access:</strong> Keeps instances hidden and protected from direct internet attacks while allowing them to download updates/packages.</li>
                <li><strong>Source Address Translation:</strong> Replaces the client instance's private IP with the NAT Gateway's public IP before sending the packet to the internet.</li>
                <li><strong>Stateful Routing:</strong> Remembers the outgoing connection so it can correctly return response packets back to the original client.</li>
              </ul>
            </div>
          )}

          {/* Tab 3: Step-by-Step Setup Guide */}
          {activeTab === 'guide' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>Step-by-Step Configuration Guide</h4>
              <div style={styles.steps}>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>1</div>
                  <div style={styles.stepText}>
                    <strong>Place NAT in Public Subnet:</strong> Always deploy your NAT Gateway node in a <strong>Public Subnet</strong> (one that has an active internet pathway).
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>2</div>
                  <div style={styles.stepText}>
                    <strong>Route Public Subnet to IGW:</strong> In the Public Subnet routing table, verify there is an outbound rule: <br />
                    <code>0.0.0.0/0</code> ➡️ target <code>igw</code>.
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>3</div>
                  <div style={styles.stepText}>
                    <strong>Point Private Subnet to NAT:</strong> Open the Private Subnet's routing table modal. Add a new route rule: <br />
                    <code>0.0.0.0/0</code> ➡️ target <code>{nodeName}</code> (e.g. <code>NAT-1</code>).
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>4</div>
                  <div style={styles.stepText}>
                    <strong>Verification:</strong> Open the terminal of any client server in your Private Subnet. Run <code>ping -c 3 1.1.1.1</code>. The traffic will route through your NAT Gateway!
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Cheat Sheet */}
          {activeTab === 'cheatsheet' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>VPC Architecture Cheat Sheet</h4>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}>
                    <th style={styles.th}>Resource</th>
                    <th style={styles.th}>Subnet Placement</th>
                    <th style={styles.th}>Internet Access Method</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={styles.tr}>
                    <td style={styles.tdCode}>Internet Gateway (IGW)</td>
                    <td style={styles.td}>Attached to VPC edge</td>
                    <td style={styles.td}>Bridges public subnets to public internet directly.</td>
                  </tr>
                  <tr style={styles.tr}>
                    <td style={styles.tdCode}>NAT Gateway</td>
                    <td style={styles.td}>Public Subnet</td>
                    <td style={styles.td}>Acts as middleman for private subnets. Needs an attached EIP.</td>
                  </tr>
                  <tr style={styles.tr}>
                    <td style={styles.tdCode}>App Instances / DBs</td>
                    <td style={styles.td}>Private Subnet</td>
                    <td style={styles.td}>Can only access internet if routed through a NAT Gateway.</td>
                  </tr>
                </tbody>
              </table>
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
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-main)',
  },
  tab: {
    flex: 1,
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--color-text-secondary)',
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
    borderBottom: '2px solid #8B5CF6',
    color: '#8B5CF6',
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
    maxHeight: '450px',
    overflowY: 'auto',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    margin: '0 0 4px 0',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  subSectionTitle: {
    margin: '10px 0 4px 0',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    backgroundColor: '#F9FAFB',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
  },
  gridItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: '13px',
    color: 'var(--color-text-primary)',
  },
  infoBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    border: '1px solid rgba(139, 92, 246, 0.15)',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '8px',
  },
  infoText: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
  },
  para: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
  },
  list: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
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
    backgroundColor: '#8B5CF6',
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
  }
};
