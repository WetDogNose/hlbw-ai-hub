import React from 'react';
import ChronologyTimeline from '@/components/thread/ChronologyTimeline';
import LiveExecutionBlock from '@/components/thread/LiveExecutionBlock';
import ApprovalWidget from '@/components/thread/ApprovalWidget';

export default function ThreadPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <div className="mb-8 border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-extrabold text-white mb-2">Thread: Demo-123</h1>
        <p className="text-slate-400">Tracking execution logs and approvals for webhook trigger.</p>
      </div>
      <ChronologyTimeline />
      <LiveExecutionBlock />
      <ApprovalWidget />
    </div>
  );
}
