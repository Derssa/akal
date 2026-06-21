import { Handle, Position } from '@xyflow/react';
import { Play, Square, Trash2, Braces, Search, Shield } from 'lucide-react';
import styles from '../ServiceNode.module.css'; // Reuse core card styles for visual parity!

interface NoSqlNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    ip?: string;
    onSecurityGroupOpen?: (id: string, name: string) => void;
    onInspect: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
  };
}

export default function NoSqlNode({ data }: NoSqlNodeProps) {
  const isRunning = data.state === 'running';

  return (
    <div className={styles.card} style={{ borderColor: isRunning ? '#475569' : undefined }}>
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div className={styles.header}>
        <div className={styles.titleContainer}>
          <Braces size={18} color={isRunning ? '#475569' : '#6B7280'} />
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            className={styles.indicator}
            style={{
              backgroundColor: isRunning ? '#475569' : '#EF4444',
              boxShadow: isRunning
                ? '0 0 8px rgba(71, 85, 105, 0.6)'
                : '0 0 8px rgba(239, 68, 68, 0.6)'
            }}
          />
          <span className={styles.statusText}>{isRunning ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <div className={styles.details}>
        <span className={styles.label}>Port:</span>
        <span className={styles.value}>27017</span>
      </div>
      {data.ip && (
        <div className={styles.details}>
          <span className={styles.label}>IP:</span>
          <span className={styles.value} style={{ fontWeight: 'bold', color: '#475569' }}>{data.ip}</span>
        </div>
      )}

      <div className={styles.actions}>
        {isRunning ? (
          <>
            <button
              onClick={() => data.onInspect(data.id, data.name)}
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ backgroundColor: '#475569' }} // Charcoal Gray
              title="Inspect Database Explorer / Shell"
            >
              <Search size={14} style={{ marginRight: 4 }} />
              Inspect
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
            <Play size={14} style={{ marginRight: 4 }} fill="#475569" />
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
