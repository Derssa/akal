import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X, Terminal as TermIcon } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface TerminalModalProps {
  containerId: string;
  nodeName: string;
  onClose: () => void;
}

export default function TerminalModal({ containerId, nodeName, onClose }: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
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

    const hostPromptName = nodeName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    term.writeln(`Welcome to Ubuntu Server simulator for node [${nodeName}]`);
    term.writeln('Type "help" for a list of available mock commands.');
    term.writeln('');
    term.write(`root@${hostPromptName}:/# `);

    let currentLine = '';

    term.onData((data) => {
      const code = data.charCodeAt(0);
      
      // Enter
      if (code === 13) {
        term.write('\r\n');
        const trimmedCmd = currentLine.trim().toLowerCase();
        
        if (trimmedCmd === 'help') {
          term.writeln('Available mock commands:');
          term.writeln('  help             Show this guide');
          term.writeln('  ls               List directory files');
          term.writeln('  uname -a         Display system information');
          term.writeln('  cat /etc/issue   Show operating system info');
          term.writeln('  clear            Clear screen');
        } else if (trimmedCmd === 'ls') {
          term.writeln('bin   dev  home  lib64  mnt  proc  run   srv  tmp  var');
          term.writeln('boot  etc  lib   media  opt  root  sbin  sys  usr');
        } else if (trimmedCmd === 'uname -a') {
          term.writeln('Linux ubuntu-node 5.15.0-88-generic #98-Ubuntu SMP Mon Oct 2 15:18:56 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux');
        } else if (trimmedCmd === 'cat /etc/issue' || trimmedCmd === 'cat /etc/os-release') {
          term.writeln('Ubuntu 22.04.3 LTS \\n \\l');
        } else if (trimmedCmd === 'clear') {
          term.clear();
        } else if (trimmedCmd !== '') {
          term.writeln(`bash: ${trimmedCmd}: command not found`);
        }
        
        currentLine = '';
        term.write(`root@${hostPromptName}:/# `);
      } 
      // Backspace
      else if (code === 127) {
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write('\b \b');
        }
      } 
      // Typeable ascii keys
      else if (data >= ' ' && data <= '~') {
        currentLine += data;
        term.write(data);
      }
    });

    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [containerId, nodeName]);

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.title}>
            <TermIcon size={18} color="#3B82F6" style={{ marginRight: 8 }} />
            <span>Terminal: {nodeName}</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>
        <div ref={terminalRef} style={styles.terminalContainer} />
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
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    fontWeight: 600,
    fontSize: '14px',
    color: '#F3F4F6',
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
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
    position: 'relative',
    overflow: 'hidden',
  },
};
