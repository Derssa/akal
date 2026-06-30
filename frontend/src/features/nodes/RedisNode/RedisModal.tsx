import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Database, Key, Play, Copy, Check, Search, BookOpen, Terminal, RefreshCw, AlertCircle, Eye, Loader2, Server } from 'lucide-react';
import { API_BASE } from '../../../shared/types';
import redisCheatSheet from './data/redisCheatSheet.json';

interface RedisModalProps {
  containerId: string;
  nodeName: string;
  projectId: string;
  onClose: () => void;
}

interface RedisKey {
  key: string;
  type: string;
}

const CHEAT_SHEET_DATA = redisCheatSheet;
const REDIS_IMAGE = 'redis:7-alpine';

/** Maps a Redis value type to the read command that displays its content. */
function readCommandForType(type: string, key: string): string {
  switch (type) {
    case 'list':
      return `LRANGE ${key} 0 -1`;
    case 'hash':
      return `HGETALL ${key}`;
    case 'set':
      return `SMEMBERS ${key}`;
    case 'zset':
      return `ZRANGE ${key} 0 -1 WITHSCORES`;
    case 'stream':
      return `XRANGE ${key} - +`;
    default:
      return `GET ${key}`;
  }
}

export default function RedisModal({ containerId, nodeName, projectId, onClose }: RedisModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'details' | 'explorer' | 'shell' | 'cheatsheet'>('details');
  const [explorerData, setExplorerData] = useState<RedisKey[]>([]);
  const [loadingExplorer, setLoadingExplorer] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  // Shell states
  const [command, setCommand] = useState('KEYS *');
  const [queryOutput, setQueryOutput] = useState('');
  const [executing, setExecuting] = useState(false);

  // Cheat Sheet Search
  const [cheatQuery, setCheatQuery] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fetchExplorerDataRef = useRef<() => Promise<void>>(undefined);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchExplorerData = useCallback(async () => {
    try {
      setLoadingExplorer(true);
      setExplorerError(null);
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/redis/explorer`);
      if (res.ok) {
        const data = await res.json();
        setExplorerData(data);
      } else {
        const errData = await res.json();
        if (errData.error && errData.error.includes('starting up')) {
          setExplorerError('starting_up');
          // Auto retry in 2.5 seconds. Clear any pending timer first so overlapping
          // triggers (auto-retry + manual Retry) never stack into multiple loops.
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            fetchExplorerDataRef.current?.();
          }, 2500);
        } else {
          setExplorerError(errData.error || 'Failed to inspect keys');
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect to container';
      setExplorerError(errMsg);
    } finally {
      setLoadingExplorer(false);
    }
  }, [projectId, containerId]);

  useEffect(() => {
    fetchExplorerDataRef.current = fetchExplorerData;
  }, [fetchExplorerData]);
  useEffect(() => {
    fetchExplorerData();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [fetchExplorerData]);

  const runCommand = async (commandToRun: string) => {
    if (!commandToRun.trim()) {
      setQueryOutput('No command to run.');
      return;
    }
    try {
      setExecuting(true);
      setQueryOutput('Executing command in container...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/redis/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: commandToRun })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(data.result || 'Command executed successfully with no output.');
        fetchExplorerData();
      } else {
        setQueryOutput(`ERROR: ${data.error}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setQueryOutput(`Execution failed: ${errMsg}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleExecuteCommand = () => runCommand(command);

  const handleViewValue = (entry: RedisKey) => {
    const readCommand = readCommandForType(entry.type, entry.key);
    setCommand(readCommand);
    setActiveTab('shell');
    runCommand(readCommand);
  };

  const handleCopyCheat = (code: string, idx: number) => {
    // navigator.clipboard is undefined on non-secure origins (e.g. http://<LAN-ip>);
    // guard + catch so a copy failure never throws and we only flash the check on success.
    navigator.clipboard?.writeText(code)
      .then(() => {
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
      })
      .catch(() => { /* clipboard unavailable; nothing copied */ });
  };

  const filteredCheatSheet = CHEAT_SHEET_DATA.filter(item => {
    const query = cheatQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );
  });

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        {/* Header Tabs */}
        <div style={styles.header}>
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'details' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('details')}
            >
              <Server size={15} style={{ marginRight: 6 }} />
              {t('redis.tabs.details')}
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'explorer' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('explorer')}
            >
              <Database size={15} style={{ marginRight: 6 }} />
              {t('redis.tabs.explorer')}
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'shell' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('shell')}
            >
              <Terminal size={15} style={{ marginRight: 6 }} />
              {t('redis.tabs.shell')}
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'cheatsheet' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('cheatsheet')}
            >
              <BookOpen size={15} style={{ marginRight: 6 }} />
              {t('redis.tabs.cheatsheet')}
            </button>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={styles.body}>
          {/* TAB: Details */}
          {activeTab === 'details' && (
            <div style={styles.tabContent}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#1E293B' }}>{t('redis.details.title')}</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748B' }}>
                {t('redis.details.desc')}
              </p>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('redis.details.imageLabel')}</span>
                  <span style={styles.detailValue}>{REDIS_IMAGE}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('redis.details.portLabel')}</span>
                  <span style={styles.detailValue}>6379</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Node</span>
                  <span style={styles.detailValue}>{nodeName}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Key Explorer */}
          {activeTab === 'explorer' && (
            <div style={styles.tabContent}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>{t('redis.explorer.title')}{nodeName}</span>
                <button onClick={fetchExplorerData} disabled={loadingExplorer} style={styles.iconActionBtn}>
                  <RefreshCw size={14} className={loadingExplorer ? 'spin' : ''} />
                </button>
              </div>

              <div style={styles.explorerTree}>
                {explorerError ? (
                  explorerError === 'starting_up' ? (
                    <div style={styles.errorContainer}>
                      <Loader2 size={24} className="spin" color="#3B82F6" style={{ marginBottom: 12 }} />
                      <span style={styles.errorMessage}>{t('redis.explorer.initializing')}</span>
                    </div>
                  ) : (
                    <div style={styles.errorContainer}>
                      <AlertCircle size={24} color="#EF4444" style={{ marginBottom: 12 }} />
                      <span style={styles.errorMessage}>{explorerError}</span>
                      <button onClick={fetchExplorerData} style={styles.retryBtn}>
                        <RefreshCw size={12} style={{ marginRight: 6 }} />
                        {t('redis.explorer.retryBtn')}
                      </button>
                    </div>
                  )
                ) : explorerData.length > 0 ? (
                  explorerData.map(entry => (
                    <div key={entry.key} style={styles.treeNode}>
                      <div style={styles.treeRow}>
                        <Key size={14} color="#DC2626" style={{ marginRight: 8 }} />
                        <span style={styles.keyName}>{entry.key}</span>
                        <span style={styles.keyType}>{entry.type}</span>

                        <button
                          onClick={() => handleViewValue(entry)}
                          style={styles.inlineViewBtn}
                          title="View value in Redis shell"
                          className="glass"
                        >
                          <Eye size={12} style={{ marginRight: 4 }} />
                          {t('redis.explorer.viewDataBtn')}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={styles.treeRowEmpty}>{t('redis.explorer.noKeys')}</div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Redis Shell */}
          {activeTab === 'shell' && (
            <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column' }}>
              <div style={styles.shellHeader}>
                <span style={styles.label}>redis-cli</span>
                <button
                  onClick={handleExecuteCommand}
                  disabled={executing || !command.trim()}
                  style={styles.runBtn}
                >
                  <Play size={14} style={{ marginRight: 6 }} fill="#FFF" />
                  {executing ? t('redis.shell.executingBtn') : t('redis.shell.executeBtn')}
                </button>
              </div>

              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={t('redis.shell.placeholder')}
                style={styles.sqlTextarea}
              />

              <div style={styles.terminalHeader}>{t('redis.shell.consoleTitle')}</div>
              <pre style={styles.terminalOutput}>
                <code>{queryOutput || t('redis.shell.emptyOutput')}</code>
              </pre>
            </div>
          )}

          {/* TAB: Cheat Sheet */}
          {activeTab === 'cheatsheet' && (
            <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column' }}>
              <div style={styles.searchBar}>
                <div style={styles.searchWrapper}>
                  <Search size={15} color="var(--color-text-muted)" style={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder={t('redis.cheatsheet.placeholder')}
                    value={cheatQuery}
                    onChange={(e) => setCheatQuery(e.target.value)}
                    style={styles.searchInput}
                  />
                </div>
              </div>

              <div style={styles.cheatSheetList}>
                {filteredCheatSheet.map((item, idx) => (
                  <div key={item.name} style={styles.cheatCard}>
                    <div style={styles.cheatHeader}>
                      <span style={styles.cheatName}>{item.name}</span>
                      <span style={styles.cheatCategory}>{item.category}</span>
                    </div>
                    <p style={styles.cheatDesc}>{item.description}</p>
                    <div style={styles.codeContainer}>
                      <pre style={styles.code}>
                        <code>{item.example}</code>
                      </pre>
                      <button
                        onClick={() => handleCopyCheat(item.example, idx)}
                        style={styles.copyBtn}
                      >
                        {copiedIndex === idx ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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
    padding: '12px 20px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-solid)',
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
  },
  tabBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  activeTabBtn: {
    backgroundColor: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s, color 0.2s',
  },
  body: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  tabContent: {
    height: '100%',
    overflowY: 'auto',
    padding: '20px',
    boxSizing: 'border-box',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
  },
  detailLabel: {
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
  },
  detailValue: {
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  iconActionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  explorerTree: {
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '12px',
    backgroundColor: 'var(--bg-main)',
    minHeight: '240px',
  },
  treeNode: {
    marginBottom: '6px',
  },
  treeRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    borderRadius: '6px',
    transition: 'background-color 0.2s',
    userSelect: 'none',
  },
  treeRowEmpty: {
    padding: '6px 8px',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  keyName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
  },
  keyType: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    marginLeft: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  shellHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexShrink: 0,
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-mono)',
  },
  runBtn: {
    backgroundColor: '#10B981',
    color: '#FFF',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 1px 3px rgba(16, 185, 129, 0.3)',
  },
  sqlTextarea: {
    width: '100%',
    height: '140px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    resize: 'none',
    boxSizing: 'border-box',
    outline: 'none',
    marginBottom: '16px',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--color-text-primary)',
  },
  terminalHeader: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },
  terminalOutput: {
    flex: 1,
    margin: 0,
    padding: '12px',
    backgroundColor: '#0F172A',
    color: '#E2E8F0',
    borderRadius: '8px',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    overflow: 'auto',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  searchBar: {
    marginBottom: '16px',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
  },
  cheatSheetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cheatCard: {
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cheatHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  cheatName: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-accent)',
  },
  cheatCategory: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  cheatDesc: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    margin: '0 0 12px 0',
  },
  codeContainer: {
    position: 'relative',
  },
  code: {
    margin: 0,
    padding: '10px 14px',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    borderRadius: '6px',
    overflowX: 'auto',
    border: '1px solid var(--border-color)',
  },
  copyBtn: {
    position: 'absolute',
    right: '8px',
    top: '8px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
    padding: '4px',
    borderRadius: '4px',
  },
  inlineViewBtn: {
    marginLeft: 'auto',
    backgroundColor: 'var(--color-accent-glow)',
    border: '1px solid rgba(37, 99, 235, 0.2)',
    borderRadius: '4px',
    color: 'var(--color-accent)',
    fontSize: '11px',
    padding: '2px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '30px 20px',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    marginBottom: '16px',
    maxWidth: '400px',
  },
  retryBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  }
};
