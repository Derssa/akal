import { Database, Search } from 'lucide-react';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

interface RedisNodeProps {
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

export default function RedisNode({ data }: RedisNodeProps) {
  const isRunning = data.state === 'running';

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      icon={<Database size={18} color={isRunning ? '#DC2626' : '#6B7280'} />}
      customBorder={isRunning ? '1px solid #DC2626' : undefined}
      subtitle={
        <>
          <span className={styles.label}>IP/Port:</span>
          <span className={styles.value} style={{ color: data.ip ? '#10B981' : undefined }}>{data.ip ? `${data.ip}:6379` : '6379'}</span>
        </>
      }
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      onSecurityGroupOpen={data.onSecurityGroupOpen}
      primaryAction={{
        label: 'Inspect',
        icon: <Search size={14} />,
        color: '#DC2626', // Redis Red
        onClick: data.onInspect,
        title: 'Inspect Redis Keys / Shell',
      }}
    />
  );
}
