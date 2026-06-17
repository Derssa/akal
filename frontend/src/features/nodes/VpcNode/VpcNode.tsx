import { Shield } from 'lucide-react';

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
    </div>
  );
}
