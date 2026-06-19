import { Handle, Position } from '@xyflow/react';
import { Play, Square, Trash2, Terminal as TermIcon, HardDrive, Shield } from 'lucide-react';
import styles from '../ServiceNode.module.css';

interface UbuntuNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    ip?: string;
    subnetType?: 'public' | 'private';
    port?: string | number;
    onSecurityGroupOpen?: (id: string, name: string) => void;
    onTerminalOpen: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
  };
}

export default function UbuntuNode({ data }: UbuntuNodeProps) {
  const isRunning = data.state === 'running';

  return (
    <div className={styles.card}>
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div className={styles.header}>
        <div className={styles.titleContainer}>
          <HardDrive size={18} color={isRunning ? '#3B82F6' : '#6B7280'} />
          <span className={styles.title}>{data.name}</span>
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

        <div className={styles.statusRow}>
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

      <div className={styles.details}>
        <span className={styles.label}>OS:</span>
        <span className={styles.value}>Ubuntu latest</span>
      </div>
      {data.ip && (
        <div className={styles.details}>
          <span className={styles.label}>Private IP:</span>
          <span className={styles.value} style={{ fontWeight: 'bold', color: '#10B981' }}>{data.ip}</span>
        </div>
      )}
      <div className={styles.details} style={{ marginTop: '-4px' }}>
        <span className={styles.label}>Public IP:</span>
        <span className={styles.value} style={{ 
          color: data.subnetType === 'public' && data.port && isRunning ? '#3B82F6' : '#6B7280', 
          fontWeight: data.subnetType === 'public' && data.port && isRunning ? 'bold' : 'normal' 
        }}>
          {data.subnetType === 'public' && data.port && isRunning ? `localhost:${data.port}` : 'None (Private)'}
        </span>
      </div>

      <div className={styles.actions}>
        {isRunning ? (
          <>
            <button
              onClick={() => data.onTerminalOpen(data.id, data.name)}
              className={`${styles.btn} ${styles.btnPrimary}`}
              title="Open Terminal"
            >
              <TermIcon size={14} style={{ marginRight: 4 }} />
              Terminal
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

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
}
