import { Eye, EyeOff, Route, Trash } from 'lucide-react';
import { NodeResizer } from '@xyflow/react';

export default function SubnetNode({ id, data, selected }: any) {
  const isPublic = data.type === 'public';
  const isHovered = data.hoverStatus === 'valid' || data.hoverStatus === 'invalid';
  
  const defaultColor = isPublic ? '#10B981' : '#F59E0B';
  const borderColor = isHovered 
    ? (data.hoverStatus === 'valid' ? '#10B981' : '#EF4444') 
    : defaultColor;
    
  const boxShadow = isHovered 
    ? (data.hoverStatus === 'valid' ? '0 0 15px rgba(16, 185, 129, 0.4)' : '0 0 15px rgba(239, 68, 68, 0.4)') 
    : 'none';

  const cols = data.columns || 2;
  const rows = Math.max(1, Math.round(((data.height || 240) - 50) / 190));

  const placeholders = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      placeholders.push(
        <div
          key={`placeholder-${r}-${c}`}
          style={{
            position: 'absolute',
            left: 40 + c * 280,
            top: 60 + r * 190,
            width: 220,
            height: 140,
            border: '2.5px dashed rgba(0, 0, 0, 0.045)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(0, 0, 0, 0.12)',
            fontSize: '11px',
            fontWeight: 700,
            pointerEvents: 'none',
            backgroundColor: 'rgba(0, 0, 0, 0.005)'
          }}
        >
          Slot {r * cols + c + 1}
        </div>
      );
    }
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: `2px dotted ${borderColor}`,
      borderRadius: '8px',
      backgroundColor: isHovered 
        ? (data.hoverStatus === 'valid' ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)') 
        : (isPublic ? 'rgba(16, 185, 129, 0.015)' : 'rgba(245, 158, 11, 0.015)'),
      boxShadow,
      position: 'relative',
      transition: 'all 0.2s ease',
    }}>
      <NodeResizer
        color={borderColor}
        minWidth={300}
        minHeight={240}
        grid={[280, 190]}
        isVisible={true}
        onResizeStop={(evt, params) => data.onResize?.(evt, { id, ...params })}
      />
      {placeholders}
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
          right: '34px',
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

      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onDelete?.(data.id);
        }}
        style={{
          position: 'absolute',
          top: '-12px',
          right: '12px',
          backgroundColor: '#EF4444',
          border: 'none',
          color: '#FFFFFF',
          padding: '3px 4px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          zIndex: 10,
        }}
        title="Delete Subnet"
      >
        <Trash size={9} />
      </button>
    </div>
  );
}
