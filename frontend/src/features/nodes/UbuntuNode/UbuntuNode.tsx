import { Handle, Position } from '@xyflow/react';
import { Play, Square, Trash2, Terminal as TermIcon, HardDrive, Shield } from 'lucide-react';
import type { UbuntuNodeData } from './types';
import styles from './UbuntuNode.module.css';

interface UbuntuNodeProps {
  data: any; // Use any to support onSecurityGroupOpen prop dynamically
}

export default function UbuntuNode({ data }: UbuntuNodeProps) {
  const isRunning = data.state === 'running';

  return (
    <div className={styles.card}>
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div className={styles.header}>
        <div className={styles.titleContainer}>
          <HardDrive size={18} color={isRunning ? '#10B981' : '#6B7280'} />
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
