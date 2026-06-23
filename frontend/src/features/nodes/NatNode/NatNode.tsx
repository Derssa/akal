import { ArrowRightLeft } from 'lucide-react';
import BaseNode from '../components/BaseNode';

interface NatNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    ip?: string;
    onInspect: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
  };
}

export default function NatNode({ data }: NatNodeProps) {
  const isRunning = data.state === 'running';

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      icon={<ArrowRightLeft size={18} color={isRunning ? '#8B5CF6' : '#6B7280'} />}
      customBorder="2px solid #8B5CF6"
      customTitleColor="#6D28D9"
      hideHandles={true}
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      primaryAction={{
        label: 'Info & Guide',
        icon: <ArrowRightLeft size={14} />,
        color: '#8B5CF6',
        onClick: data.onInspect,
        title: 'View NAT Gateway details & guide',
      }}
    />
  );
}
