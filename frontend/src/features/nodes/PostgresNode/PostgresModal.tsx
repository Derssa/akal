import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Database, Table, Columns, Play, Copy, Check, Search, BookOpen, Terminal, RefreshCw, AlertCircle, Eye, Loader2, Settings, Activity, Server } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'details' | 'simulation' | 'explorer' | 'shell' | 'cheatsheet'>('details');
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

  // Details & Config vertical limits
  const [cpuLimit, setCpuLimit] = useState(1);
  const [memoryLimit, setMemoryLimit] = useState(512);
  const [replicas, setReplicas] = useState(1);
  const [partitions, setPartitions] = useState(2);
  const [scalingLoading, setScalingLoading] = useState(false);

  // Zoom and Pan states for interactive topology viewport
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Floating query particles
  const [particles, setParticles] = useState<Array<{ id: string; target: 'primary' | 'replica'; index?: number; isWrite: boolean }>>([]);

  // Active highlighted target node for simulation flash
  const [activeHighlightNode, setActiveHighlightNode] = useState<string | null>(null);

  // Simulation tab states
  const [isPrimaryCrashed, setIsPrimaryCrashed] = useState(false);
  const [simLogs, setSimLogs] = useState<Array<{ id: string; type: 'read' | 'write' | 'sys' | 'err'; msg: string; time: string }>>([
    { id: '1', type: 'sys', msg: 'Primary Database initialized.', time: new Date().toLocaleTimeString() }
  ]);
  const [simMetrics, setSimMetrics] = useState({ reads: 0, writes: 0, errors: 0 });
  const [trafficActive, setTrafficActive] = useState(false);

  const fetchExplorerDataRef = useRef<() => Promise<void>>(undefined);

  const fetchExplorerData = useCallback(async () => {
    try {
      setLoadingExplorer(true);
      setExplorerError(null);
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/postgres/explorer`);
      if (res.ok) {
        const data = await res.json();
        setExplorerData(data);
      } else {
        const errData = await res.json();
        if (errData.error && errData.error.includes('starting up')) {
          setExplorerError('starting_up');
          // Auto retry in 2.5 seconds
          setTimeout(() => {
            fetchExplorerDataRef.current?.();
          }, 2500);
        } else {
          setExplorerError(errData.error || 'Failed to inspect schema');
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
  }, [fetchExplorerData]);

  // Interactive zoom & pan helper handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scaleChange = e.deltaY < 0 ? 0.08 : -0.08;
    setZoomScale(prev => Math.max(0.5, Math.min(2.0, prev + scaleChange)));
  };

  // Traffic simulation engine
  useEffect(() => {
    if (!trafficActive || activeTab !== 'simulation') return;

    const interval = setInterval(() => {
      const isWrite = Math.random() > 0.55;
      const timeStr = new Date().toLocaleTimeString();
      const logId = Math.random().toString(36).substr(2, 9);
      const particleId = Math.random().toString(36).substr(2, 9);

      if (isWrite) {
        if (isPrimaryCrashed) {
          setSimLogs(prev => [
            { id: logId, type: 'err', msg: 'WRITE FAILED: Primary database instance is crashed/unreachable.', time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, errors: prev.errors + 1 }));
          
          // Spawn failed write particle
          setParticles(prev => [...prev, { id: particleId, target: 'primary', isWrite: true }]);
          setActiveHighlightNode('primary');
          setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== particleId));
            setActiveHighlightNode(null);
          }, 800);
        } else {
          const insertId = Math.floor(Math.random() * 1000);
          const targetPartition = insertId % partitions;
          setSimLogs(prev => [
            { id: logId, type: 'write', msg: `WRITE SUCCESS: INSERT INTO users VALUES(${insertId}) -> Routed to Primary (10.0.1.2) -> Partition [users_p${targetPartition}]`, time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, writes: prev.writes + 1 }));

          // Spawn successful write particle
          setParticles(prev => [...prev, { id: particleId, target: 'primary', isWrite: true }]);
          setActiveHighlightNode('primary');
          setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== particleId));
            setActiveHighlightNode(null);
          }, 800);
        }
      } else {
        // Read
        if (replicas > 0) {
          const targetReplica = Math.floor(Math.random() * replicas) + 1;
          const readId = Math.floor(Math.random() * 1000);
          const sourcePartition = readId % partitions;
          setSimLogs(prev => [
            { id: logId, type: 'read', msg: `READ SUCCESS: SELECT * FROM users_p${sourcePartition} -> Load balanced to Replica #${targetReplica} (10.0.1.${2 + targetReplica})`, time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, reads: prev.reads + 1 }));

          // Spawn replica read particle
          setParticles(prev => [...prev, { id: particleId, target: 'replica', index: targetReplica - 1, isWrite: false }]);
          setActiveHighlightNode(`replica-${targetReplica - 1}`);
          setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== particleId));
            setActiveHighlightNode(null);
          }, 800);
        } else {
          if (isPrimaryCrashed) {
            setSimLogs(prev => [
              { id: logId, type: 'err', msg: 'READ FAILED: No active replicas, and primary database instance is crashed.', time: timeStr },
              ...prev.slice(0, 19)
            ]);
            setSimMetrics(prev => ({ ...prev, errors: prev.errors + 1 }));

            // Spawn failed read particle
            setParticles(prev => [...prev, { id: particleId, target: 'primary', isWrite: false }]);
            setActiveHighlightNode('primary');
            setTimeout(() => {
              setParticles(prev => prev.filter(p => p.id !== particleId));
              setActiveHighlightNode(null);
            }, 800);
          } else {
            const readId = Math.floor(Math.random() * 1000);
            const sourcePartition = readId % partitions;
            setSimLogs(prev => [
              { id: logId, type: 'read', msg: `READ SUCCESS: SELECT * FROM users_p${sourcePartition} -> Routed to Primary (10.0.1.2) [No Replicas Defined]`, time: timeStr },
              ...prev.slice(0, 19)
            ]);
            setSimMetrics(prev => ({ ...prev, reads: prev.reads + 1 }));

            // Spawn primary read particle
            setParticles(prev => [...prev, { id: particleId, target: 'primary', isWrite: false }]);
            setActiveHighlightNode('primary');
            setTimeout(() => {
              setParticles(prev => prev.filter(p => p.id !== particleId));
              setActiveHighlightNode(null);
            }, 800);
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [trafficActive, isPrimaryCrashed, replicas, partitions, activeTab]);

  const handleUpdateLimits = async () => {
    try {
      setScalingLoading(true);
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpus: cpuLimit, memory: memoryLimit })
      });
      if (res.ok) {
        setSimLogs(prev => [
          { id: Math.random().toString(), type: 'sys', msg: `Limits updated: CPU ${cpuLimit} Cores, Memory ${memoryLimit}MB. docker update applied.`, time: new Date().toLocaleTimeString() },
          ...prev
        ]);
      } else {
        console.error('Failed to update limits');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScalingLoading(false);
    }
  };

  const handleExecuteQuery = async () => {
    let targetDb = selectedDb;
    let queryToRun = sqlQuery;
    let localConsoleOutput = '';

    const connectRegex = /^\s*\\(?:c|connect)\s+([a-zA-Z0-9_"\-]+)/m;
    const match = sqlQuery.match(connectRegex);
    if (match) {
      const dbName = match[1].replace(/"/g, '');
      targetDb = dbName;
      setSelectedDb(dbName);
      queryToRun = sqlQuery.replace(connectRegex, '').trim();
      localConsoleOutput = `Switched database connection context to "${dbName}".\n`;
    }

    if (!queryToRun) {
      setQueryOutput(`${localConsoleOutput}No SQL statements left to run.`);
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
        fetchExplorerData();
      } else {
        setQueryOutput(localConsoleOutput + `ERROR: ${data.error}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setQueryOutput(localConsoleOutput + `Execution failed: ${errMsg}`);
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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setQueryOutput(`Execution failed: ${errMsg}`);
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

  const filteredCheatSheet = CHEAT_SHEET_DATA.filter(item => {
    const query = cheatQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );
  });

  const getReplicasStyles = () => {
    let styleStr = '';
    if (replicas === 1) {
      styleStr += `
        @keyframes flowToReplica0 {
          0% { left: 15%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 50%; opacity: 0; }
        }
      `;
    } else if (replicas === 2) {
      styleStr += `
        @keyframes flowToReplica0 {
          0% { left: 15%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 35%; opacity: 0; }
        }
        @keyframes flowToReplica1 {
          0% { left: 15%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 65%; opacity: 0; }
        }
      `;
    } else if (replicas === 3) {
      styleStr += `
        @keyframes flowToReplica0 {
          0% { left: 15%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 20%; opacity: 0; }
        }
        @keyframes flowToReplica1 {
          0% { left: 15%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 50%; opacity: 0; }
        }
        @keyframes flowToReplica2 {
          0% { left: 15%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 80%; opacity: 0; }
        }
      `;
    }
    return styleStr;
  };

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
              <Settings size={15} style={{ marginRight: 6 }} />
              Details & Config
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'simulation' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('simulation')}
            >
              <Activity size={15} style={{ marginRight: 6 }} />
              Simulation
            </button>
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
          {/* TAB: Details & Config */}
          {activeTab === 'details' && (
            <div style={styles.tabContent}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#1E293B' }}>Database Scaling & Parameters</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748B' }}>
                Configure vertical container limits and horizontal database replication parameters.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155' }}>Vertical Resource Controls</h4>
                  
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>CPU Core Limit</span>
                      <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: 'bold' }}>{cpuLimit} vCPU</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="4"
                      step="0.2"
                      value={cpuLimit}
                      onChange={(e) => setCpuLimit(parseFloat(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>RAM Limit</span>
                      <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: 'bold' }}>{memoryLimit} MB</span>
                    </div>
                    <input
                      type="range"
                      min="128"
                      max="2048"
                      step="128"
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(parseInt(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <button
                    onClick={handleUpdateLimits}
                    disabled={scalingLoading}
                    style={{
                      width: '100%',
                      backgroundColor: '#2563EB',
                      color: 'white',
                      border: 'none',
                      padding: '8px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {scalingLoading ? 'Applying Resource Changes...' : 'Apply Resource Changes'}
                  </button>
                </div>

                 <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155' }}>Horizontal Scaling & Partitioning</h4>
                  
                  <div style={{ marginBottom: '16px', display: 'flex', gap: '24px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                        Replica Pool Size
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                          onClick={() => setReplicas(prev => Math.max(0, prev - 1))}
                          style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          -
                        </button>
                        <span style={{ fontSize: '16px', fontWeight: 'bold', width: '20px', textAlign: 'center' }}>{replicas}</span>
                        <button
                          onClick={() => setReplicas(prev => Math.min(3, prev + 1))}
                          style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                        Table Partitions
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                          onClick={() => setPartitions(prev => Math.max(1, prev - 1))}
                          style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          -
                        </button>
                        <span style={{ fontSize: '16px', fontWeight: 'bold', width: '20px', textAlign: 'center' }}>{partitions}</span>
                        <button
                          onClick={() => setPartitions(prev => Math.min(5, prev + 1))}
                          style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '12px' }}>
                    Replicas scale reads. Partitions divide large datasets (e.g. users) horizontally into sub-tables (p0 to p4) for optimized search performance.
                  </span>

                  <div style={{ backgroundColor: '#F8FAFC', borderRadius: '6px', padding: '12px', borderLeft: '3px solid #2563EB' }}>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#475569' }}>Topology Note</h5>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      Replication uses log-shipping. Replicas act as read-only copies. Primary failures stop writes, but read queries remain available on active replicas.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Simulation */}
          {activeTab === 'simulation' && (
            <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#1E293B' }}>Database Traffic & Failover Dashboard</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                    Generate traffic and test database high-availability scenarios.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setTrafficActive(p => !p)}
                    style={{
                      backgroundColor: trafficActive ? '#EF4444' : '#10B981',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    {trafficActive ? 'Pause Traffic' : 'Start Simulation'}
                  </button>
                  <button
                    onClick={() => {
                      if (isPrimaryCrashed) {
                        setIsPrimaryCrashed(false);
                        setSimLogs(prev => [
                          { id: Math.random().toString(), type: 'sys', msg: 'Failover/Recovery: Primary Postgres Server recovered and is ONLINE.', time: new Date().toLocaleTimeString() },
                          ...prev
                        ]);
                      } else {
                        setIsPrimaryCrashed(true);
                        setSimLogs(prev => [
                          { id: Math.random().toString(), type: 'err', msg: 'FAILOVER EVENT: Primary Postgres container CRASHED (Offline).', time: new Date().toLocaleTimeString() },
                          ...prev
                        ]);
                      }
                    }}
                    style={{
                      backgroundColor: isPrimaryCrashed ? '#10B981' : '#EF4444',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    {isPrimaryCrashed ? 'Recover Primary' : 'Crash Primary'}
                  </button>
                  {isPrimaryCrashed && replicas > 0 && (
                    <button
                      onClick={() => {
                        setIsPrimaryCrashed(false);
                        setReplicas(prev => prev - 1);
                        setSimLogs(prev => [
                          { id: Math.random().toString(), type: 'sys', msg: 'FAILOVER COMPLETED: Replica promoted to Primary. Writes restored.', time: new Date().toLocaleTimeString() },
                          ...prev
                        ]);
                      }}
                      style={{
                        backgroundColor: '#3B82F6',
                        color: 'white',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Promote Replica
                    </button>
                  )}
                </div>
              </div>

              {/* Simulation metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>Reads Handled</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563EB', marginTop: '4px' }}>{simMetrics.reads}</div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>Writes Handled</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10B981', marginTop: '4px' }}>{simMetrics.writes}</div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#FEE2E2' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#991B1B', fontWeight: 600 }}>Errors / Failures</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#EF4444', marginTop: '4px' }}>{simMetrics.errors}</div>
                </div>
              </div>

              {/* Dynamic CSS Styles for Simulation Animations */}
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes flowToPrimary {
                  0% { left: 15%; top: 50%; opacity: 1; }
                  100% { left: 45%; top: 50%; opacity: 0; }
                }
                .flow-particle {
                  position: absolute;
                  width: 8px;
                  height: 8px;
                  border-radius: 50%;
                  pointer-events: none;
                  z-index: 20;
                  box-shadow: 0 0 8px currentColor;
                }
                .ring-glow {
                  position: absolute;
                  border-radius: 50%;
                  pointer-events: none;
                  animation: ringFlash 0.8s ease-out forwards;
                  border: 2px solid currentColor;
                  z-index: 10;
                }
                @keyframes ringFlash {
                  0% { width: 40px; height: 40px; opacity: 0.8; }
                  100% { width: 80px; height: 80px; opacity: 0; }
                }
                ${getReplicasStyles()}
              `}} />

              {/* Topology Map Wrapper (Zoom/Pan Container) */}
              <div 
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                style={{ 
                  flex: 1, 
                  minHeight: '260px', 
                  border: '1px solid #E2E8F0', 
                  borderRadius: '8px', 
                  backgroundColor: '#0F172A', 
                  position: 'relative', 
                  overflow: 'hidden',
                  cursor: isPanning ? 'grabbing' : 'grab',
                  userSelect: 'none'
                }}
              >
                {/* Reset Zoom Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: '#94A3B8',
                    padding: '2px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    zIndex: 30
                  }}
                >
                  Reset View (Zoom: {Math.round(zoomScale * 100)}%)
                </button>

                {/* Inner Viewport applying Zoom & Pan */}
                <div style={{
                  width: '100%',
                  height: '100%',
                  position: 'absolute',
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                  transformOrigin: 'center center',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}>
                  {/* Client source */}
                  <div style={{ position: 'absolute', left: '10%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Server size={32} color="#94A3B8" />
                    <span style={{ color: '#E2E8F0', fontSize: '11px', marginTop: '6px', fontWeight: 600 }}>App Server</span>
                    <span style={{ color: '#64748B', fontSize: '10px' }}>10.0.1.1</span>
                  </div>

                  {/* Flowing Query Particles */}
                  {particles.map(p => {
                    const animationName = p.target === 'primary' ? 'flowToPrimary' : `flowToReplica${p.index ?? 0}`;
                    const color = p.isWrite ? '#10B981' : '#3B82F6';
                    return (
                      <div
                        key={p.id}
                        className="flow-particle"
                        style={{
                          color,
                          backgroundColor: color,
                          animation: `${animationName} 0.8s ease-in-out forwards`
                        }}
                      />
                    );
                  })}

                  {/* Arrow indicator */}
                  <div style={{ position: 'absolute', left: '30%', top: '50%', transform: 'translateY(-50%)', color: trafficActive ? '#10B981' : '#475569' }}>
                    <span className={trafficActive ? 'pulse' : ''} style={{ fontSize: '18px', fontWeight: 'bold' }}>➔</span>
                  </div>

                  {/* Primary DB Node */}
                  <div style={{ position: 'absolute', left: '42%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Database size={44} color={isPrimaryCrashed ? '#EF4444' : '#10B981'} />
                      {activeHighlightNode === 'primary' && (
                        <div className="ring-glow" style={{ color: isPrimaryCrashed ? '#EF4444' : '#10B981' }} />
                      )}
                    </div>
                    <span style={{ color: '#E2E8F0', fontSize: '12px', fontWeight: 'bold', marginTop: '6px' }}>Primary SQL DB</span>
                    <span style={{ color: isPrimaryCrashed ? '#EF4444' : '#10B981', fontSize: '10px' }}>
                      {isPrimaryCrashed ? 'OFFLINE (Crashed)' : 'ONLINE (10.0.1.2)'}
                    </span>
                  </div>

                  {/* Replicas container */}
                  {replicas > 0 && (
                    <div style={{ position: 'absolute', right: '12%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
                      {Array.from({ length: replicas }).map((_, i) => {
                        const isNodeActive = activeHighlightNode === `replica-${i}`;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#3B82F6', fontSize: '12px' }}>➔</span>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <Database size={28} color="#3B82F6" />
                                {isNodeActive && (
                                  <div className="ring-glow" style={{ color: '#3B82F6' }} />
                                )}
                              </div>
                              <span style={{ color: '#E2E8F0', fontSize: '10px', fontWeight: 600 }}>Replica #{i + 1}</span>
                              <span style={{ color: '#64748B', fontSize: '9px' }}>10.0.1.{3 + i}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Logs output */}
              <div style={{ height: '150px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Simulated Event Log
                </div>
                <div style={{ flex: 1, backgroundColor: '#0F172A', color: '#94A3B8', borderRadius: '8px', padding: '10px', fontFamily: 'monospace', fontSize: '11px', overflowY: 'auto' }}>
                  {simLogs.map(log => (
                    <div key={log.id} style={{ marginBottom: '4px', color: log.type === 'err' ? '#FCA5A5' : log.type === 'sys' ? '#6EE7B7' : log.type === 'write' ? '#A7F3D0' : '#93C5FD' }}>
                      [{log.time}] {log.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: Database Explorer */}
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
                  explorerError === 'starting_up' ? (
                    <div style={styles.errorContainer}>
                      <Loader2 size={24} className="spin" color="#3B82F6" style={{ marginBottom: 12 }} />
                      <span style={styles.errorMessage}>Database server is initializing... This may take a few seconds.</span>
                    </div>
                  ) : (
                    <div style={styles.errorContainer}>
                      <AlertCircle size={24} color="#EF4444" style={{ marginBottom: 12 }} />
                      <span style={styles.errorMessage}>{explorerError}</span>
                      <button onClick={fetchExplorerData} style={styles.retryBtn}>
                        <RefreshCw size={12} style={{ marginRight: 6 }} />
                        Retry Schema Scan
                      </button>
                    </div>
                  )
                ) : explorerData.map(node => (
                  <div key={node.database} style={styles.treeNode}>
                    <div style={styles.treeRow} onClick={() => toggleDBExpand(node.database)}>
                      <Database size={16} color="#3B82F6" style={{ marginRight: 8 }} />
                      <span style={styles.dbName}>{node.database}</span>
                      {node.error && (
                        <span title="Database offline/unreachable">
                          <AlertCircle size={14} color="#EF4444" style={{ marginLeft: 8 }} />
                        </span>
                      )}
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
                                      e.stopPropagation();
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

          {/* TAB: SQL Shell */}
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

          {/* TAB: Cheat Sheet */}
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
