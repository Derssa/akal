import { Play, Square, Trash2, Globe } from 'lucide-react';
import styles from '../ServiceNode.module.css';

interface NatNodeProps {
  data: any;
}

export default function NatNode({ data }: NatNodeProps) {
  const isRunning = data.state === 'running';

  return (
    <div 
      className={styles.card} 
      style={{
        border: '2px solid #8B5CF6',
        boxShadow: isRunning ? '0 10px 15px -3px rgba(139, 92, 246, 0.15)' : undefined
      }}
    >
      <div className={styles.header}>
        <div className={styles.titleContainer}>
          <Globe size={18} color={isRunning ? '#8B5CF6' : '#6B7280'} />
          <span className={styles.title} style={{ color: '#6D28D9' }}>{data.name}</span>
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

      <div className={styles.details} style={{ backgroundColor: 'rgba(139, 92, 246, 0.05)' }}>
        <span className={styles.label} style={{ color: '#8B5CF6' }}>Role:</span>
        <span className={styles.value} style={{ color: '#4B5563' }}>NAT Gateway</span>
      </div>
      
      {data.ip && (
        <div className={styles.details} style={{ marginTop: '-8px' }}>
          <span className={styles.label}>IP:</span>
          <span className={styles.value} style={{ fontWeight: 'bold', color: '#10B981' }}>{data.ip}</span>
        </div>
      )}

      <div className={styles.actions}>
        {isRunning ? (
          <>
            <button
              onClick={() => data.onInspect(data.id, data.name)}
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ backgroundColor: '#8B5CF6' }}
              title="View NAT Gateway details & guide"
            >
              <Globe size={14} style={{ marginRight: 4 }} />
              Info & Guide
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
    </div>
  );
}
