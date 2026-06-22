import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io, Socket } from 'socket.io-client';
import { X, Terminal as TermIcon, BookOpen } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import LinuxCheatSheet from './LinuxCheatSheet';
import { API_BASE } from '../../../shared/types';

interface TerminalModalProps {
  containerId: string;
  nodeName: string;
  onClose: () => void;
}

export default function TerminalModal({ containerId, nodeName, onClose }: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const [activeTab, setActiveTab] = useState<'terminal' | 'cheatsheet'>('terminal');

  useEffect(() => {
    const socket = io(API_BASE);
    socketRef.current = socket;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#0B0F19',
        foreground: '#F3F4F6',
        cursor: '#3B82F6',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
      },
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 14,
    });
    termRef.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    if (terminalRef.current) {
      term.open(terminalRef.current);
      fitAddon.fit();
    }

    socket.emit('join-terminal', { containerId });

    socket.on('terminal-output', (data: string) => {
      term.write(data);
    });

    term.onData((data) => {
      socket.emit('terminal-input', data);
    });

    const handleResize = () => {
      fitAddon.fit();
      socket.emit('terminal-resize', {
        cols: term.cols,
        rows: term.rows,
      });
    };

    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.disconnect();
      term.dispose();
    };
  }, [containerId]);

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.tabs}>
            <button
              style={{
                ...styles.tabBtn,
                ...(activeTab === 'terminal' ? styles.activeTabBtn : {}),
              }}
              onClick={() => setActiveTab('terminal')}
            >
              <TermIcon size={16} style={{ marginRight: 6 }} />
              Terminal: {nodeName}
            </button>
            <button
              style={{
                ...styles.tabBtn,
                ...(activeTab === 'cheatsheet' ? styles.activeTabBtn : {}),
              }}
              onClick={() => setActiveTab('cheatsheet')}
            >
              <BookOpen size={16} style={{ marginRight: 6 }} />
              Linux Cheat Sheet
            </button>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        <div
          ref={terminalRef}
          style={{
            ...styles.terminalContainer,
            display: activeTab === 'terminal' ? 'block' : 'none',
          }}
        />

        {activeTab === 'cheatsheet' && (
          <div style={styles.contentContainer}>
            <LinuxCheatSheet />
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
  },
  container: {
    width: '900px',
    maxWidth: '100%',
    height: '600px',
    maxHeight: '100%',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px 0 16px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    borderTopLeftRadius: '6px',
    borderTopRightRadius: '6px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  activeTabBtn: {
    color: '#3B82F6',
    backgroundColor: 'var(--bg-main)',
    fontWeight: 600,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
    position: 'relative',
    overflow: 'hidden',
    padding: '8px',
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
};
