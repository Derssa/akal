import { Shield, Settings } from 'lucide-react';

export default function VpcNode({ data }: any) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: '2px dashed var(--color-accent)',
      borderRadius: '12px',
      backgroundColor: 'rgba(37, 99, 235, 0.02)',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        top: '-12px',
        left: '16px',
        backgroundColor: 'var(--color-accent)',
        color: '#FFFFFF',
        fontSize: '11px',
        fontWeight: 700,
        padding: '2px 10px',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 10,
      }}>
        <Shield size={12} />
        <span>VPC: {data.name || 'Lab-VPC'}</span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onConfigure?.(data.id, data.name || 'Lab-VPC');
        }}
        style={{
          position: 'absolute',
          top: '-12px',
          right: '16px',
          backgroundColor: 'var(--bg-surface-solid)',
          border: '1px solid var(--border-color)',
          color: 'var(--color-text-secondary)',
          fontSize: '9px',
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          zIndex: 10,
        }}
        title="Configure VPC / Network Simulator"
      >
        <Settings size={10} />
        <span>Configure</span>
      </button>
    </div>
  );
}
