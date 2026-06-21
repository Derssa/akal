import { Play, Square, Trash2, Layers, Settings } from 'lucide-react';
import styles from '../ServiceNode.module.css';

interface AsgNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    ip?: string;
    config?: {
      asgs?: Record<string, { desiredCapacity: number; minCapacity?: number; maxCapacity?: number; parentId?: string; subnetIds?: string[] }>;
    };
    // Active ASG metadata mapped from CanvasPage
    asgConfig?: {
      desiredCapacity: number;
      minCapacity?: number;
      maxCapacity?: number;
      parentId?: string;
      subnetIds?: string[];
      parentName?: string;
    };
    instanceCount?: number;
    onSecurityGroupOpen?: (id: string, name: string) => void;
    onInspect: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
  };
}

export default function AsgNode({ data }: AsgNodeProps) {
  const isRunning = data.state === 'running';
  const asg = data.asgConfig || { desiredCapacity: 1, minCapacity: 1, maxCapacity: 4 };
  const instanceCount = data.instanceCount || 0;
  const parentName = asg.parentName || 'Not Linked';

  return (
    <div 
      className={styles.card} 
      style={{
        border: '2px dashed #EC4899',
        boxShadow: isRunning ? '0 10px 15px -3px rgba(236, 72, 153, 0.15)' : undefined
      }}
    >
      <div className={styles.header}>
        <div className={styles.titleContainer}>
          <Layers size={18} color={isRunning ? '#EC4899' : '#6B7280'} />
          <span className={styles.title} style={{ color: '#DB2777' }}>{data.name}</span>
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
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{isRunning ? 'Active' : 'Disabled'}</span>
        </div>
      </div>

      <div className={styles.details} style={{ backgroundColor: 'rgba(236, 72, 153, 0.05)' }}>
        <span className={styles.label} style={{ color: '#EC4899' }}>Type:</span>
        <span className={styles.value} style={{ color: '#4B5563' }}>Auto Scaling Group</span>
      </div>

      <div className={styles.details} style={{ marginTop: '-8px' }}>
        <span className={styles.label}>Template:</span>
        <span className={styles.value} style={{ fontWeight: '600', color: parentName !== 'Not Linked' ? '#3B82F6' : '#EF4444' }}>
          {parentName}
        </span>
      </div>

      <div className={styles.details} style={{ marginTop: '-8px' }}>
        <span className={styles.label}>Capacity:</span>
        <span className={styles.value} style={{ color: '#4B5563' }}>
          Min {asg.minCapacity || 1} / Max {asg.maxCapacity || 4}
        </span>
      </div>

      <div className={styles.details} style={{ marginTop: '-8px' }}>
        <span className={styles.label}>Instances:</span>
        <span className={styles.value} style={{ fontWeight: 'bold', color: '#10B981' }}>
          {instanceCount} Running (Desired: {asg.desiredCapacity})
        </span>
      </div>

      <div className={styles.actions}>
        {isRunning ? (
          <>
            <button
              onClick={() => data.onInspect(data.id, data.name)}
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ backgroundColor: '#EC4899' }}
              title="Configure ASG settings & inspect instance replicas"
            >
              <Settings size={14} style={{ marginRight: 4 }} />
              Inspect
            </button>
            <button
              onClick={() => data.onStop(data.id)}
              className={`${styles.btn} ${styles.btnSecondary}`}
              title="Stop ASG Controller"
            >
              <Square size={14} fill="#9CA3AF" />
            </button>
          </>
        ) : (
          <button
            onClick={() => data.onStart(data.id)}
            className={`${styles.btn} ${styles.btnSuccess}`}
            title="Start ASG Controller"
          >
            <Play size={14} style={{ marginRight: 4 }} fill="#10B981" />
            Enable
          </button>
        )}

        <button
          onClick={() => data.onDelete(data.id)}
          className={`${styles.btn} ${styles.btnDanger}`}
          title="Delete ASG"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
