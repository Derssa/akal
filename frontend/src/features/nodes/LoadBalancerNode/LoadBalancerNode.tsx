import { GitFork, Settings } from 'lucide-react';
import BaseNode from '../components/BaseNode';

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

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      icon={<GitFork size={18} color={isRunning ? '#EF4444' : '#6B7280'} />}
      customBorder="2px solid #EF4444"
      customTitleColor="#DC2626"
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      onSecurityGroupOpen={data.onSecurityGroupOpen}
      primaryAction={{
        label: 'Configure',
        icon: <Settings size={14} />,
        color: '#EF4444',
        onClick: data.onInspect,
        title: 'Configure Load Balancer rules & targets',
      }}
    />
  );
}
