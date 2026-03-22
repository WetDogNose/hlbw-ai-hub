"use client";

import useSWR from "swr";
import { Activity, Database, Server, Users } from "lucide-react";

const fetcher = async (url: string) => {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data?.error || 'An error occurred while fetching the data.');
    }
    return data;
};

export default function StatsClient() {
    const { data: appStats, isValidating: isStatsLoading, error: statsError } = useSWR<any>(
        '/api/admin/stats',
        fetcher,
        {
            revalidateOnFocus: false,
            refreshInterval: 60000
        }
    );

    return (
        <div className="card" style={{ width: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-primary)", flexWrap: "wrap", gap: "1rem" }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", margin: 0, display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Activity size={24} style={{ color: "var(--accent-color)" }} />
                    App Stats
                </h2>
            </div>
            
            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
                {isStatsLoading && !appStats ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>Loading stats...</div>
                ) : statsError ? (
                    <div style={{ color: "var(--danger-color)", padding: "1rem", backgroundColor: "rgba(239, 68, 68, 0.1)", borderRadius: "8px" }}>Error loading stats: {statsError.message}</div>
                ) : appStats ? (
                    <>
                        {/* DB Overview */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                            <div style={{ padding: "1.5rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", marginBottom: "0.5rem", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "bold" }}>
                                    <Database size={16} /> Database Size
                                </div>
                                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                                    {(appStats.database.totalSizeBytes / 1024 / 1024).toFixed(2)} MB
                                </div>
                                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                                    Total Postgres DB Size
                                </div>
                            </div>
                            <div style={{ padding: "1.5rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", marginBottom: "0.5rem", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "bold" }}>
                                    <Users size={16} /> Total Users
                                </div>
                                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                                    {appStats.counts.users}
                                </div>
                                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                                    Accounts: {appStats.counts.accounts}
                                </div>
                            </div>
                            <div style={{ padding: "1.5rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", marginBottom: "0.5rem", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "bold" }}>
                                    <Activity size={16} /> Sessions
                                </div>
                                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                                    {appStats.counts.sessions}
                                </div>
                                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                                    Active Database Sessions
                                </div>
                            </div>
                        </div>

                        {/* System Details */}
                        <div>
                            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1rem", fontWeight: "600", marginBottom: "1rem", color: "var(--text-primary)" }}>
                                <Server size={18} /> System & Deployment Info
                            </h3>
                            <div style={{ overflowX: "auto", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                                    <tbody>
                                        <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                                            <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "600", width: "40%" }}>Git Hash (Version)</th>
                                            <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>{appStats.system.gitHash}</td>
                                        </tr>
                                        <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                                            <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "600" }}>Container Revision</th>
                                            <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>{appStats.system.containerRevision}</td>
                                        </tr>
                                        <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                                            <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "600" }}>Start Time (UTC)</th>
                                            <td style={{ padding: "0.75rem" }}>{new Date(appStats.system.startTime).toLocaleString()}</td>
                                        </tr>
                                        <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                                            <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "600" }}>Uptime</th>
                                            <td style={{ padding: "0.75rem" }}>{Math.floor(appStats.system.uptimeSeconds / 60 / 60)}h {Math.floor((appStats.system.uptimeSeconds / 60) % 60)}m</td>
                                        </tr>
                                        <tr>
                                            <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "600" }}>Node.js Version</th>
                                            <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>{appStats.system.nodeVersion}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* DB Tables */}
                        <div>
                            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1rem", fontWeight: "600", marginBottom: "1rem", color: "var(--text-primary)" }}>
                                <Database size={18} /> Top Tables by Size
                            </h3>
                            <div style={{ overflowX: "auto", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                                    <thead>
                                        <tr style={{ backgroundColor: "var(--bg-tertiary)", borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "0.75rem" }}>
                                            <th style={{ padding: "0.75rem", fontWeight: "600" }}>Table Name</th>
                                            <th style={{ padding: "0.75rem", fontWeight: "600", textAlign: "right" }}>Size</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {appStats.database.tableSizes.slice(0, 10).map((t: any) => (
                                            <tr key={t.tableName} style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: "transparent" }} >
                                                <td style={{ padding: "0.75rem", color: "var(--text-primary)", fontFamily: "monospace" }}>{t.tableName}</td>
                                                <td style={{ padding: "0.75rem", textAlign: "right", color: "var(--text-secondary)" }}>{(t.sizeBytes / 1024).toFixed(2)} KB</td>
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