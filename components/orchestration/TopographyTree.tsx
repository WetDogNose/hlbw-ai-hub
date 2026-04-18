import React from 'react';
import { Activity, Shield, Users, Server } from 'lucide-react';

export default function TopographyTree() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
      <h2 className="text-xl font-bold text-sky-400 mb-4 flex items-center gap-2">
        <Server size={20} /> Agent Topography
      </h2>
      <div className="flex flex-col gap-4 text-slate-300">
        <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
          <Shield className="text-purple-400" />
          <div className="flex-1">
            <div className="font-semibold text-white">CTO Coordinator</div>
            <div className="text-xs text-slate-400">Status: Running</div>
          </div>
        </div>
        <div className="ml-8 border-l-2 border-slate-700 pl-4 flex flex-col gap-4">
          <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
            <Activity className="text-green-400" />
            <div className="flex-1">
              <div className="font-semibold text-white">QA Sentry</div>
              <div className="text-xs text-slate-400">Status: Idle</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
            <Users className="text-blue-400" />
            <div className="flex-1">
              <div className="font-semibold text-white">Dev Worker Pool (3)</div>
              <div className="text-xs text-slate-400">Status: 1 Active, 2 Idle</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
