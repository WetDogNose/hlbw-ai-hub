"use client";

import useSWR from "swr";
import { Activity, Database, Server, Users } from "lucide-react";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data?.error || "An error occurred while fetching the data.",
    );
  }
  return data;
};

export default function StatsClient() {
  const {
    data: appStats,
    isValidating: isStatsLoading,
    error: statsError,
  } = useSWR<any>("/api/admin/stats", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 60000,
  });

  return (
    <div className="flex flex-col w-full gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-slate-700/50">
        <h2 className="text-xl font-bold m-0 flex items-center gap-3 text-slate-100">
          <Activity className="w-6 h-6 text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
          App Stats
        </h2>
      </div>

      <div className="flex flex-col gap-8">
        {isStatsLoading && !appStats ? (
          <div className="flex justify-center p-12 text-slate-400 animate-pulse">
            Loading stats...
          </div>
        ) : statsError ? (
          <div className="text-red-400 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            Error loading stats: {statsError.message}
          </div>
        ) : appStats ? (
          <>
            {/* DB Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-6 bg-slate-800/40 backdrop-blur-md rounded-xl border border-slate-700/50 hover:border-blue-500/30 transition-colors shadow-lg group">
                <div className="flex items-center gap-2 text-slate-400 mb-2 text-sm uppercase tracking-wider font-bold group-hover:text-blue-400 transition-colors">
                  <Database size={16} /> Database Size
                </div>
                <div className="text-3xl font-bold tracking-tight text-slate-100">
                  {(appStats.database.totalSizeBytes / 1024 / 1024).toFixed(2)}{" "}
                  <span className="text-lg text-slate-500 font-medium">MB</span>
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  Total Postgres DB Size
                </div>
              </div>
              <div className="p-6 bg-slate-800/40 backdrop-blur-md rounded-xl border border-slate-700/50 hover:border-purple-500/30 transition-colors shadow-lg group">
                <div className="flex items-center gap-2 text-slate-400 mb-2 text-sm uppercase tracking-wider font-bold group-hover:text-purple-400 transition-colors">
                  <Users size={16} /> Total Users
                </div>
                <div className="text-3xl font-bold tracking-tight text-slate-100">
                  {appStats.counts.users}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  Accounts: {appStats.counts.accounts}
                </div>
              </div>
              <div className="p-6 bg-slate-800/40 backdrop-blur-md rounded-xl border border-slate-700/50 hover:border-emerald-500/30 transition-colors shadow-lg group">
                <div className="flex items-center gap-2 text-slate-400 mb-2 text-sm uppercase tracking-wider font-bold group-hover:text-emerald-400 transition-colors">
                  <Activity size={16} /> Sessions
                </div>
                <div className="text-3xl font-bold tracking-tight text-slate-100">
                  {appStats.counts.sessions}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  Active Database Sessions
                </div>
              </div>
            </div>

            {/* System Details */}
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold mb-4 text-slate-200">
                <Server size={18} className="text-indigo-400" /> System &
                Deployment Info
              </h3>
              <div className="overflow-x-auto border border-slate-700/50 rounded-xl bg-slate-800/20 shadow-inner">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-700/50">
                    <tr className="hover:bg-slate-800/40 transition-colors">
                      <th className="p-4 text-slate-400 font-medium w-2/5">
                        Git Hash (Version)
                      </th>
                      <td className="p-4 font-mono text-slate-300">
                        {appStats.system.gitHash}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-800/40 transition-colors">
                      <th className="p-4 text-slate-400 font-medium">
                        Container Revision
                      </th>
                      <td className="p-4 font-mono text-slate-300">
                        {appStats.system.containerRevision}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-800/40 transition-colors">
                      <th className="p-4 text-slate-400 font-medium">
                        Start Time (UTC)
                      </th>
                      <td className="p-4 text-slate-300">
                        {new Date(appStats.system.startTime).toLocaleString()}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-800/40 transition-colors">
                      <th className="p-4 text-slate-400 font-medium">Uptime</th>
                      <td className="p-4 text-slate-300">
                        <span className="font-semibold text-slate-200">
                          {Math.floor(appStats.system.uptimeSeconds / 60 / 60)}
                        </span>
                        h{" "}
                        <span className="font-semibold text-slate-200">
                          {Math.floor(
                            (appStats.system.uptimeSeconds / 60) % 60,
                          )}
                        </span>
                        m
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-800/40 transition-colors">
                      <th className="p-4 text-slate-400 font-medium">
                        Node.js Version
                      </th>
                      <td className="p-4 font-mono text-slate-300">
                        {appStats.system.nodeVersion}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* DB Tables */}
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold mb-4 text-slate-200">
                <Database size={18} className="text-amber-400" /> Top Tables by
                Size
              </h3>
              <div className="overflow-x-auto border border-slate-700/50 rounded-xl bg-slate-800/20 shadow-inner">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-800/60 border-b border-slate-700/50 text-slate-400 uppercase text-xs tracking-wider">
                      <th className="p-4 font-semibold">Table Name</th>
                      <th className="p-4 font-semibold text-right">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {appStats.database.tableSizes.slice(0, 10).map((t: any) => (
                      <tr
                        key={t.tableName}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="p-4 text-slate-300 font-mono">
                          {t.tableName}
                        </td>
                        <td className="p-4 text-right text-slate-400 font-medium">
                          {(t.sizeBytes / 1024).toFixed(2)} KB
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
