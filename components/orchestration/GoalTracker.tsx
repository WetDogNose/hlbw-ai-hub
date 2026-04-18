import React from 'react';
import { Target, ArrowRight } from 'lucide-react';

export default function GoalTracker() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
      <h2 className="text-xl font-bold text-indigo-400 mb-4 flex items-center gap-2">
        <Target size={20} /> Macro Goals
      </h2>
      <ul className="space-y-3">
        <li className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-center group cursor-pointer hover:border-indigo-500 transition-colors">
          <div>
            <div className="font-semibold text-white">Migrate Auth to NextAuth v5</div>
            <div className="text-xs text-slate-400">3 blocking issues</div>
          </div>
          <ArrowRight className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </li>
      </ul>
    </div>
  );
}
