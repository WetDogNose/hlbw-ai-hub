import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

export default function ApprovalWidget() {
  return (
    <div className="bg-amber-950/20 border-2 border-amber-500/50 rounded-xl p-6 mt-6 shadow-2xl">
      <div className="flex items-start gap-4">
        <div className="bg-amber-500/20 p-3 rounded-full text-amber-500">
          <AlertTriangle size={24} />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-amber-400 mb-2">Two-Man Rule Violation Risk</h3>
          <p className="text-slate-300 text-sm mb-4">
            Agent "Dev Worker 1" has requested to merge a PR to main without human confirmation. 
            Do you approve this merge?
          </p>
          <div className="flex gap-4">
            <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors">
              <Check size={18} /> Approve Merge
            </button>
            <button className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors">
              <X size={18} /> Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
