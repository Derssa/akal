import { Eye, EyeOff, Route, Trash } from 'lucide-react';

interface SubnetNodeProps {
  id: string;
  data: {
    type?: 'public' | 'private';
    hoverStatus?: 'valid' | 'invalid' | null;
    columns?: number;
    rows?: number;
    name?: string;
    cidr?: string;
    onResize?: (id: string, dimension: 'columns' | 'rows', size: number) => void;
    onManageRoutes?: (id: string, name: string) => void;
    onDelete?: (id: string) => void;
  };
}

export default function SubnetNode({ id, data }: SubnetNodeProps) {
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
  const rows = data.rows || 1;

  const placeholders = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      placeholders.push(
        <div
          key={`placeholder-${r}-${c}`}
          style={{
            position: 'absolute',
            left: 60 + c * 340,
            top: 60 + r * 190,
            width: 220,
            height: 140,
            border: '2.5px dashed rgba(0, 0, 0, 0.055)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isPublic ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)',
            fontSize: '24px',
            fontWeight: 300,
            pointerEvents: 'none',
            backgroundColor: 'rgba(0, 0, 0, 0.005)'
          }}
        >
          +
        </div>
      );
    }
  }



  const btnStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    color: '#FFFFFF',
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 'bold' as const,
    padding: 0,
  };

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
      {placeholders}
      <div style={{
        position: 'absolute',
        top: '-16px',
        left: '12px',
        backgroundColor: isPublic ? '#10B981' : '#F59E0B',
        color: '#FFFFFF',
        fontSize: '12px',
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 10,
      }}>
        {isPublic ? <Eye size={12} /> : <EyeOff size={12} />}
        <span>{data.name || (isPublic ? 'Public Subnet' : 'Private Subnet')}</span>

        {/* Grid Controls (Rows & Cols) */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            borderLeft: '1px solid rgba(255,255,255,0.3)',
            paddingLeft: '6px',
            marginLeft: '4px',
            pointerEvents: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span style={{ fontSize: '11px', opacity: 0.9 }}>Grid:</span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              onClick={() => {
                if (cols > 2) data.onResize?.(id, 'columns', cols - 1);
              }}
              style={btnStyle}
              title="Reduce Columns"
            >
              -
            </button>
            <input
              type="number"
              min={2}
              value={cols}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) data.onResize?.(id, 'columns', val);
              }}
              style={{
                width: '28px',
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#ffffff',
                fontSize: '11px',
                padding: '0 2px',
                textAlign: 'center',
                borderRadius: '2px',
                fontWeight: 'bold',
                height: '16px',
              }}
            />
            <button
              onClick={() => data.onResize?.(id, 'columns', cols + 1)}
              style={btnStyle}
              title="Increase Columns"
            >
              +
            </button>
            <span style={{ fontWeight: 'bold', fontSize: '11px', marginLeft: '2px' }}>C</span>
          </div>

          <span style={{ fontSize: '11px', opacity: 0.9 }}>x</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              onClick={() => data.onResize?.(id, 'rows', rows - 1)}
              style={btnStyle}
              title="Reduce Rows"
            >
              -
            </button>
            <input
              type="number"
              min={1}
              value={rows}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) data.onResize?.(id, 'rows', val);
              }}
              style={{
                width: '28px',
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#ffffff',
                fontSize: '11px',
                padding: '0 2px',
                textAlign: 'center',
                borderRadius: '2px',
                fontWeight: 'bold',
                height: '16px',
              }}
            />
            <button
              onClick={() => data.onResize?.(id, 'rows', rows + 1)}
              style={btnStyle}
              title="Increase Rows"
            >
              +
            </button>
            <span style={{ fontWeight: 'bold', fontSize: '11px', marginLeft: '2px' }}>R</span>
          </div>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onManageRoutes?.(id, data.name || (isPublic ? 'Public Subnet' : 'Private Subnet'));
        }}
        style={{
          position: 'absolute',
          top: '-16px',
          right: '38px',
          backgroundColor: 'var(--bg-surface-solid)',
          border: '1px solid var(--border-color)',
          color: 'var(--color-text-secondary)',
          fontSize: '11px',
          fontWeight: 600,
          padding: '3px 8px',
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
        <Route size={12} />
        <span>Routes</span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onDelete?.(id);
        }}
        style={{
          position: 'absolute',
          top: '-16px',
          right: '12px',
          backgroundColor: '#EF4444',
          border: 'none',
          color: '#FFFFFF',
          padding: '4px 6px',
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
        <Trash size={12} />
      </button>

      {data.cidr && (
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          color: '#374151',
          fontSize: '11px',
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: '4px',
          pointerEvents: 'none',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}>
          {data.cidr}
        </div>
      )}
    </div>
  );
}
