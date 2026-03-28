import { Activity, Server, Cpu, Layers } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <section className="hero-section">
        <div className="ambient-glow"></div>
        <h1
          className="page-title text-gradient"
          style={{
            justifyContent: "center",
            fontSize: "3.5rem",
            marginBottom: "var(--spacing-4)",
          }}
        >
          HLBW AI Hub
        </h1>
        <p className="page-description" style={{ fontSize: "1.25rem" }}>
          Master Control Plane for Distributed AI Orchestration
        </p>
      </section>

      <div className="admin-stats-grid">
        <div className="stat-box">
          <div className="stat-box-title">
            <Cpu size={18} style={{ color: "var(--info-color)" }} />
            Active Nodes
          </div>
          <div
            className="stat-box-value"
            style={{ marginTop: "var(--spacing-2)" }}
          >
            14
          </div>
          <div className="stat-box-desc">Online and operational</div>
        </div>

        <div className="stat-box">
          <div className="stat-box-title">
            <Server size={18} style={{ color: "var(--purple-color)" }} />
            Connected MCPs
          </div>
          <div
            className="stat-box-value"
            style={{ marginTop: "var(--spacing-2)" }}
          >
            8
          </div>
          <div className="stat-box-desc">Live server pools</div>
        </div>

        <div className="stat-box">
          <div className="stat-box-title">
            <Layers size={18} style={{ color: "var(--success-color)" }} />
            Swarms Dispatched
          </div>
          <div
            className="stat-box-value"
            style={{ marginTop: "var(--spacing-2)" }}
          >
            1,204
          </div>
          <div className="stat-box-desc">All time total</div>
        </div>

        <div className="stat-box">
          <div className="stat-box-title">
            <Activity size={18} style={{ color: "var(--warning-color)" }} />
            System Health
          </div>
          <div
            className="stat-box-value flex items-center gap-2"
            style={{ marginTop: "var(--spacing-2)" }}
          >
            99.9%
          </div>
          <div className="stat-box-desc border-color">All systems nominal</div>
        </div>
      </div>

      <div className="flex justify-center mt-8">
        <Link
          href="/admin/stats"
          className="btn btn-primary"
          style={{
            padding: "var(--spacing-4) var(--spacing-8)",
            fontSize: "1.1rem",
          }}
        >
          Open Admin Control Plane
        </Link>
      </div>
    </main>
  );
}
