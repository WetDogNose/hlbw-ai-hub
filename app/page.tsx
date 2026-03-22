import { Activity, Server, Cpu, Layers } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8 relative min-h-screen pb-20">
      <section className="mb-12 relative">
        <div className="absolute inset-0 bg-blue-500/5 blur-[100px] -z-10 rounded-full pointer-events-none"></div>
        <h1 className="text-5xl mb-4 font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[var(--title-gradient-start)] to-[var(--title-gradient-end)]">
          HLBW AI Hub
        </h1>
        <p className="text-xl font-medium tracking-wide text-[var(--text-secondary)]">
          Master Control Plane for Distributed AI Orchestration
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6 relative">
          <div className="absolute top-6 right-6 p-2 rounded-xl text-blue-500 bg-blue-500/10">
            <Cpu size={24} />
          </div>
          <div className="text-4xl font-bold mt-4 mb-2">14</div>
          <div className="text-sm font-medium text-[var(--text-secondary)]">
            Active Nodes
          </div>
        </div>

        <div className="card p-6 relative">
          <div className="absolute top-6 right-6 p-2 rounded-xl text-purple-500 bg-purple-500/10">
            <Server size={24} />
          </div>
          <div className="text-4xl font-bold mt-4 mb-2">8</div>
          <div className="text-sm font-medium text-[var(--text-secondary)]">
            Connected MCPs
          </div>
        </div>

        <div className="card p-6 relative">
          <div className="absolute top-6 right-6 p-2 rounded-xl text-emerald-500 bg-emerald-500/10">
            <Layers size={24} />
          </div>
          <div className="text-4xl font-bold mt-4 mb-2">1,204</div>
          <div className="text-sm font-medium text-[var(--text-secondary)]">
            Swarms Dispatched
          </div>
        </div>

        <div className="card p-6 relative">
          <div className="absolute top-6 right-6 p-2 rounded-xl text-amber-500 bg-amber-500/10">
            <Activity size={24} />
          </div>
          <div className="text-4xl font-bold mt-4 mb-2 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>{" "}
            99.9%
          </div>
          <div className="text-sm font-medium text-[var(--text-secondary)]">
            System Health
          </div>
        </div>
      </div>

      <div className="mt-12">
        <Link
          href="/admin/stats"
          className="btn btn-primary shadow-lg shadow-blue-500/20 px-8 py-4 text-lg"
        >
          Open Admin Control Plane
        </Link>
      </div>
    </main>
  );
}
