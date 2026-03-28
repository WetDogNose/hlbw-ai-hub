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
    <div>
      <div className="page-header">
        <h2 className="page-title">
          <Activity size={24} className="page-title-icon" />
          App Stats
        </h2>
      </div>

      <div className="form-layout">
        {isStatsLoading && !appStats ? (
          <div className="text-center text-muted p-12">Loading stats...</div>
        ) : statsError ? (
          <div className="bg-danger-subtle text-danger p-4 rounded-md">
            Error loading stats: {statsError.message}
          </div>
        ) : appStats ? (
          <>
            {/* DB Overview */}
            <div className="admin-stats-grid">
              <div className="stat-box">
                <div className="stat-box-title">
                  <Database size={16} /> Database Size
                </div>
                <div className="stat-box-value">
                  {(appStats.database.totalSizeBytes / 1024 / 1024).toFixed(2)}{" "}
                  <span className="text-base text-muted">MB</span>
                </div>
                <div className="stat-box-desc">Total Postgres DB Size</div>
              </div>

              <div className="stat-box">
                <div className="stat-box-title">
                  <Users size={16} /> Total Users
                </div>
                <div className="stat-box-value">{appStats.counts.users}</div>
                <div className="stat-box-desc">
                  Accounts: {appStats.counts.accounts}
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-box-title">
                  <Activity size={16} /> Sessions
                </div>
                <div className="stat-box-value">{appStats.counts.sessions}</div>
                <div className="stat-box-desc">Active Database Sessions</div>
              </div>
            </div>

            {/* System Details */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-title">
                  <Server size={18} className="color-purple" /> System &
                  Deployment Info
                </div>
              </div>
              <div className="card-body p-0">
                <div className="table-container border-none rounded-0">
                  <table className="admin-table">
                    <tbody>
                      <tr>
                        <th className="w-40p">Git Hash (Version)</th>
                        <td className="font-mono">{appStats.system.gitHash}</td>
                      </tr>
                      <tr>
                        <th>Container Revision</th>
                        <td className="font-mono">
                          {appStats.system.containerRevision}
                        </td>
                      </tr>
                      <tr>
                        <th>Start Time (UTC)</th>
                        <td>
                          {new Date(appStats.system.startTime).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <th>Uptime</th>
                        <td>
                          <span className="font-semibold">
                            {Math.floor(
                              appStats.system.uptimeSeconds / 60 / 60,
                            )}
                          </span>
                          h{" "}
                          <span className="font-semibold">
                            {Math.floor(
                              (appStats.system.uptimeSeconds / 60) % 60,
                            )}
                          </span>
                          m
                        </td>
                      </tr>
                      <tr>
                        <th>Node.js Version</th>
                        <td className="font-mono">
                          {appStats.system.nodeVersion}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* DB Tables */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-title">
                  <Database size={18} className="color-warning" /> Top Tables by
                  Size
                </div>
              </div>
              <div className="card-body p-0">
                <div className="table-container border-none rounded-0">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Table Name</th>
                        <th className="text-right">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appStats.database.tableSizes
                        .slice(0, 10)
                        .map((t: any) => (
                          <tr key={t.tableName}>
                            <td className="font-mono">{t.tableName}</td>
                            <td className="text-right text-secondary">
                              {(t.sizeBytes / 1024).toFixed(2)} KB
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
