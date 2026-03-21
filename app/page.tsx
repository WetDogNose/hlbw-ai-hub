import { Activity, Server, Cpu, Layers } from 'lucide-react';

export default function Home() {
  return (
    <main className="container container-padded">
      <section className="hero-section">
        <h1 className="header-title" style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>HLBW AI Hub</h1>
        <p className="hero-subtitle">Master Control Plane for Distributed AI Orchestration</p>
      </section>

      <div className="card-grid" style={{ gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div className="glass-panel stat-card">
          <div className="stat-icon-wrapper" style={{ color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' }}>
            <Cpu size={24} />
          </div>
          <div className="stat-value">14</div>
          <div className="stat-label">Active Nodes</div>
        </div>

        <div className="glass-panel stat-card">
          <div className="stat-icon-wrapper" style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.1)' }}>
            <Server size={24} />
          </div>
          <div className="stat-value">8</div>
          <div className="stat-label">Connected MCPs</div>
        </div>

        <div className="glass-panel stat-card">
          <div className="stat-icon-wrapper" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}>
            <Layers size={24} />
          </div>
          <div className="stat-value">1,204</div>
          <div className="stat-label">Swarms Dispatched</div>
        </div>

        <div className="glass-panel stat-card">
          <div className="stat-icon-wrapper" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' }}>
            <Activity size={24} />
          </div>
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center' }}>
            <span className="pulse-indicator"></span> 99.9%
          </div>
          <div className="stat-label">System Health</div>
        </div>
      </div>
    </main>
  );
}
