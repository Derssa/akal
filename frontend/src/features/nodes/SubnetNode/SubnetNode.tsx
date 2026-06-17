import { Eye, EyeOff, Route } from 'lucide-react';

export default function SubnetNode({ data }: any) {
  const isPublic = data.type === 'public';

  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: `2px dotted ${isPublic ? '#10B981' : '#F59E0B'}`,
      borderRadius: '8px',
      backgroundColor: isPublic ? 'rgba(16, 185, 129, 0.015)' : 'rgba(245, 158, 11, 0.015)',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        top: '-12px',
        left: '12px',
        backgroundColor: isPublic ? '#10B981' : '#F59E0B',
        color: '#FFFFFF',
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 10,
      }}>
        {isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
        <span>{data.name || (isPublic ? 'Public Subnet' : 'Private Subnet')}</span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onManageRoutes?.(data.id, data.name || (isPublic ? 'Public Subnet' : 'Private Subnet'));
        }}
        style={{
          position: 'absolute',
          top: '-12px',
          right: '12px',
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
        title="Manage Subnet Routing Table"
      >
        <Route size={10} />
        <span>Routes</span>
      </button>
    </div>
  );
}
