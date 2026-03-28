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
    setExpandedLogs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFetchLogs = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsFetchingLogs(true);
    setLogError("");
    setLogs(null);

    try {
      const res = await fetch(
        `/api/admin/logs?hoursAgo=${logWindow}&severity=${logSeverity}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch logs.");
      }

      setLogs(data);
    } catch (err: any) {
      setLogError(
        err.message || "An unexpected error occurred while fetching logs.",
      );
    } finally {
      setIsFetchingLogs(false);
    }
  };

  return (
    <div className="card mb-8">
      <div
        className="card-header"
        style={{ backgroundColor: "var(--bg-accent-subtle)" }}
      >
        <h3
          className="flex items-center gap-2 m-0 font-semibold"
          style={{ color: "var(--accent-color)" }}
        >
          <Server size={20} /> Cloud Run Log Viewer
        </h3>
      </div>

      <div
        className="card-body"
        style={{ borderBottom: "1px solid var(--border-color)" }}
      >
        <p className="text-secondary mb-4">
          View application logs from Google Cloud Run for the generic deployment
          metrics. Select a specific hour block within the{" "}
          <strong>last 6 hours</strong> and a minimum severity level.
        </p>

        <form
          onSubmit={handleFetchLogs}
          className="flex gap-4 items-end flex-wrap"
        >
          <div style={{ flex: "1", minWidth: "250px" }}>
            <label className="form-label mb-2 font-semibold">
              <Clock size={14} className="inline-block mr-1" /> Time Window
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
            <label className="form-label mb-2 font-semibold">
              <AlertTriangle size={14} className="inline-block mr-1" /> Minimum
              Severity
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
          <div
            className="mt-4 p-3 text-sm rounded-md"
            style={{
              backgroundColor: "var(--bg-danger-subtle)",
              color: "var(--danger-color)",
              border: "1px solid var(--danger-color)",
            }}
          >
            {logError}
          </div>
        )}
      </div>

      {logs && (
        <div className="overflow-x-auto w-full">
          {logs.length === 0 ? (
            <div className="p-12 text-center text-secondary">
              No logs found for the selected criteria.
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: "20%" }}>Timestamp</th>
                  <th style={{ width: "10%" }}>Severity</th>
                  <th style={{ width: "70%" }}>Payload</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.insertId}>
                    <td style={{ verticalAlign: "top" }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <span
                        className={`badge ${log.severity === "ERROR" || log.severity === "CRITICAL" || log.severity === "ALERT" ? "badge-danger" : "badge-accent"}`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <div
                        onClick={() => toggleLog(log.insertId)}
                        className="cursor-pointer relative"
                        title={
                          expandedLogs[log.insertId]
                            ? "Click to collapse"
                            : "Click to expand"
                        }
                      >
                        <pre
                          className="m-0 p-3 rounded-md text-xs whitespace-pre-wrap break-all border border-border"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                            maxHeight: expandedLogs[log.insertId]
                              ? "none"
                              : "80px",
                            overflow: "hidden",
                          }}
                        >
                          {log.payload}
                        </pre>
                        {!expandedLogs[log.insertId] && (
                          <div
                            className="absolute bottom-0 left-0 right-0 pointer-events-none rounded-b-md"
                            style={{
                              height: "var(--spacing-8)",
                              background:
                                "linear-gradient(transparent, var(--bg-tertiary))",
                            }}
                          />
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
