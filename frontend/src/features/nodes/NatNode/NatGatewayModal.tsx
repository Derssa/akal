import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Globe, BookOpen, ListOrdered, ShieldAlert, Cpu } from 'lucide-react';

interface NatGatewayModalProps {
  nodeName: string;
  ipAddress?: string;
  state: string;
  onClose: () => void;
}

export default function NatGatewayModal({
  nodeName,
  ipAddress,
  state,
  onClose
}: NatGatewayModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'details' | 'explain' | 'guide' | 'cheatsheet'>('details');

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <Globe size={18} color="#8B5CF6" />
            <span style={styles.title}>{nodeName}{t('nat.title')}</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection */}
        <div style={styles.tabBar}>
          <button 
            style={activeTab === 'details' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('details')}
          >
            <Cpu size={14} /> {t('nat.tabs.details')}
          </button>
          <button 
            style={activeTab === 'explain' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('explain')}
          >
            <BookOpen size={14} /> {t('nat.tabs.explain')}
          </button>
          <button 
            style={activeTab === 'guide' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('guide')}
          >
            <ListOrdered size={14} /> {t('nat.tabs.guide')}
          </button>
          <button 
            style={activeTab === 'cheatsheet' ? styles.tabActive : styles.tab} 
            onClick={() => setActiveTab('cheatsheet')}
          >
            <ShieldAlert size={14} /> {t('nat.tabs.cheatsheet')}
          </button>
        </div>

        <div style={styles.body}>
          {/* Tab 1: Live Details */}
          {activeTab === 'details' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>{t('nat.details.title')}</h4>
              <div style={styles.grid}>
                <div style={styles.gridItem}>
                  <span style={styles.label}>{t('nat.details.resourceName')}</span>
                  <span style={styles.value}>{nodeName}</span>
                </div>
                <div style={styles.gridItem}>
                  <span style={styles.label}>{t('nat.details.typeLabel')}</span>
                  <span style={styles.value}>{t('nat.details.typeValue')}</span>
                </div>
                <div style={styles.gridItem}>
                  <span style={styles.label}>{t('nat.details.statusLabel')}</span>
                  <span style={{ 
                    ...styles.value, 
                    color: state === 'running' ? '#10B981' : '#EF4444',
                    fontWeight: 'bold' 
                  }}>
                    {state === 'running' ? t('nat.details.active') : t('nat.details.offline')}
                  </span>
                </div>
                <div style={styles.gridItem}>
                  <span style={styles.label}>{t('nat.details.ipLabel')}</span>
                  <span style={{ ...styles.value, fontWeight: 'bold' }}>{ipAddress || t('nat.details.pendingIp')}</span>
                </div>
              </div>
              <div style={styles.infoBox}>
                <p style={styles.infoText}>
                  ℹ️ <strong>{t('nat.details.infoCloud').split(':')[0]}:</strong> {t('nat.details.infoCloud').split(':').slice(1).join(':')}
                </p>
                <p style={{ ...styles.infoText, marginTop: '8px' }}>
                  🚫 <strong>{t('nat.details.infoPing').split(':')[0]}:</strong> {t('nat.details.infoPing').split(':').slice(1).join(':')}
                </p>
              </div>
            </div>
          )}

          {/* Tab 2: What is NAT */}
          {activeTab === 'explain' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>{t('nat.explain.title')}</h4>
              <p style={styles.para}>
                {t('nat.explain.para').split('NAT (Network Address Translation) Gateway')[0]}<strong>NAT (Network Address Translation) Gateway</strong>{t('nat.explain.para').split('NAT (Network Address Translation) Gateway')[1]}
              </p>
              <h5 style={styles.subSectionTitle}>{t('nat.explain.keyTitle')}</h5>
              <ul style={styles.list}>
                <li><strong>{t('nat.explain.li1').split(':')[0]}:</strong> {t('nat.explain.li1').split(':').slice(1).join(':')}</li>
                <li><strong>{t('nat.explain.li2').split(':')[0]}:</strong> {t('nat.explain.li2').split(':').slice(1).join(':')}</li>
                <li><strong>{t('nat.explain.li3').split(':')[0]}:</strong> {t('nat.explain.li3').split(':').slice(1).join(':')}</li>
              </ul>
            </div>
          )}

          {/* Tab 3: Step-by-Step Setup Guide */}
          {activeTab === 'guide' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>{t('nat.guide.title')}</h4>
              <div style={styles.steps}>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>1</div>
                  <div style={styles.stepText}>
                    <strong>{t('nat.guide.step1Title')}</strong> {t('nat.guide.step1Desc')}
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>2</div>
                  <div style={styles.stepText}>
                    <strong>{t('nat.guide.step2Title')}</strong> {t('nat.guide.step2Desc')}
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>3</div>
                  <div style={styles.stepText}>
                    <strong>{t('nat.guide.step3Title')}</strong> {t('nat.guide.step3Desc')} <code>{nodeName}</code>.
                  </div>
                </div>
                <div style={styles.step}>
                  <div style={styles.stepNumber}>4</div>
                  <div style={styles.stepText}>
                    <strong>{t('nat.guide.step4Title')}</strong> {t('nat.guide.step4Desc')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Cheat Sheet */}
          {activeTab === 'cheatsheet' && (
            <div style={styles.content}>
              <h4 style={styles.sectionTitle}>{t('nat.cheatsheet.title')}</h4>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}>
                    <th style={styles.th}>{t('nat.cheatsheet.th1')}</th>
                    <th style={styles.th}>{t('nat.cheatsheet.th2')}</th>
                    <th style={styles.th}>{t('nat.cheatsheet.th3')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={styles.tr}>
                    <td style={styles.tdCode}>{t('nat.cheatsheet.row1Col1')}</td>
                    <td style={styles.td}>{t('nat.cheatsheet.row1Col2')}</td>
                    <td style={styles.td}>{t('nat.cheatsheet.row1Col3')}</td>
                  </tr>
                  <tr style={styles.tr}>
                    <td style={styles.tdCode}>{t('nat.cheatsheet.row2Col1')}</td>
                    <td style={styles.td}>{t('nat.cheatsheet.row2Col2')}</td>
                    <td style={styles.td}>{t('nat.cheatsheet.row2Col3')}</td>
                  </tr>
                  <tr style={styles.tr}>
                    <td style={styles.tdCode}>{t('nat.cheatsheet.row3Col1')}</td>
                    <td style={styles.td}>{t('nat.cheatsheet.row3Col2')}</td>
                    <td style={styles.td}>{t('nat.cheatsheet.row3Col3')}</td>
                  </tr>
                </tbody>
              </table>
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
    width: '650px',
    maxWidth: '100%',
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
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-solid)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
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
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-main)',
  },
  tab: {
    flex: 1,
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  tabActive: {
    flex: 1,
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #8B5CF6',
    color: '#8B5CF6',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  body: {
    backgroundColor: '#FFFFFF',
    padding: '20px',
    maxHeight: '450px',
    overflowY: 'auto',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    margin: '0 0 4px 0',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  subSectionTitle: {
    margin: '10px 0 4px 0',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    backgroundColor: '#F9FAFB',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
  },
  gridItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: '13px',
    color: 'var(--color-text-primary)',
  },
  infoBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    border: '1px solid rgba(139, 92, 246, 0.15)',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '8px',
  },
  infoText: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
  },
  para: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
  },
  list: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  step: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#8B5CF6',
    color: '#FFF',
    fontSize: '12px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '2px',
  },
  stepText: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  thRow: {
    backgroundColor: 'var(--bg-main)',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border-color)',
  },
  tr: {
    borderBottom: '1px solid var(--border-color)',
  },
  tdCode: {
    padding: '10px 12px',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-primary)',
  },
  td: {
    padding: '10px 12px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  }
};
