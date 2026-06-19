import { Handle, Position } from '@xyflow/react';
import { Play, Square, Trash2, GitFork, Settings, Shield } from 'lucide-react';
import styles from '../ServiceNode.module.css';

interface LoadBalancerNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    ip?: string;
    port?: string | number;
    config?: {
      loadBalancerAlgorithm?: 'round_robin' | 'least_conn';
      loadBalancerTargets?: string[];
    };
    onSecurityGroupOpen?: (id: string, name: string) => void;
    onInspect: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
  };
}

export default function LoadBalancerNode({ data }: LoadBalancerNodeProps) {
  const isRunning = data.state === 'running';
  const config = data.config || {};
  const algorithm = config.loadBalancerAlgorithm === 'least_conn' ? 'Least Connections' : 'Round Robin';
  const targetsCount = config.loadBalancerTargets?.length || 0;

  return (
    <div 
      className={styles.card} 
      style={{
        border: '2px solid #EF4444',
        boxShadow: isRunning ? '0 10px 15px -3px rgba(239, 68, 68, 0.15)' : undefined
      }}
    >
      <Handle type="target" position={Position.Left} id="target" className={styles.handle} />

      <div className={styles.header}>
        <div className={styles.titleContainer}>
          <GitFork size={18} color={isRunning ? '#EF4444' : '#6B7280'} />
          <span className={styles.title} style={{ color: '#DC2626' }}>{data.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onSecurityGroupOpen?.(data.id, data.name);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              marginLeft: '4px',
            }}
            title="Configure Security Group (Firewall)"
          >
            <Shield size={13} color="#EF4444" fill="rgba(239, 68, 68, 0.1)" />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            className={styles.indicator}
            style={{
              backgroundColor: isRunning ? '#10B981' : '#EF4444',
              boxShadow: isRunning
                ? '0 0 8px rgba(16, 185, 129, 0.6)'
                : '0 0 8px rgba(239, 68, 68, 0.6)'
            }}
          />
          <span className={styles.statusText}>{isRunning ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <div className={styles.details} style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
        <span className={styles.label} style={{ color: '#EF4444' }}>Type:</span>
        <span className={styles.value} style={{ color: '#4B5563' }}>Nginx ALB</span>
      </div>
      
      {data.ip && (
        <div className={styles.details} style={{ marginTop: '-8px' }}>
          <span className={styles.label}>Private IP:</span>
          <span className={styles.value} style={{ fontWeight: 'bold', color: '#10B981' }}>{data.ip}</span>
        </div>
      )}

      {data.port && isRunning && (
        <div className={styles.details} style={{ marginTop: '-8px' }}>
          <span className={styles.label}>Host Port:</span>
          <span className={styles.value} style={{ fontWeight: 'bold', color: '#3B82F6' }}>{data.port}</span>
        </div>
      )}

      <div className={styles.details} style={{ marginTop: '-8px' }}>
        <span className={styles.label}>Method:</span>
        <span className={styles.value} style={{ color: '#4B5563' }}>{algorithm}</span>
      </div>

      <div className={styles.details} style={{ marginTop: '-8px' }}>
        <span className={styles.label}>Targets:</span>
        <span className={styles.value} style={{ color: '#4B5563' }}>{targetsCount} Node(s)</span>
      </div>

      <div className={styles.actions}>
        {isRunning ? (
          <>
            <button
              onClick={() => data.onInspect(data.id, data.name)}
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ backgroundColor: '#EF4444' }}
              title="Configure Load Balancer rules & targets"
            >
              <Settings size={14} style={{ marginRight: 4 }} />
              Configure
            </button>
            <button
              onClick={() => data.onStop(data.id)}
              className={`${styles.btn} ${styles.btnSecondary}`}
              title="Stop Node"
            >
              <Square size={14} fill="#9CA3AF" />
            </button>
          </>
        ) : (
          <button
            onClick={() => data.onStart(data.id)}
            className={`${styles.btn} ${styles.btnSuccess}`}
            title="Start Node"
          >
            <Play size={14} style={{ marginRight: 4 }} fill="#10B981" />
            Start
          </button>
        )}

        <button
          onClick={() => data.onDelete(data.id)}
          className={`${styles.btn} ${styles.btnDanger}`}
          title="Delete Node"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <Handle type="source" position={Position.Right} id="source" className={styles.handle} />
    </div>
  );
}
