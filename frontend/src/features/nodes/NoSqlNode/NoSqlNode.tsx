import { Braces, Search } from 'lucide-react';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

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
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      icon={<Braces size={18} color={isRunning ? '#475569' : '#6B7280'} />}
      customBorder={isRunning ? '1px solid #475569' : undefined}
      subtitle={
        <>
          <span className={styles.label}>IP/Port:</span>
          <span className={styles.value} style={{ color: data.ip ? '#10B981' : undefined }}>{data.ip ? `${data.ip}:27017` : '27017'}</span>
        </>
      }
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      onSecurityGroupOpen={data.onSecurityGroupOpen}
      primaryAction={{
        label: 'Inspect',
        icon: <Search size={14} />,
        color: '#475569', // Charcoal Gray
        onClick: data.onInspect,
        title: 'Inspect Database Explorer / Shell',
      }}
    />
  );
}
