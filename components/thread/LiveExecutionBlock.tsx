"use client";
import React, { useEffect, useState } from 'react';
import { Terminal } from 'lucide-react';

export default function LiveExecutionBlock() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const sse = new EventSource('/api/orchestrator/stream');
    sse.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setLogs((prev) => [...prev, data.output]);
    };
    return () => sse.close();
  }, []);

  return (
    <div className="bg-black border border-slate-700 rounded-xl overflow-hidden mt-6 shadow-2xl">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex items-center gap-2">
        <Terminal size={16} className="text-emerald-400" />
        <span className="text-sm font-bold text-slate-300">Live Execution (QA Sentry)</span>
      </div>
      <div className="p-4 font-mono text-sm text-emerald-500 h-48 overflow-y-auto">
        {logs.map((L, i) => <div key={i}><span className="text-slate-500 mr-2">{'>'}</span>{L}</div>)}
        <div className="animate-pulse">_</div>
      </div>
    </div>
  );
}
