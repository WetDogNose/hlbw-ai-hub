"use client";

import { useState, useEffect } from "react";
import { 
    Mail, 
    Database, 
    Cloud, 
    Sparkles, 
    CreditCard, 
    ShieldCheck, 
    RefreshCw, 
    CheckCircle2, 
    XCircle, 
    Loader2 
} from "lucide-react";

type HealthStatus = 'loading' | 'ok' | 'error' | 'idle';

interface ServiceHealth {
    status: HealthStatus;
    message?: string;
}

export default function ConfigurationClient({ initialConfig }: { initialConfig: any }) {
    const [healthStatuses, setHealthStatuses] = useState<Record<string, ServiceHealth>>({
        email: { status: 'idle' },
        database: { status: 'idle' },
        storage: { status: 'idle' },
        ai: { status: 'idle' },
        stripe: { status: 'idle' },
        oauth: { status: 'idle' }
    });

    // Run health checks on mount
    useEffect(() => {
        runAllChecks();
    }, []);

    const checkService = async (service: string) => {
        if (service === 'oauth') {
            // OAuth doesn't have an active ping, just checking if keys are present
            const oauthConfig = initialConfig.oauth;
            const ok = oauthConfig.google || oauthConfig.github || oauthConfig.azure || oauthConfig.apple;
            setHealthStatuses(prev => ({
                ...prev,
                [service]: { 
                    status: ok ? 'ok' : 'error', 
                    message: ok ? 'OAuth Providers configured' : 'No OAuth providers configured'
                }
            }));
            return;
        }

        setHealthStatuses(prev => ({ ...prev, [service]: { status: 'loading' } }));
        try {
            const res = await fetch(`/api/admin/health?service=${service}`);
            const data = await res.json();
            
            if (res.ok && data.status === 'ok') {
                setHealthStatuses(prev => ({
                    ...prev,
                    [service]: { status: 'ok', message: data.message }
                }));
            } else {
                setHealthStatuses(prev => ({
                    ...prev,
                    [service]: { status: 'error', message: data.message || data.error || 'Healthcheck failed' }
                }));
            }
        } catch (error: any) {
            setHealthStatuses(prev => ({
                ...prev,
                [service]: { status: 'error', message: error.message || 'Network error' }
            }));
        }
    };

    const runAllChecks = () => {
        const services = ['email', 'database', 'storage', 'ai', 'stripe', 'oauth'];
        services.forEach(service => checkService(service));
    };

    const StatusBadge = ({ service }: { service: string }) => {
        const health = healthStatuses[service];
        
        if (health?.status === 'loading') {
            return (
                <div className="badge badge-loading">
                    <Loader2 size={14} className="animate-spin" />
                    Checking...
                </div>
            );
        }
        
        if (health?.status === 'ok') {
            return (
                <div title={health.message} className="badge badge-ok" style={{ color: "var(--success-color)", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <CheckCircle2 size={16} />
                    Connected
                </div>
            );
        }

        if (health?.status === 'error') {
            return (
                <div title={health.message} className="badge badge-error" style={{ color: "var(--danger-color)", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <XCircle size={16} className="badge-icon-shrink" />
                    <span className="badge-text-truncate">{health.message || 'Error'}</span>
                </div>
            );
        }

        return (
            <div className="badge badge-pending">
                Pending
            </div>
        );
    };

    return (
        <div style={{ marginBottom: "var(--spacing-8)" }}>
            <div className="header flex justify-between items-start" style={{ marginBottom: "var(--spacing-8)", borderBottom: "none" }}>
                <div>
                    <h2 className="header-title" style={{ margin: 0, marginBottom: "var(--spacing-2)" }}>Configuration</h2>
                    <p style={{ color: "var(--text-secondary)", margin: 0 }}>Manage and monitor system integrations and environment variables.</p>
                </div>
                <button
                    onClick={runAllChecks}
                    className="btn btn-outline gap-2"
                >
                    <RefreshCw size={18} />
                    Test All Integrated Services
                </button>
            </div>

            <div className="card-grid">
                
                {/* Email Service */}
                <div className="card" style={{ padding: "var(--spacing-6)" }}>
                    <div className="flex justify-between items-start" style={{ marginBottom: "var(--spacing-6)" }}>
                        <div className="flex items-center gap-4">
                            <div style={{ backgroundColor: "var(--bg-info-subtle)", padding: "var(--spacing-3)", borderRadius: "var(--border-radius-md)" }}>
                                <Mail size={24} style={{ color: "var(--info-color)" }} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-semibold)" }}>Email Provider</h3>
                                <div style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>SMTP Notification Service</div>
                            </div>
                        </div>
                        <StatusBadge service="email" />
                    </div>
                    
                    <div style={{ marginBottom: "var(--spacing-6)", backgroundColor: "var(--bg-code-block)", borderRadius: "var(--border-radius-md)", padding: "var(--spacing-4)", fontFamily: "monospace", fontSize: "var(--font-size-sm)", flex: 1 }}>
                        <div className="flex justify-between" style={{ borderBottom: "var(--border-width-1) solid var(--border-color)", paddingBottom: "var(--spacing-2)", marginBottom: "var(--spacing-2)" }}>
                            <span style={{ color: "var(--text-muted)" }}>SMTP_HOST</span>
                            <span style={{ color: "var(--text-primary)", wordBreak: "break-all", marginLeft: "var(--spacing-4)" }}>{initialConfig.email.host}</span>
                        </div>
                        <div className="flex justify-between" style={{ borderBottom: "var(--border-width-1) solid var(--border-color)", paddingBottom: "var(--spacing-2)", marginBottom: "var(--spacing-2)" }}>
                            <span style={{ color: "var(--text-muted)" }}>SMTP_USER</span>
                            <span style={{ color: "var(--text-primary)", wordBreak: "break-all", marginLeft: "var(--spacing-4)" }}>{initialConfig.email.user}</span>
                        </div>
                        <div className="flex justify-between">
                            <span style={{ color: "var(--text-muted)" }}>ADMIN_EMAIL</span>
                            <span style={{ color: "var(--text-primary)", wordBreak: "break-all", marginLeft: "var(--spacing-4)" }}>{initialConfig.email.admin}</span>
                        </div>
                    </div>

                    <button onClick={() => checkService('email')} className="btn btn-outline" style={{ width: "100%", justifyContent: "center" }}>
                        Test Connection
                    </button>
                </div>

                {/* Database */}
                <div className="card" style={{ padding: "var(--spacing-6)" }}>
                    <div className="flex justify-between items-start" style={{ marginBottom: "var(--spacing-6)" }}>
                        <div className="flex items-center gap-4">
                            <div style={{ backgroundColor: "var(--bg-success-subtle)", padding: "var(--spacing-3)", borderRadius: "var(--border-radius-md)" }}>
                                <Database size={24} style={{ color: "var(--success-color)" }} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-semibold)" }}>Database</h3>
                                <div style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>PostgreSQL via Prisma</div>
                            </div>
                        </div>
                        <StatusBadge service="database" />
                    </div>
                    
                    <div style={{ marginBottom: "var(--spacing-6)", backgroundColor: "var(--bg-code-block)", borderRadius: "var(--border-radius-md)", padding: "var(--spacing-4)", fontFamily: "monospace", fontSize: "var(--font-size-sm)", flex: 1 }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ color: "var(--text-muted)", marginBottom: "var(--spacing-2)" }}>DATABASE_URL</span>
                            <span style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>{initialConfig.database.url}</span>
                        </div>
                    </div>

                    <button onClick={() => checkService('database')} className="btn btn-outline" style={{ width: "100%", justifyContent: "center", marginTop: "auto" }}>
                        Test Connection
                    </button>
                </div>

                {/* Storage */}
                <div className="card" style={{ padding: "var(--spacing-6)" }}>
                    <div className="flex justify-between items-start" style={{ marginBottom: "var(--spacing-6)" }}>
                        <div className="flex items-center gap-4">
                            <div style={{ backgroundColor: "var(--bg-accent-subtle)", padding: "var(--spacing-3)", borderRadius: "var(--border-radius-md)" }}>
                                <Cloud size={24} style={{ color: "var(--accent-color)" }} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-semibold)" }}>Cloud Storage</h3>
                                <div style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>Google Cloud Storage bucket</div>
                            </div>
                        </div>
                        <StatusBadge service="storage" />
                    </div>
                    
                    <div style={{ marginBottom: "var(--spacing-6)", backgroundColor: "var(--bg-code-block)", borderRadius: "var(--border-radius-md)", padding: "var(--spacing-4)", fontFamily: "monospace", fontSize: "var(--font-size-sm)", flex: 1 }}>
                        <div className="flex justify-between" style={{ borderBottom: "var(--border-width-1) solid var(--border-color)", paddingBottom: "var(--spacing-2)", marginBottom: "var(--spacing-2)" }}>
                            <span style={{ color: "var(--text-muted)" }}>GCS_BUCKET_NAME</span>
                            <span style={{ color: "var(--text-primary)", wordBreak: "break-all", marginLeft: "var(--spacing-4)" }}>{initialConfig.storage.bucket}</span>
                        </div>
                    </div>

                    <button onClick={() => checkService('storage')} className="btn btn-outline" style={{ width: "100%", justifyContent: "center", marginTop: "auto" }}>
                        Test Connection
                    </button>
                </div>

                {/* Gemini AI */}
                <div className="card" style={{ padding: "var(--spacing-6)" }}>
                    <div className="flex justify-between items-start" style={{ marginBottom: "var(--spacing-6)" }}>
                        <div className="flex items-center gap-4">
                            <div style={{ backgroundColor: "var(--bg-purple-subtle)", padding: "var(--spacing-3)", borderRadius: "var(--border-radius-md)" }}>
                                <Sparkles size={24} style={{ color: "var(--purple-color)" }} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-semibold)" }}>Vision AI</h3>
                                <div style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>Gemini 2.5 Flash</div>
                            </div>
                        </div>
                        <StatusBadge service="ai" />
                    </div>
                    
                    <div style={{ marginBottom: "var(--spacing-6)", backgroundColor: "var(--bg-code-block)", borderRadius: "var(--border-radius-md)", padding: "var(--spacing-4)", fontFamily: "monospace", fontSize: "var(--font-size-sm)", flex: 1 }}>
                        <div className="flex justify-between" style={{ borderBottom: "var(--border-width-1) solid var(--border-color)", paddingBottom: "var(--spacing-2)", marginBottom: "var(--spacing-2)" }}>
                            <span style={{ color: "var(--text-muted)" }}>GEMINI_API_KEY</span>
                            <span style={{ color: "var(--text-primary)", wordBreak: "break-all", marginLeft: "var(--spacing-4)" }}>{initialConfig.ai.geminiKey}</span>
                        </div>
                    </div>

                    <button onClick={() => checkService('ai')} className="btn btn-outline" style={{ width: "100%", justifyContent: "center", marginTop: "auto" }}>
                        Test Connection
                    </button>
                </div>

                {/* Stripe */}
                <div className="card" style={{ padding: "var(--spacing-6)" }}>
                    <div className="flex justify-between items-start" style={{ marginBottom: "var(--spacing-6)" }}>
                        <div className="flex items-center gap-4">
                            <div style={{ backgroundColor: "var(--bg-primary-subtle)", padding: "var(--spacing-3)", borderRadius: "var(--border-radius-md)" }}>
                                <CreditCard size={24} style={{ color: "var(--primary-color)" }} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-semibold)" }}>Payment Gateway</h3>
                                <div style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>Stripe Integration</div>
                            </div>
                        </div>
                        <StatusBadge service="stripe" />
                    </div>
                    
                    <div style={{ marginBottom: "var(--spacing-6)", backgroundColor: "var(--bg-code-block)", borderRadius: "var(--border-radius-md)", padding: "var(--spacing-4)", fontFamily: "monospace", fontSize: "var(--font-size-sm)", flex: 1 }}>
                        <div style={{ display: "flex", flexDirection: "column", marginBottom: "var(--spacing-2)" }}>
                            <span style={{ color: "var(--text-muted)", marginBottom: "var(--spacing-1)" }}>STRIPE_PUBLISHABLE_KEY</span>
                            <span style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>{initialConfig.stripe.publishableKey}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ color: "var(--text-muted)", marginBottom: "var(--spacing-1)" }}>STRIPE_SECRET_KEY</span>
                            <span style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>{initialConfig.stripe.secretKey}</span>
                        </div>
                    </div>

                    <button onClick={() => checkService('stripe')} className="btn btn-outline" style={{ width: "100%", justifyContent: "center", marginTop: "auto" }}>
                        Test Connection
                    </button>
                </div>

                {/* OAuth */}
                <div className="card" style={{ padding: "var(--spacing-6)" }}>
                    <div className="flex justify-between items-start" style={{ marginBottom: "var(--spacing-6)" }}>
                        <div className="flex items-center gap-4">
                            <div style={{ backgroundColor: "var(--bg-warning-subtle)", padding: "var(--spacing-3)", borderRadius: "var(--border-radius-md)" }}>
                                <ShieldCheck size={24} style={{ color: "var(--warning-color)" }} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-semibold)" }}>Authentication</h3>
                                <div style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>OAuth Providers Configured</div>
                            </div>
                        </div>
                        <StatusBadge service="oauth" />
                    </div>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "var(--grid-cols-2)", gap: "var(--spacing-4)", marginBottom: "var(--spacing-6)", flex: 1 }}>
                        <div className="flex items-center justify-between" style={{ backgroundColor: "var(--bg-code-block)", borderRadius: "var(--border-radius-md)", padding: "var(--spacing-3)", fontWeight: "bold" }}>
                            <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", fontWeight: "normal" }}>Google</span>
                            {initialConfig.oauth.google ? <CheckCircle2 size={16} style={{ color: "var(--success-color)", strokeWidth: 3 }} /> : <XCircle size={16} style={{ color: "var(--danger-color)", strokeWidth: 3 }} />}
                        </div>
                        <div className="flex items-center justify-between" style={{ backgroundColor: "var(--bg-code-block)", borderRadius: "var(--border-radius-md)", padding: "var(--spacing-3)", fontWeight: "bold" }}>
                            <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", fontWeight: "normal" }}>Apple</span>
                            {initialConfig.oauth.apple ? <CheckCircle2 size={16} style={{ color: "var(--success-color)", strokeWidth: 3 }} /> : <XCircle size={16} style={{ color: "var(--danger-color)", strokeWidth: 3 }} />}
                        </div>
                        <div className="flex items-center justify-between" style={{ backgroundColor: "var(--bg-code-block)", borderRadius: "var(--border-radius-md)", padding: "var(--spacing-3)", fontWeight: "bold" }}>
                            <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", fontWeight: "normal" }}>GitHub</span>
                            {initialConfig.oauth.github ? <CheckCircle2 size={16} style={{ color: "var(--success-color)", strokeWidth: 3 }} /> : <XCircle size={16} style={{ color: "var(--danger-color)", strokeWidth: 3 }} />}
                        </div>
                        <div className="flex items-center justify-between" style={{ backgroundColor: "var(--bg-code-block)", borderRadius: "var(--border-radius-md)", padding: "var(--spacing-3)", fontWeight: "bold" }}>
                            <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", fontWeight: "normal" }}>Azure AD</span>
                            {initialConfig.oauth.azure ? <CheckCircle2 size={16} style={{ color: "var(--success-color)", strokeWidth: 3 }} /> : <XCircle size={16} style={{ color: "var(--danger-color)", strokeWidth: 3 }} />}
                        </div>
                    </div>

                    <button onClick={() => checkService('oauth')} className="btn btn-outline" style={{ width: "100%", justifyContent: "center", marginTop: "auto" }}>
                        Refresh Status
                    </button>
                </div>

            </div>
        </div>
    );
}