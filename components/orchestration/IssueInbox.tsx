import React from 'react';
import { Inbox, MessageSquare } from 'lucide-react';
import Link from 'next/link';

export default function IssueInbox() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl lg:col-span-2">
      <h2 className="text-xl font-bold text-amber-400 mb-4 flex items-center gap-2">
        <Inbox size={20} /> Thread Inbox
      </h2>
      <div className="space-y-2">
        <Link href="/thread/demo-123" className="block">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 hover:border-amber-500 transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-white flex items-center gap-2">
                <MessageSquare size={16} /> Webhook Issue: Build Failure
              </div>
              <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded">BLOCKED</span>
            </div>
            <div className="text-sm text-slate-400">Waiting on QA Sentry analysis...</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
