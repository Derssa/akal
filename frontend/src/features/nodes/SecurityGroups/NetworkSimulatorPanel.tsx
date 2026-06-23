import { useState } from 'react';
import { Send, CheckCircle2, XCircle } from 'lucide-react';
import type { ContainerData } from '../../../shared/types';
import type { SecurityGroupRule } from './SecurityGroupsModal';

interface NetworkSimulatorPanelProps {
  nodes: ContainerData[];
  subnets: Array<{ id: string; name: string; type: 'public' | 'private'; vpcId: string | null }>;
  nodeSecurityGroups: Record<string, SecurityGroupRule[]>;
  nodeSubnetMap: Record<string, string>; // nodeId -> subnetId
}

export default function NetworkSimulatorPanel({
  nodes,
  subnets,
  nodeSecurityGroups,
  nodeSubnetMap
}: NetworkSimulatorPanelProps) {
  const [sourceNodeId, setSourceNodeId] = useState('');
  const [destNodeId, setDestNodeId] = useState('');
  const [port, setPort] = useState('80');
  const [simulationResult, setSimulationResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

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

    const sourceSubnet = subnets.find(s => s.id === sourceSubnetId);
    const destSubnet = subnets.find(s => s.id === destSubnetId);

    // 1. Check VPC Boundaries
    const sourceVpcId = sourceSubnet?.vpcId || null;
    const destVpcId = destSubnet?.vpcId || null;

    if (sourceVpcId !== destVpcId) {
      setSimulationResult({
        success: false,
        message: 'Connection Blocked',
        details: 'Blocked: Nodes are in different VPCs. Inter-VPC traffic is isolated by default.'
      });
      return;
    }

    if (!sourceVpcId) {
      setSimulationResult({
        success: false,
        message: 'Connection Blocked',
        details: 'Blocked: Nodes must be assigned to subnets inside a VPC to communicate.'
      });
      return;
    }

    // 2. Check Security Group Rules (Destination Inbound Rules)
    const destRules = nodeSecurityGroups[destNode.id] || [];
    const inboundRules = destRules.filter(r => r.type === 'inbound');

    // Rule engine: By default, everything is DENIED unless an ALLOW rule matches
    let isAllowed = false;
    let matchingRule: SecurityGroupRule | null = null;

    for (const rule of inboundRules) {
      // Check Port match
      const isIcmp = rule.protocol === 'ICMP';
      const portMatch = rule.port === 'ALL' || rule.port === port;
      if (!portMatch && !isIcmp) continue;

      // Check Source match
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
          break; // First match wins (like iptables)
        } else if (rule.action === 'DENY') {
          // Explicit DENY takes precedence
          isAllowed = false;
          matchingRule = rule;
          break; // First match wins
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
    <div style={styles.panel} className="glass">
      <div style={styles.header}>
        <Send size={14} color="var(--color-accent)" />
        <span style={styles.title}>Traffic Route Simulator</span>
      </div>

      <div style={styles.body}>
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
                {n.name} ({nodeSubnetMap[n.id] ? 'Subnet' : 'No Subnet'})
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
                {n.name} ({nodeSubnetMap[n.id] ? 'Subnet' : 'No Subnet'})
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
            style={styles.input}
          />
        </div>

        <button onClick={handleSimulate} style={styles.simulateBtn}>
          Test Packet
        </button>

        {simulationResult && (
          <div style={{
            ...styles.resultBox,
            backgroundColor: simulationResult.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
            border: `1px solid ${simulationResult.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
          }}>
            <div style={styles.resultTitleRow}>
              {simulationResult.success ? (
                <CheckCircle2 size={16} color="#10B981" />
              ) : (
                <XCircle size={16} color="#EF4444" />
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    bottom: '24px',
    left: '24px',
    width: '320px',
    borderRadius: '10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-surface-solid)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-main)',
  },
  title: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  body: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  formGroupShort: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    width: '100px',
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
  },
  input: {
    padding: '6px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
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
    marginTop: '4px',
  },
  resultBox: {
    borderRadius: '6px',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '6px',
  },
  resultTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  resultTitle: {
    fontSize: '12px',
    fontWeight: 700,
  },
  resultDetails: {
    margin: 0,
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.4',
  }
};
