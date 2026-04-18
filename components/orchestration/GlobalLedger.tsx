import React from 'react';
import { Coins, TrendingUp } from 'lucide-react';

export default function GlobalLedger() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
      <h2 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
        <Coins size={20} /> Compute Ledger
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">Total Token Burn</div>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            2.4M <TrendingUp size={16} className="text-red-400" />
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">Est. Cost</div>
          <div className="text-2xl font-bold text-white">$24.00</div>
        </div>
      </div>
    </div>
  );
}
