import { getIapUser } from "@/lib/iap-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, ShieldAlert, Activity, Cpu, Wrench, Settings, Palette } from "lucide-react";
import { getAdminNotificationCounts } from "@/lib/admin-notifications";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getIapUser();

    // Security Gate: Only authenticated users with the ADMIN role can view this layout and any nested pages
    if (!user || user.role !== "ADMIN") {
        redirect("/");
    }

    const notifications = await getAdminNotificationCounts();

    return (
        <div className="container" style={{ padding: "var(--spacing-8)" }}>
            <header className="header flex flex-wrap justify-between items-center gap-4" style={{ marginBottom: "var(--spacing-8)" }}>
                <div className="flex items-center gap-4">
                    <Link href="/" className="btn btn-outline">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="header-title flex items-center gap-2" style={{ margin: 0 }}>
                            <ShieldAlert size={32} style={{ color: "var(--accent-color)" }} />
                            Admin Dashboard
                        </h1>
                        <p className="text-secondary" style={{ marginTop: "var(--spacing-1)", marginBottom: 0 }}>
                            Manage platform settings and users
                        </p>
                    </div>
                </div>
            </header>

            <div className="nav-links flex flex-wrap gap-4" style={{ marginBottom: "var(--spacing-8)", borderBottom: "1px solid var(--border-color)", paddingBottom: "var(--spacing-4)" }}>
                <Link href="/admin/users" className="btn btn-outline" style={{ whiteSpace: "nowrap", position: "relative" }}>
                    <Users size={18} />
                    <span>User Management</span>
                    {notifications.pendingUsers > 0 && (
                        <span style={{ marginLeft: "0.25rem", backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#f87171", padding: "0.1rem 0.4rem", borderRadius: "99px", fontSize: "0.7rem", fontWeight: "bold" }}>{notifications.pendingUsers}</span>
                    )}
                </Link>
                <Link href="/admin/stats" className="btn btn-outline" style={{ whiteSpace: "nowrap" }}>
                    <Activity size={18} />
                    <span>App Stats & Costs</span>
                </Link>
                <Link href="/admin/ai" className="btn btn-outline" style={{ whiteSpace: "nowrap" }}>
                    <Cpu size={18} />
                    <span>AI Configuration</span>
                </Link>

                <Link href="/admin/maintenance" className="btn btn-outline" style={{ whiteSpace: "nowrap", position: "relative" }}>
                    <Wrench size={18} />
                    <span>Maintenance</span>
                    {notifications.systemIssues > 0 && (
                        <span style={{ marginLeft: "0.25rem", backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#f87171", padding: "0.1rem 0.4rem", borderRadius: "99px", fontSize: "0.7rem", fontWeight: "bold" }}>{notifications.systemIssues}</span>
                    )}
                </Link>
                <Link href="/admin/configuration" className="btn btn-outline" style={{ whiteSpace: "nowrap" }}>
                    <Settings size={18} />
                    <span>Configuration</span>
                </Link>
                <Link href="/admin/appearance" className="btn btn-outline" style={{ whiteSpace: "nowrap" }}>
                    <Palette size={18} />
                    <span>Appearance</span>
                </Link>
            </div>

            <main>
                {children}
            </main>
        </div>
    );
}