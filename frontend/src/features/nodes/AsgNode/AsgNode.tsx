import { Layers, Settings } from 'lucide-react';
import BaseNode from '../components/BaseNode';

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

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      icon={<Layers size={18} color={isRunning ? '#EC4899' : '#6B7280'} />}
      customBorder="2px dashed #EC4899"
      customTitleColor="#DB2777"
      hideHandles={true}
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      primaryAction={{
        label: 'Inspect',
        icon: <Settings size={14} />,
        color: '#EC4899',
        onClick: data.onInspect,
        title: 'Configure ASG settings & inspect instance replicas',
      }}
    />
  );
}
