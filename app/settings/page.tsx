import React from 'react';
import { Settings as SettingsIcon, Shield, Webhook, Activity } from 'lucide-react';

export default function SettingsDashboard() {
  return (
    <div className="max-w-6xl mx-auto py-12 px-6">
      <div className="mb-8 border-b border-slate-800 pb-4 flex items-center gap-3">
        <SettingsIcon className="text-sky-400" size={32} />
        <div>
          <h1 className="text-3xl font-extrabold text-white mb-2">Platform Configuration</h1>
          <p className="text-slate-400">Manage Webhooks, Skills limits, and Budget Interceptions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Webhook className="text-amber-400" /> Webhook Integrations
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-800 p-4 rounded-lg border border-slate-700">
              <div>
                <div className="font-semibold text-white">GitHub PR Listener</div>
                <div className="text-xs text-slate-400">Endpoint: /api/webhooks/ingress</div>
              </div>
              <button className="bg-emerald-600/20 text-emerald-400 px-3 py-1 rounded text-sm border border-emerald-500/50">Active</button>
            </div>
            <button className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg border border-slate-600 transition-colors">
              + Generate New Webhook Sub
            </button>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Shield className="text-purple-400" /> Compliance Boundaries
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-800 p-4 rounded-lg border border-slate-700">
              <div>
                <div className="font-semibold text-white">Two-Man Rule Enforcement</div>
                <div className="text-xs text-slate-400">Require human approval for all merges</div>
              </div>
              <input type="checkbox" defaultChecked className="toggle cursor-pointer" />
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-2xl md:col-span-2">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="text-rose-400" /> Budget Interception
          </h2>
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
             <div className="flex justify-between mb-2">
               <span className="text-white">Daily Hard Cap (Tokens)</span>
               <span className="text-rose-400 font-bold">10,000,000</span>
             </div>
             <input type="range" min="0" max="10000000" defaultValue="5000000" className="w-full cursor-pointer" />
             <div className="text-xs text-slate-400 mt-2">Any agent exceeding their allocation will be immediately paused.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
