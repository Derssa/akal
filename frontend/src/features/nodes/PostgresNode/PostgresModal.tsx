import { useState, useEffect } from 'react';
import { X, Database, Table, Columns, Play, Copy, Check, Search, BookOpen, Terminal, RefreshCw, AlertCircle, Eye } from 'lucide-react';
import { API_BASE } from '../../../shared/types';
import postgresCheatSheet from './data/postgresCheatSheet.json';

interface PostgresModalProps {
  containerId: string;
  nodeName: string;
  projectId: string;
  onClose: () => void;
}

interface DBColumn {
  name: string;
  type: string;
}

interface DBTable {
  name: string;
  columns: DBColumn[];
}

interface DBNode {
  database: string;
  tables: DBTable[];
  error?: boolean;
}

const CHEAT_SHEET_DATA = postgresCheatSheet;

export default function PostgresModal({ containerId, nodeName, projectId, onClose }: PostgresModalProps) {
  const [activeTab, setActiveTab] = useState<'explorer' | 'shell' | 'cheatsheet'>('explorer');
  const [explorerData, setExplorerData] = useState<DBNode[]>([]);
  const [loadingExplorer, setLoadingExplorer] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  
  // Shell states
  const [selectedDb, setSelectedDb] = useState('postgres');
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM pg_tables WHERE schemaname = \'public\';');
  const [queryOutput, setQueryOutput] = useState('');
  const [executing, setExecuting] = useState(false);

  // Cheat Sheet Search
  const [cheatQuery, setCheatQuery] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Database structure expand/collapse maps
  const [expandedDBs, setExpandedDBs] = useState<Record<string, boolean>>({ postgres: true });
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const fetchExplorerData = async () => {
    try {
      setLoadingExplorer(true);
      setExplorerError(null);
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/postgres/explorer`);
      if (res.ok) {
        const data = await res.json();
        setExplorerData(data);
      } else {
        const errData = await res.json();
        setExplorerError(errData.error || 'Failed to inspect schema');
      }
    } catch (err: any) {
      setExplorerError(err.message || 'Failed to connect to container');
    } finally {
      setLoadingExplorer(false);
    }
  };

  useEffect(() => {
    fetchExplorerData();
  }, [containerId]);

  const handleExecuteQuery = async () => {
    let targetDb = selectedDb;
    let queryToRun = sqlQuery;
    let localConsoleOutput = '';

    // Check for \c or \connect database meta-command
    const connectRegex = /^\s*\\(?:c|connect)\s+([a-zA-Z0-9_"\-]+)/m;
    const match = sqlQuery.match(connectRegex);
    if (match) {
      const dbName = match[1].replace(/"/g, ''); // strip optional quotes
      targetDb = dbName;
      setSelectedDb(dbName);
      // Remove the switch command from the query text that gets sent to the server
      queryToRun = sqlQuery.replace(connectRegex, '').trim();
      localConsoleOutput = `Switched database connection context to "${dbName}".\n`;
    }

    if (!queryToRun) {
      setQueryOutput(`${localConsoleOutput}No SQL statements left to run.`);
      // Refresh explorer in case database was just created or switched
      fetchExplorerData();
      return;
    }

    try {
      setExecuting(true);
      setQueryOutput(localConsoleOutput + 'Executing query in container...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/postgres/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryToRun, database: targetDb })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(localConsoleOutput + (data.result || 'Query executed successfully with no output.'));
        // Refresh explorer in background to capture structural changes
        fetchExplorerData();
      } else {
        setQueryOutput(localConsoleOutput + `ERROR: ${data.error}`);
      }
    } catch (err: any) {
      setQueryOutput(localConsoleOutput + `Execution failed: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleViewTableData = async (database: string, tableName: string) => {
    setSelectedDb(database);
    const query = `SELECT * FROM ${tableName} LIMIT 100;`;
    setSqlQuery(query);
    setActiveTab('shell');

    try {
      setExecuting(true);
      setQueryOutput('Executing query in container...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/postgres/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, database })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(data.result || 'Query executed successfully with no output.');
      } else {
        setQueryOutput(`ERROR: ${data.error}`);
      }
    } catch (err: any) {
      setQueryOutput(`Execution failed: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleCopyCheat = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleDBExpand = (db: string) => {
    setExpandedDBs(prev => ({ ...prev, [db]: !prev[db] }));
  };

  const toggleTableExpand = (tblKey: string) => {
    setExpandedTables(prev => ({ ...prev, [tblKey]: !prev[tblKey] }));
  };

  // Filtered Cheatsheet
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
              style={{ ...styles.tabBtn, ...(activeTab === 'explorer' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('explorer')}
            >
              <Database size={15} style={{ marginRight: 6 }} />
              Database Explorer
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'shell' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('shell')}
            >
              <Terminal size={15} style={{ marginRight: 6 }} />
              SQL Shell
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'cheatsheet' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('cheatsheet')}
            >
              <BookOpen size={15} style={{ marginRight: 6 }} />
              SQL Cheat Sheet
            </button>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={styles.body}>
          {/* TAB 1: Database Explorer */}
          {activeTab === 'explorer' && (
            <div style={styles.tabContent}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>Inspect tables and schema: {nodeName}</span>
                <button onClick={fetchExplorerData} disabled={loadingExplorer} style={styles.iconActionBtn}>
                  <RefreshCw size={14} className={loadingExplorer ? 'spin' : ''} />
                </button>
              </div>

              <div style={styles.explorerTree}>
                {explorerError ? (
                  <div style={styles.errorContainer}>
                    <AlertCircle size={24} color="#EF4444" style={{ marginBottom: 12 }} />
                    <span style={styles.errorMessage}>{explorerError}</span>
                    <button onClick={fetchExplorerData} style={styles.retryBtn}>
                      <RefreshCw size={12} style={{ marginRight: 6 }} />
                      Retry Schema Scan
                    </button>
                  </div>
                ) : explorerData.map(node => (
                  <div key={node.database} style={styles.treeNode}>
                    <div style={styles.treeRow} onClick={() => toggleDBExpand(node.database)}>
                      <Database size={16} color="#3B82F6" style={{ marginRight: 8 }} />
                      <span style={styles.dbName}>{node.database}</span>
                      {node.error && <AlertCircle size={14} color="#EF4444" style={{ marginLeft: 8 }} title="Database offline/unreachable" />}
                    </div>

                    {expandedDBs[node.database] && (
                      <div style={styles.treeChildren}>
                        {node.tables.length > 0 ? (
                          node.tables.map(table => {
                            const tblKey = `${node.database}:${table.name}`;
                            return (
                              <div key={table.name} style={styles.treeNode}>
                                <div style={styles.treeRow} onClick={() => toggleTableExpand(tblKey)}>
                                  <Table size={14} color="#10B981" style={{ marginRight: 8 }} />
                                  <span style={styles.tableName}>{table.name}</span>
                                  
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation(); // prevent collapsing the node
                                      handleViewTableData(node.database, table.name);
                                    }}
                                    style={styles.inlineViewBtn}
                                    title="View Table Data (SQL Shell)"
                                    className="glass"
                                  >
                                    <Eye size={12} style={{ marginRight: 4 }} />
                                    View Data
                                  </button>
                                </div>

                                {expandedTables[tblKey] && (
                                  <div style={styles.treeChildren}>
                                    {table.columns.map(col => (
                                      <div key={col.name} style={styles.columnRow}>
                                        <Columns size={12} color="var(--color-text-muted)" style={{ marginRight: 8 }} />
                                        <span style={styles.columnName}>{col.name}</span>
                                        <span style={styles.columnType}>{col.type}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div style={styles.treeRowEmpty}>No public tables found.</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: SQL Shell */}
          {activeTab === 'shell' && (
            <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column' }}>
              <div style={styles.shellHeader}>
                <div style={styles.dbSelectRow}>
                  <span style={styles.label}>Target Database:</span>
                  <select
                    value={selectedDb}
                    onChange={(e) => setSelectedDb(e.target.value)}
                    style={styles.select}
                  >
                    {explorerData.map(dbNode => (
                      <option key={dbNode.database} value={dbNode.database}>
                        {dbNode.database}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleExecuteQuery}
                  disabled={executing || !sqlQuery.trim()}
                  style={styles.runBtn}
                >
                  <Play size={14} style={{ marginRight: 6 }} fill="#FFF" />
                  {executing ? 'Running...' : 'Execute Query'}
                </button>
              </div>

              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                placeholder="Write your SQL statements here..."
                style={styles.sqlTextarea}
              />

              <div style={styles.terminalHeader}>Output Console</div>
              <pre style={styles.terminalOutput}>
                <code>{queryOutput || 'No output. Execute a query to see result tables.'}</code>
              </pre>
            </div>
          )}

          {/* TAB 3: Cheat Sheet */}
          {activeTab === 'cheatsheet' && (
            <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column' }}>
              <div style={styles.searchBar}>
                <div style={styles.searchWrapper}>
                  <Search size={15} color="var(--color-text-muted)" style={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search SQL commands or concepts..."
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
    background: 'none',
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
    cursor: 'pointer',
    borderRadius: '6px',
    transition: 'background-color 0.2s',
    userSelect: 'none',
  },
  treeRowEmpty: {
    padding: '6px 8px 6px 32px',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  treeChildren: {
    paddingLeft: '24px',
    borderLeft: '1px dashed var(--border-color)',
    marginTop: '2px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  dbName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  tableName: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  columnRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    fontSize: '12px',
  },
  columnName: {
    color: 'var(--color-text-primary)',
    fontWeight: 500,
    marginRight: '8px',
  },
  columnType: {
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    fontSize: '11px',
  },
  shellHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexShrink: 0,
  },
  dbSelectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  select: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    fontSize: '13px',
    backgroundColor: '#FFF',
    outline: 'none',
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
