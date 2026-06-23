import { Terminal as TermIcon, Cpu } from 'lucide-react';
import BaseNode from '../components/BaseNode';
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
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      icon={<Cpu size={18} color={isRunning ? '#3B82F6' : '#6B7280'} />}
      customTitleColor="var(--color-text-primary)"
      subtitle={
        <>
          <span className={styles.label}>IP Address:</span>
          <span className={styles.value} style={{ color: data.ip ? '#10B981' : undefined }}>{data.ip || 'Private'}</span>
        </>
      }
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      onSecurityGroupOpen={data.onSecurityGroupOpen}
      primaryAction={{
        label: 'Terminal',
        icon: <TermIcon size={14} />,
        onClick: data.onTerminalOpen,
        title: 'Open Terminal',
      }}
    />
  );
}
