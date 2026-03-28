"use client";

import { useState, useEffect } from "react";
import {
  Mail,
  Database,
  Cloud,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

type HealthStatus = "loading" | "ok" | "error" | "idle";

interface ServiceHealth {
  status: HealthStatus;
  message?: string;
}

export default function ConfigurationClient({
  initialConfig,
}: {
  initialConfig: any;
}) {
  const [healthStatuses, setHealthStatuses] = useState<
    Record<string, ServiceHealth>
  >({
    email: { status: "idle" },
    database: { status: "idle" },
    storage: { status: "idle" },
    ai: { status: "idle" },
    oauth: { status: "idle" },
  });

  // Run health checks on mount
  useEffect(() => {
    runAllChecks();
  }, []);

  const checkService = async (service: string) => {
    if (service === "oauth") {
      // OAuth doesn't have an active ping, just checking if keys are present
      const oauthConfig = initialConfig.oauth;
      const ok =
        oauthConfig.google ||
        oauthConfig.github ||
        oauthConfig.azure ||
        oauthConfig.apple;
      setHealthStatuses((prev) => ({
        ...prev,
        [service]: {
          status: ok ? "ok" : "error",
          message: ok
            ? "OAuth Providers configured"
            : "No OAuth providers configured",
        },
      }));
      return;
    }

    setHealthStatuses((prev) => ({
      ...prev,
      [service]: { status: "loading" },
    }));
    try {
      const res = await fetch(`/api/admin/health?service=${service}`);
      const data = await res.json();

      if (res.ok && data.status === "ok") {
        setHealthStatuses((prev) => ({
          ...prev,
          [service]: { status: "ok", message: data.message },
        }));
      } else {
        setHealthStatuses((prev) => ({
          ...prev,
          [service]: {
            status: "error",
            message: data.message || data.error || "Healthcheck failed",
          },
        }));
      }
    } catch (error: any) {
      setHealthStatuses((prev) => ({
        ...prev,
        [service]: {
          status: "error",
          message: error.message || "Network error",
        },
      }));
    }
  };

  const runAllChecks = () => {
    const services = ["email", "database", "storage", "ai", "oauth"];
    services.forEach((service) => checkService(service));
  };

  const StatusBadge = ({ service }: { service: string }) => {
    const health = healthStatuses[service];

    if (health?.status === "loading") {
      return (
        <div className="badge badge-loading">
          <Loader2 size={14} className="animate-spin" />
          Checking...
        </div>
      );
    }

    if (health?.status === "ok") {
      return (
        <div
          title={health.message}
          className="badge badge-ok txt-success txt-bold flex flex-align-center flex-gap-xs"
        >
          <CheckCircle2 size={16} />
          Connected
        </div>
      );
    }

    if (health?.status === "error") {
      return (
        <div
          title={health.message}
          className="badge badge-error txt-danger txt-bold flex flex-align-center flex-gap-xs"
        >
          <XCircle size={16} className="badge-icon-shrink" />
          <span className="badge-text-truncate">
            {health.message || "Error"}
          </span>
        </div>
      );
    }

    return <div className="badge badge-pending">Pending</div>;
  };

  return (
    <div className="mb-8">
      <div className="page-header">
        <div>
          <h2 className="header-title m-0 mb-2">Configuration</h2>
          <p className="txt-secondary m-0">
            Manage and monitor system integrations and environment variables.
          </p>
        </div>
        <button
          onClick={runAllChecks}
          className="btn btn-outline flex flex-align-center flex-gap-2"
        >
          <RefreshCw size={18} />
          Test All Integrated Services
        </button>
      </div>

      <div className="card-grid">
        {/* Email Service */}
        <div className="card flex flex-column">
          <div className="card-body flex flex-column flex-gap-6 flex-grow-1">
            <div className="flex flex-justify-between flex-align-start">
              <div className="flex flex-align-center flex-gap-4">
                <div className="bg-info-subtle p-3 radius-md">
                  <Mail size={24} className="txt-info" />
                </div>
                <div>
                  <h3 className="m-0 font-lg txt-bold">Email Provider</h3>
                  <div className="txt-secondary font-sm">
                    SMTP Notification Service
                  </div>
                </div>
              </div>
              <StatusBadge service="email" />
            </div>

            <div className="bg-tertiary radius-md p-4 font-mono font-sm flex-grow-1">
              <div className="flex flex-justify-between border-b border-color pb-2 mb-2">
                <span className="txt-muted">SMTP_HOST</span>
                <span className="txt-primary word-break-all ml-4">
                  {initialConfig.email.host}
                </span>
              </div>
              <div className="flex flex-justify-between border-b border-color pb-2 mb-2">
                <span className="txt-muted">SMTP_USER</span>
                <span className="txt-primary word-break-all ml-4">
                  {initialConfig.email.user}
                </span>
              </div>
              <div className="flex flex-justify-between">
                <span className="txt-muted">ADMIN_EMAIL</span>
                <span className="txt-primary word-break-all ml-4">
                  {initialConfig.email.admin}
                </span>
              </div>
            </div>
          </div>
          <div className="card-footer border-t-none bg-transparent pt-0">
            <button
              onClick={() => checkService("email")}
              className="btn btn-outline w-full flex-justify-center"
            >
              Test Connection
            </button>
          </div>
        </div>

        {/* Database */}
        <div className="card flex flex-column">
          <div className="card-body flex flex-column flex-gap-6 flex-grow-1">
            <div className="flex flex-justify-between flex-align-start">
              <div className="flex flex-align-center flex-gap-4">
                <div className="bg-success-subtle p-3 radius-md">
                  <Database size={24} className="txt-success" />
                </div>
                <div>
                  <h3 className="m-0 font-lg txt-bold">Database</h3>
                  <div className="txt-secondary font-sm">
                    PostgreSQL via Prisma
                  </div>
                </div>
              </div>
              <StatusBadge service="database" />
            </div>

            <div className="bg-tertiary radius-md p-4 font-mono font-sm flex-grow-1">
              <div className="flex flex-column">
                <span className="txt-muted mb-2">DATABASE_URL</span>
                <span className="txt-primary word-break-all">
                  {initialConfig.database.url}
                </span>
              </div>
            </div>
          </div>
          <div className="card-footer border-t-none bg-transparent pt-0">
            <button
              onClick={() => checkService("database")}
              className="btn btn-outline w-full flex-justify-center"
            >
              Test Connection
            </button>
          </div>
        </div>

        {/* Storage */}
        <div className="card flex flex-column">
          <div className="card-body flex flex-column flex-gap-6 flex-grow-1">
            <div className="flex flex-justify-between flex-align-start">
              <div className="flex flex-align-center flex-gap-4">
                <div className="bg-accent-subtle p-3 radius-md">
                  <Cloud size={24} className="txt-accent" />
                </div>
                <div>
                  <h3 className="m-0 font-lg txt-bold">Cloud Storage</h3>
                  <div className="txt-secondary font-sm">
                    Google Cloud Storage bucket
                  </div>
                </div>
              </div>
              <StatusBadge service="storage" />
            </div>

            <div className="bg-tertiary radius-md p-4 font-mono font-sm flex-grow-1">
              <div className="flex flex-justify-between border-b border-color pb-2 mb-2">
                <span className="txt-muted">GCS_BUCKET_NAME</span>
                <span className="txt-primary word-break-all ml-4">
                  {initialConfig.storage.bucket}
                </span>
              </div>
            </div>
          </div>
          <div className="card-footer border-t-none bg-transparent pt-0">
            <button
              onClick={() => checkService("storage")}
              className="btn btn-outline w-full flex-justify-center"
            >
              Test Connection
            </button>
          </div>
        </div>

        {/* Gemini AI */}
        <div className="card flex flex-column">
          <div className="card-body flex flex-column flex-gap-6 flex-grow-1">
            <div className="flex flex-justify-between flex-align-start">
              <div className="flex flex-align-center flex-gap-4">
                <div className="bg-purple-subtle p-3 radius-md">
                  <Sparkles size={24} className="txt-purple" />
                </div>
                <div>
                  <h3 className="m-0 font-lg txt-bold">Vision AI</h3>
                  <div className="txt-secondary font-sm">Gemini 2.5 Flash</div>
                </div>
              </div>
              <StatusBadge service="ai" />
            </div>

            <div className="bg-tertiary radius-md p-4 font-mono font-sm flex-grow-1">
              <div className="flex flex-justify-between border-b border-color pb-2 mb-2">
                <span className="txt-muted">GEMINI_API_KEY</span>
                <span className="txt-primary word-break-all ml-4">
                  {initialConfig.ai.geminiKey}
                </span>
              </div>
            </div>
          </div>
          <div className="card-footer border-t-none bg-transparent pt-0">
            <button
              onClick={() => checkService("ai")}
              className="btn btn-outline w-full flex-justify-center"
            >
              Test Connection
            </button>
          </div>
        </div>

        {/* OAuth */}
        <div className="card flex flex-column">
          <div className="card-body flex flex-column flex-gap-6 flex-grow-1">
            <div className="flex flex-justify-between flex-align-start">
              <div className="flex flex-align-center flex-gap-4">
                <div className="bg-warning-subtle p-3 radius-md">
                  <ShieldCheck size={24} className="txt-warning" />
                </div>
                <div>
                  <h3 className="m-0 font-lg txt-bold">Authentication</h3>
                  <div className="txt-secondary font-sm">
                    OAuth Providers Configured
                  </div>
                </div>
              </div>
              <StatusBadge service="oauth" />
            </div>

            <div className="two-col-grid flex-gap-4 flex-grow-1">
              <div className="flex flex-align-center flex-justify-between bg-tertiary radius-md p-3 txt-bold">
                <span className="txt-secondary font-sm txt-normal">Google</span>
                {initialConfig.oauth.google ? (
                  <CheckCircle2 size={16} className="txt-success stroke-3" />
                ) : (
                  <XCircle size={16} className="txt-danger stroke-3" />
                )}
              </div>
              <div className="flex flex-align-center flex-justify-between bg-tertiary radius-md p-3 txt-bold">
                <span className="txt-secondary font-sm txt-normal">Apple</span>
                {initialConfig.oauth.apple ? (
                  <CheckCircle2 size={16} className="txt-success stroke-3" />
                ) : (
                  <XCircle size={16} className="txt-danger stroke-3" />
                )}
              </div>
              <div className="flex flex-align-center flex-justify-between bg-tertiary radius-md p-3 txt-bold">
                <span className="txt-secondary font-sm txt-normal">GitHub</span>
                {initialConfig.oauth.github ? (
                  <CheckCircle2 size={16} className="txt-success stroke-3" />
                ) : (
                  <XCircle size={16} className="txt-danger stroke-3" />
                )}
              </div>
              <div className="flex flex-align-center flex-justify-between bg-tertiary radius-md p-3 txt-bold">
                <span className="txt-secondary font-sm txt-normal">
                  Azure AD
                </span>
                {initialConfig.oauth.azure ? (
                  <CheckCircle2 size={16} className="txt-success stroke-3" />
                ) : (
                  <XCircle size={16} className="txt-danger stroke-3" />
                )}
              </div>
            </div>
          </div>
          <div className="card-footer border-t-none bg-transparent pt-0">
            <button
              onClick={() => checkService("oauth")}
              className="btn btn-outline w-full flex-justify-center"
            >
              Refresh Status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
