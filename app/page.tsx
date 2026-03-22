import { Activity, Server, Cpu, Layers } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="container container-padded relative min-h-screen pb-20">
      <section className="hero-section">
        <div className="ambient-glow"></div>
        <h1 className="header-title text-5xl mb-4 font-bold tracking-tight">
          HLBW AI Hub
        </h1>
        <p className="hero-subtitle text-xl font-medium tracking-wide">
          Master Control Plane for Distributed AI Orchestration
        </p>
      </section>

      <div className="card-grid">
        <div className="glass-panel stat-card">
          <div className="stat-icon-wrapper text-blue-500 bg-blue-500/10">
            <Cpu size={24} />
          </div>
          <div className="stat-value">14</div>
          <div className="stat-label">Active Nodes</div>
        </div>

        <div className="glass-panel stat-card">
          <div className="stat-icon-wrapper text-purple-500 bg-purple-500/10">
            <Server size={24} />
          </div>
          <div className="stat-value">8</div>
          <div className="stat-label">Connected MCPs</div>
        </div>

        <div className="glass-panel stat-card">
          <div className="stat-icon-wrapper text-emerald-500 bg-emerald-500/10">
            <Layers size={24} />
          </div>
          <div className="stat-value">1,204</div>
          <div className="stat-label">Swarms Dispatched</div>
        </div>

        <div className="glass-panel stat-card">
          <div className="stat-icon-wrapper text-amber-500 bg-amber-500/10">
            <Activity size={24} />
          </div>
          <div className="stat-value flex items-center gap-2">
            <span className="pulse-indicator"></span> 99.9%
          </div>
          <div className="stat-label">System Health</div>
        </div>
      </div>

      <div className="fixed bottom-8 right-8 z-50">
        <ThemeToggle />
      </div>
    </main>
  );
}
