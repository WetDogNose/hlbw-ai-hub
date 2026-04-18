import React from 'react';
import { GitCommit, Bot, User } from 'lucide-react';

export default function ChronologyTimeline() {
  return (
    <div className="relative border-l border-slate-700 ml-4 pl-6 space-y-8 mt-6">
      <div className="relative">
        <div className="absolute -left-[35px] bg-slate-800 p-1 rounded-full border border-slate-600">
          <User size={16} className="text-slate-300" />
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm text-slate-200">
          <div className="text-xs text-slate-400 mb-2">Jason • 10:45 AM</div>
          <div>Please investigate the excessive token burn on the QA phase.</div>
        </div>
      </div>
      <div className="relative">
        <div className="absolute -left-[35px] bg-indigo-900/50 p-1 rounded-full border border-indigo-500">
          <Bot size={16} className="text-indigo-400" />
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-indigo-500/30 shadow-sm text-slate-200">
          <div className="text-xs text-indigo-400 mb-2">CTO Coordinator • 10:46 AM</div>
          <div>I have dispatched the QA Sentry to profile the prompt headers.</div>
        </div>
      </div>
    </div>
  );
}
