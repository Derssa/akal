import { useState, useEffect, useRef } from 'react';
import { X, Cpu, Server, AlertTriangle, RotateCw, Settings, Activity } from 'lucide-react';
import { API_BASE } from '../../../shared/types';
import type { ContainerData } from '../../../shared/types';

interface AsgModalProps {
  asgId: string;
  nodeName: string;
  projectId: string;
  config?: any; // networkConfig
  containers: ContainerData[];
  onClose: () => void;
  onSaveConfig: (asgConfig: {
    desiredCapacity: number;
    minCapacity: number;
    maxCapacity: number;
    parentId: string;
    subnetIds: string[];
  }) => Promise<void>;
  onRefreshContainers: () => Promise<void>;
}

export default function AsgModal({
  asgId,
  nodeName,
  projectId,
  config,
  containers,
  onClose,
  onSaveConfig,
  onRefreshContainers
}: AsgModalProps) {
  const asgData = config?.asgs?.[asgId] || {
    desiredCapacity: 1,
    minCapacity: 1,
    maxCapacity: 4,
    parentId: '',
    subnetIds: []
  };

  const [desiredCapacity, setDesiredCapacity] = useState<number>(asgData.desiredCapacity);
  const [minCapacity, setMinCapacity] = useState<number>(asgData.minCapacity || 1);
  const [maxCapacity, setMaxCapacity] = useState<number>(asgData.maxCapacity || 4);
  const [parentId, setParentId] = useState<string>(asgData.parentId || '');
  const [selectedSubnets, setSelectedSubnets] = useState<string[]>(asgData.subnetIds || []);

  const [activeTab, setActiveTab] = useState<'details' | 'simulation'>('details');
  const [deploying, setDeploying] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const isScalingRef = useRef(false);

  const isConfigChanged = 
    desiredCapacity !== asgData.desiredCapacity ||
    minCapacity !== (asgData.minCapacity || 1) ||
    maxCapacity !== (asgData.maxCapacity || 4) ||
    parentId !== (asgData.parentId || '') ||
    JSON.stringify(selectedSubnets.slice().sort()) !== JSON.stringify((asgData.subnetIds || []).slice().sort());

  const handleMinCapacityChange = (val: number) => {
    const minVal = Math.max(1, val);
    setMinCapacity(minVal);
    if (desiredCapacity < minVal) {
      setDesiredCapacity(minVal);
    }
    if (maxCapacity < minVal) {
      setMaxCapacity(minVal);
    }
  };

  const handleMaxCapacityChange = (val: number) => {
    const maxVal = Math.max(minCapacity, val);
    setMaxCapacity(maxVal);
    if (desiredCapacity > maxVal) {
      setDesiredCapacity(maxVal);
    }
  };

  const handleDesiredCapacityChange = (val: number) => {
    const desiredVal = Math.max(minCapacity, Math.min(maxCapacity, val));
    setDesiredCapacity(desiredVal);
  };
  
  // Auto Simulation States
  const [isAutoSimulating, setIsAutoSimulating] = useState(false);
  const [simulatedCpu, setSimulatedCpu] = useState(45);
  const [simulatedTraffic, setSimulatedTraffic] = useState(120);
  const [simulationMode, setSimulationMode] = useState<'normal' | 'spike' | 'idle'>('normal');

  // Get available template servers (Only general purpose Ubuntu nodes that are NOT ASG instances themselves)
  const availableTemplates = containers.filter(
    c => c.type === 'ubuntu' && !c.isAsgInstance
  );

  // Filter dynamic instances spawned by this ASG
  const asgInstances = containers.filter(
    c => c.asgId === asgId && c.isAsgInstance
  );

  const prevInstancesCountRef = useRef(asgInstances.length);

  // Monitor replica scale count to auto-reset load mode back to normal once replicas scale out/in
  useEffect(() => {
    if (!isAutoSimulating) {
      prevInstancesCountRef.current = asgInstances.length;
      return;
    }

    if (simulationMode === 'spike' && asgInstances.length > prevInstancesCountRef.current) {
      // Scale out occurred! Switch mode back to normal load so traffic stabilizes at the high level
      setSimulationMode('normal');
    } else if (simulationMode === 'idle' && asgInstances.length < prevInstancesCountRef.current) {
      // Scale in occurred! Switch mode back to normal load so traffic stabilizes at the low level
      setSimulationMode('normal');
    }

    prevInstancesCountRef.current = asgInstances.length;
  }, [asgInstances.length, isAutoSimulating, simulationMode]);

  const handleToggleAutoSimulation = async () => {
    const nextAuto = !isAutoSimulating;
    setIsAutoSimulating(nextAuto);
    if (!nextAuto) {
      // Stopping simulation: reset desiredCapacity back to user's configured desired capacity
      const baseDesired = asgData.desiredCapacity || 1;
      setDesiredCapacity(baseDesired);
      setSimulationMode('normal');
      setSimulatedCpu(45);
      setSimulatedTraffic(120);
      try {
        await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/${asgId}/scale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ desiredCapacity: baseDesired, subnetIds: selectedSubnets })
        });
        await onRefreshContainers();
      } catch (err) {
        console.error('Failed to reset ASG capacity on simulation stop:', err);
      }
    }
  };

  // Trigger self-healing monitor query every 2 seconds when simulation tab is active
  useEffect(() => {
    if (activeTab !== 'simulation') return;
    const interval = setInterval(() => {
      onRefreshContainers();
    }, 2000);
    return () => clearInterval(interval);
  }, [activeTab, onRefreshContainers]);

  // Automated Load & Traffic Simulator Effect (Runs every 1 second for fast response)
  useEffect(() => {
    if (!isAutoSimulating) return;

    const interval = setInterval(async () => {
      let nextTraffic: number;

      if (simulationMode === 'spike') {
        // Increase traffic load rapidly (+80 req/sec)
        nextTraffic = Math.min(1000, simulatedTraffic + 80);
      } else if (simulationMode === 'idle') {
        // Decrease traffic load rapidly (-80 req/sec)
        nextTraffic = Math.max(10, simulatedTraffic - 80);
      } else {
        // Normal traffic drift
        const trafficDelta = Math.floor(Math.random() * 31) - 15;
        nextTraffic = Math.max(10, Math.min(1000, simulatedTraffic + trafficDelta));
      }

      // Calculate CPU load dynamically: CPU = Traffic / (Active Instances * Instance Capacity Factor)
      // Each instance handles ~200 req/sec at full capacity
      const activeInstancesCount = Math.max(1, asgInstances.length);
      const calculatedCpu = Math.round(nextTraffic / (activeInstancesCount * 2));
      const nextCpu = Math.max(10, Math.min(99, calculatedCpu));

      setSimulatedCpu(nextCpu);
      setSimulatedTraffic(nextTraffic);

      // Trigger automatic scaling based on thresholds (Scale Up at > 75%, Scale Down at < 35%)
      if (nextCpu > 75 && desiredCapacity < maxCapacity && !isScalingRef.current) {
        const next = desiredCapacity + 1;
        setDesiredCapacity(next);
        isScalingRef.current = true;
        try {
          await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/${asgId}/scale`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desiredCapacity: next, subnetIds: selectedSubnets })
          });
          await onRefreshContainers();
        } catch (err) {
          console.error(err);
        } finally {
          isScalingRef.current = false;
        }
      } else if (nextCpu < 35 && desiredCapacity > (asgData.desiredCapacity || 1) && !isScalingRef.current) {
        const next = desiredCapacity - 1;
        setDesiredCapacity(next);
        isScalingRef.current = true;
        try {
          await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/${asgId}/scale`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desiredCapacity: next, subnetIds: selectedSubnets })
          });
          await onRefreshContainers();
        } catch (err) {
          console.error(err);
        } finally {
          isScalingRef.current = false;
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isAutoSimulating, simulatedCpu, simulatedTraffic, simulationMode, desiredCapacity, minCapacity, maxCapacity, asgId, projectId, selectedSubnets, onRefreshContainers, asgInstances.length, asgData.desiredCapacity]);

  const handleToggleSubnet = (subnetId: string) => {
    setSelectedSubnets(prev =>
      prev.includes(subnetId)
        ? prev.filter(id => id !== subnetId)
        : [...prev, subnetId]
    );
  };

  const handleSaveAndDeploy = async () => {
    if (!parentId) return;
    setDeploying(true);
    try {
      // 1. Save settings
      await onSaveConfig({
        desiredCapacity,
        minCapacity,
        maxCapacity,
        parentId,
        subnetIds: selectedSubnets
      });
      // 2. Deploy (which commits golden image and scales ASG instances)
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/${asgId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentNodeId: parentId,
          desiredCapacity,
          subnetIds: selectedSubnets
        })
      });
      if (res.ok) {
        await onRefreshContainers();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeploying(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveConfig({
        desiredCapacity,
        minCapacity,
        maxCapacity,
        parentId,
        subnetIds: selectedSubnets
      });
      await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/${asgId}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desiredCapacity,
          subnetIds: selectedSubnets
        })
      });
      await onRefreshContainers();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/${asgId}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desiredCapacity: 0,
          subnetIds: selectedSubnets
        })
      });
      await onRefreshContainers();
    } catch (err) {
      console.error(err);
    } finally {
      setStopping(false);
    }
  };

  const handleSimulateFailure = async (instanceId: string) => {
    setTerminatingId(instanceId);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/asg/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId })
      });
      if (res.ok) {
        await onRefreshContainers();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTerminatingId(null);
    }
  };



  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <Cpu size={18} color="#EC4899" />
            <span style={styles.title}>{nodeName} Configuration</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div style={styles.tabBar}>
          <button
            style={activeTab === 'details' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('details')}
          >
            <Settings size={14} /> Design & Scaling settings
          </button>
          <button
            style={activeTab === 'simulation' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('simulation')}
          >
            <Activity size={14} /> Simulation & Live Grid ({asgInstances.length})
          </button>
        </div>

        <div style={styles.content}>
          {activeTab === 'details' ? (
            <div style={styles.tabContent}>
              <div style={styles.grid2Col}>
                {/* Launch Template select */}
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>1. Launch Template Source</h3>
                  <p style={{ fontSize: '11px', color: '#6B7280', marginBottom: '8px' }}>
                    Select a parent Ubuntu server to use as the golden launch template for ASG scaling replica copies:
                  </p>
                  <div style={{ marginTop: '12px' }}>
                    <label style={styles.fieldLabel}>Select Template Server</label>
                    <select
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      style={styles.select}
                    >
                      <option value="">-- Select template server --</option>
                      {availableTemplates.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({config?.nodeIpMap?.[c.id] || c.ip || 'pending'})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Subnet settings */}
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>2. VPC Subnet Targets</h3>
                  <p style={{ fontSize: '11px', color: '#6B7280', marginBottom: '8px' }}>
                    Choose the subnets where the ASG can deploy scaling replica servers:
                  </p>
                  <div style={styles.subnetList}>
                    {config?.subnets?.map((subnet: any) => (
                      <label key={subnet.id} style={styles.subnetItem}>
                        <input
                          type="checkbox"
                          checked={selectedSubnets.includes(subnet.id)}
                          onChange={() => handleToggleSubnet(subnet.id)}
                          style={{ marginRight: '8px' }}
                        />
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '12px' }}>{subnet.name}</span>
                          <span style={{ fontSize: '10px', color: '#9CA3AF', marginLeft: '6px' }}>({subnet.type})</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scaling values */}
              <div style={{ ...styles.section, marginTop: '16px' }}>
                <h3 style={styles.sectionTitle}>3. Instance Capacity Limits</h3>
                <div style={styles.capacityRow}>
                  <div style={styles.capacityField}>
                    <label style={styles.fieldLabel}>Min Instances</label>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => handleMinCapacityChange(minCapacity - 1)}
                        style={styles.stepperBtn}
                      >-</button>
                      <input
                        type="number"
                        min={1}
                        max={maxCapacity}
                        value={minCapacity}
                        onChange={(e) => handleMinCapacityChange(parseInt(e.target.value) || 1)}
                        style={styles.inputNum}
                      />
                      <button 
                        type="button" 
                        onClick={() => handleMinCapacityChange(minCapacity + 1)}
                        style={styles.stepperBtn}
                      >+</button>
                    </div>
                  </div>
                  <div style={styles.capacityField}>
                    <label style={styles.fieldLabel}>Max Instances</label>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => handleMaxCapacityChange(maxCapacity - 1)}
                        style={styles.stepperBtn}
                      >-</button>
                      <input
                        type="number"
                        min={minCapacity}
                        max={10}
                        value={maxCapacity}
                        onChange={(e) => handleMaxCapacityChange(parseInt(e.target.value) || 4)}
                        style={styles.inputNum}
                      />
                      <button 
                        type="button" 
                        onClick={() => handleMaxCapacityChange(maxCapacity + 1)}
                        style={styles.stepperBtn}
                      >+</button>
                    </div>
                  </div>
                  <div style={styles.capacityField}>
                    <label style={styles.fieldLabel}>Desired Instances</label>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => handleDesiredCapacityChange(desiredCapacity - 1)}
                        style={styles.stepperBtn}
                      >-</button>
                      <input
                        type="number"
                        min={minCapacity}
                        max={maxCapacity}
                        value={desiredCapacity}
                        onChange={(e) => handleDesiredCapacityChange(parseInt(e.target.value) || 1)}
                        style={styles.inputNum}
                      />
                      <button 
                        type="button" 
                        onClick={() => handleDesiredCapacityChange(desiredCapacity + 1)}
                        style={styles.stepperBtn}
                      >+</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save & Deploy / Stop buttons */}
              <div style={styles.footer}>
                {asgInstances.length > 0 ? (
                  <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-end' }}>
                    {isConfigChanged && (
                      <button
                        onClick={handleSave}
                        disabled={saving || !parentId || selectedSubnets.length === 0}
                        style={{ ...styles.actionBtn, backgroundColor: '#3B82F6' }}
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    )}
                    <button
                      onClick={handleStop}
                      disabled={stopping}
                      style={{ ...styles.actionBtn, backgroundColor: '#EF4444' }}
                    >
                      {stopping ? (
                        <>
                          <RotateCw size={14} className="spin" style={{ marginRight: '6px' }} />
                          Stopping...
                        </>
                      ) : (
                        'Stop'
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleSaveAndDeploy}
                    disabled={deploying || !parentId || selectedSubnets.length === 0}
                    style={{
                      ...styles.actionBtn,
                      backgroundColor: (!parentId || selectedSubnets.length === 0) ? '#D1D5DB' : '#EC4899',
                      color: (!parentId || selectedSubnets.length === 0) ? '#9CA3AF' : '#FFFFFF',
                      cursor: (!parentId || selectedSubnets.length === 0) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {deploying ? (
                      <>
                        <RotateCw size={14} className="spin" style={{ marginRight: '6px' }} />
                        Deploying...
                      </>
                    ) : (
                      'Save & Deploy'
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.tabContent}>
              {/* Simulation view */}
              <div style={styles.infoBanner}>
                <Activity size={18} color="#3B82F6" />
                <span style={{ fontSize: '12px', color: '#1E3A8A', fontWeight: '500' }}>
                  Auto Scaling self-healing check runs every 2s. If an instance is crashed, a replacement will launch.
                </span>
              </div>

              {/* Automated Load & Traffic Simulator */}
              <div style={{ ...styles.section, backgroundColor: isAutoSimulating ? 'rgba(236, 72, 153, 0.05)' : 'rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#111827' }}>
                      Automated Load & Traffic Simulator
                    </span>
                    <span style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                      Simulate real-world client requests. ASG automatically scales out at &gt;75% CPU and scales in at &lt;35% CPU.
                    </span>
                  </div>
                  <button
                    onClick={handleToggleAutoSimulation}
                    disabled={asgInstances.length === 0}
                    style={{
                      ...styles.actionBtn,
                      backgroundColor: isAutoSimulating ? '#EF4444' : (asgInstances.length === 0 ? '#D1D5DB' : '#10B981'),
                      color: asgInstances.length === 0 ? '#9CA3AF' : '#FFFFFF',
                      cursor: asgInstances.length === 0 ? 'not-allowed' : 'pointer',
                      padding: '6px 12px',
                    }}
                    title={asgInstances.length === 0 ? 'Deploy the ASG configuration first to start simulation' : ''}
                  >
                    {isAutoSimulating ? 'Stop Auto-Simulation' : 'Start Auto-Simulation'}
                  </button>
                </div>
                {isAutoSimulating && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#4B5563' }}>Simulation Control:</span>
                      <button
                        onClick={() => setSimulationMode('normal')}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          borderRadius: '3px',
                          border: '1px solid #D1D5DB',
                          cursor: 'pointer',
                          backgroundColor: simulationMode === 'normal' ? '#3B82F6' : '#FFF',
                          color: simulationMode === 'normal' ? '#FFF' : '#374151'
                        }}
                      >
                        Normal Load
                      </button>
                      <button
                        onClick={() => setSimulationMode('spike')}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          borderRadius: '3px',
                          border: '1px solid #EF4444',
                          cursor: 'pointer',
                          backgroundColor: simulationMode === 'spike' ? '#EF4444' : '#FFF',
                          color: simulationMode === 'spike' ? '#FFF' : '#EF4444'
                        }}
                        title="Spike CPU load up fast"
                      >
                        Spike Traffic (Scale Out)
                      </button>
                      <button
                        onClick={() => setSimulationMode('idle')}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          borderRadius: '3px',
                          border: '1px solid #3B82F6',
                          cursor: 'pointer',
                          backgroundColor: simulationMode === 'idle' ? '#3B82F6' : '#FFF',
                          color: simulationMode === 'idle' ? '#FFF' : '#3B82F6'
                        }}
                        title="Drop CPU load down fast"
                      >
                        Drop Traffic (Scale In)
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '24px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#6B7280' }}>Simulated CPU Load:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                          <div style={{ width: '80px', height: '8px', backgroundColor: '#E5E7EB', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${simulatedCpu}%`, height: '100%', backgroundColor: simulatedCpu > 75 ? '#EF4444' : simulatedCpu < 35 ? '#3B82F6' : '#10B981' }} />
                          </div>
                          <strong style={{ fontSize: '12px', color: '#1F2937' }}>{simulatedCpu}%</strong>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#6B7280' }}>Simulated Incoming Traffic:</span>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1F2937', marginTop: '2px' }}>
                          {simulatedTraffic} req/sec
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>


              <div style={styles.instanceGrid}>
                {asgInstances.length === 0 ? (
                  <div style={styles.emptyState}>
                    <AlertTriangle size={24} color="#F59E0B" />
                    <span style={{ fontSize: '13px', color: '#4B5563', marginTop: '6px', fontWeight: 'bold' }}>
                      No active replicas deployed
                    </span>
                    <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
                      Setup template configuration and click "Deploy Code Changes" to spawn replicas.
                    </span>
                  </div>
                ) : (
                  asgInstances.map(instance => {
                    const isRunning = instance.state === 'running';
                    return (
                      <div key={instance.id} style={styles.instanceCard}>
                        <div style={styles.instanceHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Server size={16} color={isRunning ? '#10B981' : '#EF4444'} />
                            <span 
                              style={{ 
                                fontWeight: 'bold', 
                                fontSize: '11px', 
                                color: '#1F2937',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                maxWidth: '80px'
                              }}
                              title={instance.name}
                            >
                              {instance.name}
                            </span>
                          </div>
                          <span style={{
                            fontSize: '9px',
                            backgroundColor: isRunning ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: isRunning ? '#10B981' : '#EF4444',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            fontWeight: 'bold'
                          }}>
                            {isRunning ? 'Healthy' : 'Crashed'}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '11px', color: '#6B7280', margin: '6px 0' }}>
                          <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}><strong>IP:</strong> {instance.ip || 'Resolving...'}</div>
                          {isAutoSimulating && isRunning && (
                            <div style={{ marginTop: '2px' }}>
                              <strong>CPU:</strong>{' '}
                              <span style={{ color: simulatedCpu > 75 ? '#EF4444' : simulatedCpu < 35 ? '#3B82F6' : '#10B981', fontWeight: 'bold' }}>
                                {Math.max(10, Math.min(99, simulatedCpu + (instance.name.charCodeAt(instance.name.length - 1) % 7) - 3))}%
                              </span>
                            </div>
                          )}
                        </div>

                        {isRunning ? (
                          <button
                            onClick={() => handleSimulateFailure(instance.id)}
                            disabled={terminatingId === instance.id}
                            style={styles.killBtn}
                          >
                            {terminatingId === instance.id ? 'Stopping...' : 'Simulate Failure'}
                          </button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#EF4444', fontWeight: 'bold' }}>
                            <RotateCw size={12} className="spin" />
                            Self-healing auto-replacing...
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
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
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  container: {
    width: '840px',
    height: '560px',
    backgroundColor: 'var(--bg-surface-solid, #ffffff)',
    border: '1px solid var(--border-color, #E5E7EB)',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid var(--border-color, #E5E7EB)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontWeight: 'bold',
    fontSize: '15px',
    color: 'var(--color-text-primary, #111827)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#9CA3AF',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color, #E5E7EB)',
    backgroundColor: 'var(--bg-sidebar, #F9FAFB)',
  },
  tab: {
    flex: 1,
    padding: '12px',
    borderStyle: 'none',
    borderWidth: 0,
    background: 'none',
    fontSize: '13px',
    fontWeight: 500,
    color: '#6B7280',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    borderBottom: '2px solid transparent',
  },
  tabActive: {
    flex: 1,
    padding: '12px',
    borderStyle: 'none',
    borderWidth: 0,
    background: 'none',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#EC4899',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    borderBottom: '2px solid #EC4899',
  },
  content: {
    padding: '20px',
    flex: 1,
    overflowY: 'auto',
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  grid2Col: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  section: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    border: '1px solid var(--border-color, #E5E7EB)',
    borderRadius: '8px',
    padding: '14px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: 'var(--color-text-primary, #374151)',
    marginBottom: '10px',
    borderBottom: '1px solid rgba(0,0,0,0.05)',
    paddingBottom: '4px',
  },
  dropZone: {
    height: '110px',
    border: '2px dashed #D1D5DB',
    borderRadius: '6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  select: {
    width: '100%',
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid #D1D5DB',
    fontSize: '12px',
  },
  fieldLabel: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#6B7280',
    marginBottom: '4px',
    display: 'block',
  },
  subnetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '140px',
    overflowY: 'auto',
  },
  subnetItem: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '4px 0',
  },
  capacityRow: {
    display: 'flex',
    gap: '20px',
  },
  capacityField: {
    flex: 1,
  },
  stepperBtn: {
    backgroundColor: '#F3F4F6',
    border: '1px solid #D1D5DB',
    color: '#374151',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '16px',
    cursor: 'pointer',
    userSelect: 'none',
    outline: 'none',
    borderRadius: '4px',
  },
  inputNum: {
    flex: 1,
    height: '32px',
    borderTop: '1px solid #D1D5DB',
    borderBottom: '1px solid #D1D5DB',
    borderLeft: 'none',
    borderRight: 'none',
    fontSize: '13px',
    textAlign: 'center',
    backgroundColor: '#FFFFFF',
    fontWeight: '600',
    outline: 'none',
    width: '40px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '12px',
    borderTop: '1px solid rgba(0,0,0,0.05)',
    paddingTop: '16px',
  },
  actionBtn: {
    padding: '8px 16px',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  infoBanner: {
    backgroundColor: '#EFF6FF',
    border: '1px solid #BFDBFE',
    borderRadius: '6px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  instanceGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginTop: '10px',
  },
  instanceCard: {
    width: 'calc(25% - 8px)',
    minWidth: '170px',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '10px',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  instanceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #F3F4F6',
    paddingBottom: '8px',
  },
  killBtn: {
    width: '100%',
    padding: '6px',
    backgroundColor: '#FEE2E2',
    color: '#EF4444',
    border: '1px solid #FCA5A5',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  emptyState: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
  },
  scaleSimBtn: {
    padding: '6px 12px',
    backgroundColor: '#F3F4F6',
    border: '1px solid #D1D5DB',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#374151',
    cursor: 'pointer',
    transition: 'all 0.15s',
  }
};
