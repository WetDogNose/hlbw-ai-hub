"use client";

import React, { useState, useEffect } from 'react';
import { Settings, Cpu, Activity, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

// Orchestration Dashboard Components
import TopographyTree from './orchestration/TopographyTree';
import GlobalLedger from './orchestration/GlobalLedger';
import GoalTracker from './orchestration/GoalTracker';
import IssueInbox from './orchestration/IssueInbox';

export default function ScionDashboard() {
  return (
    <div className="scion-container flex flex-col gap-8 p-8 min-h-[80vh] rounded-2xl border border-white/10 shadow-2xl text-slate-50"
         style={{ background: 'linear-gradient(145deg, #0f172a, #1e293b)' }}>
         
      {/* Dashboard Header */}
      <div className="flex justify-between items-center border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold flex items-center gap-3 m-0" style={{ background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
            <Cpu size={40} className="text-sky-400" />
            Control Plane
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Autonomous AI Engine command center</p>
        </div>
        <div className="flex gap-4">
          <Link href="/settings" className="bg-slate-800/50 hover:bg-slate-700 border border-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 text-slate-300 transition-colors">
            <Settings size={18} /> Settings
          </Link>
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-lg flex items-center gap-2 text-emerald-400">
            <Activity size={18} /> Engine Online
          </div>
          <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg flex items-center gap-2 text-red-400">
            <ShieldAlert size={18} /> Strict Mode Disabled
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <TopographyTree />
        <GlobalLedger />
        <GoalTracker />
        <IssueInbox />
      </div>
    </div>
  );
}
