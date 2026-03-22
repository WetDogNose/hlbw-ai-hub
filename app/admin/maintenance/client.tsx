"use client";

import { useState } from "react";
import { Server, Search, Clock, AlertTriangle } from "lucide-react";

type LogEntry = {
    insertId: string;
    timestamp: string;
    severity: string;
    payload: string;
};

export default function MaintenanceClient() {
    // Cloud Run Log Viewer State
    const [logWindow, setLogWindow] = useState<string>("0");
    const [logSeverity, setLogSeverity] = useState<string>("ERROR");
    const [isFetchingLogs, setIsFetchingLogs] = useState(false);
    const [logs, setLogs] = useState<LogEntry[] | null>(null);
    const [logError, setLogError] = useState("");
    const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

    const toggleLog = (id: string) => {
        setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleFetchLogs = async (e: React.FormEvent) => {
        e.preventDefault();

        setIsFetchingLogs(true);
        setLogError("");
        setLogs(null);

        try {
            const res = await fetch(`/api/admin/logs?hoursAgo=${logWindow}&severity=${logSeverity}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch logs.");
            }

            setLogs(data);
        } catch (err: any) {
            setLogError(err.message || "An unexpected error occurred while fetching logs.");
        } finally {
            setIsFetchingLogs(false);
        }
    };

    return (
        <div className="card" style={{ overflow: "hidden", marginBottom: "var(--spacing-8)" }}>
            <div className="flex justify-between items-center" style={{ padding: "var(--spacing-6)", borderBottom: "var(--border-width-1) solid var(--border-color)", backgroundColor: "var(--primary-color-bg-subtle)" }}>
                <h3 className="flex items-center gap-3" style={{ margin: 0, fontWeight: "var(--font-weight-semibold)", color: "var(--primary-color)" }}>
                    <Server size={20} /> Cloud Run Log Viewer
                </h3>
            </div>
            
            <div style={{ padding: "var(--spacing-6)", borderBottom: "var(--border-width-1) solid var(--border-color)" }}>
                <p style={{ color: "var(--text-secondary)", marginBottom: "var(--spacing-4)" }}>
                    View application logs from Google Cloud Run for the generic deployment metrics. Select a specific hour block within the <strong>last 6 hours</strong> and a minimum severity level.
                </p>
                
                <form onSubmit={handleFetchLogs} className="flex gap-4 items-end" style={{ flexWrap: "wrap" }}>
                    <div style={{ flex: "1", minWidth: "250px" }}>
                        <label className="form-label" style={{ fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "var(--spacing-2)" }}>
                            <Clock size={14} style={{ display: "inline-block", marginBottom: "var(--spacing-negative-0_5)", marginRight: "var(--spacing-1)" }}/> Time Window
                        </label>
                        <select
                            className="form-input"
                            value={logWindow}
                            onChange={(e) => setLogWindow(e.target.value)}
                            required
                        >
                            <option value="0">0-1 Hours Ago</option>
                            <option value="1">1-2 Hours Ago</option>
                            <option value="2">2-3 Hours Ago</option>
                            <option value="3">3-4 Hours Ago</option>
                            <option value="4">4-5 Hours Ago</option>
                            <option value="5">5-6 Hours Ago</option>
                        </select>
                    </div>
                    <div style={{ flex: "1", minWidth: "200px" }}>
                        <label className="form-label" style={{ fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "var(--spacing-2)" }}>
                            <AlertTriangle size={14} style={{ display: "inline-block", marginBottom: "var(--spacing-negative-0_5)", marginRight: "var(--spacing-1)" }}/> Minimum Severity
                        </label>
                        <select
                            className="form-input"
                            value={logSeverity}
                            onChange={(e) => setLogSeverity(e.target.value)}
                            required
                        >
                            <option value="INFO">INFO and above</option>
                            <option value="ERROR">ERROR and above</option>
                            <option value="CRITICAL">CRITICAL and above</option>
                        </select>
                    </div>
                    <button 
                        type="submit" 
                        className="btn btn-primary flex items-center gap-2" 
                        disabled={isFetchingLogs}
                    >
                        <Search size={16} />
                        {isFetchingLogs ? "Retrieving..." : "Retrieve Logs"}
                    </button>
                </form>
                
                {logError && (
                    <div style={{ marginTop: "var(--spacing-4)", padding: "var(--spacing-3)", backgroundColor: "var(--danger-color-bg-subtle)", color: "var(--danger-color)", borderRadius: "var(--border-radius-md)", fontSize: "var(--font-size-sm)", border: "var(--border-width-1) solid var(--danger-color-border-subtle)" }}>
                        {logError}
                    </div>
                )}
            </div>

            {logs && (
                <div style={{ overflowX: "auto" }}>
                    {logs.length === 0 ? (
                        <div style={{ padding: "var(--spacing-12)", textAlign: "center", color: "var(--text-secondary)" }}>
                            No logs found for the selected criteria.
                        </div>
                    ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                            <thead>
                                <tr style={{ backgroundColor: "var(--bg-tertiary)", borderBottom: "var(--border-width-1) solid var(--border-color)", color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wide)" }}>
                                    <th style={{ padding: "var(--spacing-4) var(--spacing-6)", fontWeight: "var(--font-weight-semibold)", width: "20%" }}>Timestamp</th>
                                    <th style={{ padding: "var(--spacing-4) var(--spacing-6)", fontWeight: "var(--font-weight-semibold)", width: "10%" }}>Severity</th>
                                    <th style={{ padding: "var(--spacing-4) var(--spacing-6)", fontWeight: "var(--font-weight-semibold)", width: "70%" }}>Payload</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.insertId} style={{ borderBottom: "var(--border-width-1) solid var(--border-color)" }}>
                                        <td style={{ padding: "var(--spacing-4) var(--spacing-6)", color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", verticalAlign: "top" }}>
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td style={{ padding: "var(--spacing-4) var(--spacing-6)", verticalAlign: "top" }}>
                                            <span style={{ 
                                                backgroundColor: log.severity === 'ERROR' || log.severity === 'CRITICAL' || log.severity === 'ALERT' ? "var(--danger-color-bg-strong)" : "var(--accent-color-bg-strong)", 
                                                color: log.severity === 'ERROR' || log.severity === 'CRITICAL' || log.severity === 'ALERT' ? "var(--danger-color)" : "var(--accent-color)", 
                                                padding: "var(--spacing-1) var(--spacing-2)", 
                                                borderRadius: "var(--border-radius-sm)", 
                                                fontSize: "var(--font-size-xs)", 
                                                fontWeight: "var(--font-weight-bold)" 
                                            }}>
                                                {log.severity}
                                            </span>
                                        </td>
                                        <td style={{ padding: "var(--spacing-4) var(--spacing-6)", verticalAlign: "top" }}>
                                            <div 
                                                onClick={() => toggleLog(log.insertId)}
                                                style={{ cursor: "pointer", position: "relative" }}
                                                title={expandedLogs[log.insertId] ? "Click to collapse" : "Click to expand"}
                                            >
                                                <pre style={{ 
                                                    margin: 0, 
                                                    backgroundColor: "var(--bg-tertiary)", 
                                                    padding: "var(--spacing-3)", 
                                                    borderRadius: "var(--border-radius-md)", 
                                                    fontSize: "var(--font-size-xs)", 
                                                    whiteSpace: "pre-wrap", 
                                                    wordBreak: "break-all",
                                                    color: "var(--text-primary)",
                                                    border: "var(--border-width-1) solid var(--border-color)",
                                                    maxHeight: expandedLogs[log.insertId] ? "none" : "80px",
                                                    overflow: "hidden"
                                                }}>
                                                    {log.payload}
                                                </pre>
                                                {!expandedLogs[log.insertId] && (
                                                    <div style={{
                                                        position: "absolute",
                                                        bottom: 0,
                                                        left: 0,
                                                        right: 0,
                                                        height: "var(--spacing-8)",
                                                        background: "linear-gradient(transparent, var(--bg-tertiary))",
                                                        pointerEvents: "none",
                                                        borderRadius: "0 0 var(--border-radius-md) var(--border-radius-md)"
                                                    }} />
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}