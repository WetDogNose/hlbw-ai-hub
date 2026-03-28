import { getIapUser } from "@/lib/iap-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  ShieldAlert,
  Activity,
  Cpu,
  Wrench,
  Settings,
  Palette,
} from "lucide-react";
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
    <div className="container-admin">
      <header className="page-header">
        <div className="flex items-center gap-4">
          <Link href="/" className="btn-icon">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="page-title">
              <ShieldAlert size={32} className="page-title-icon" />
              Admin Dashboard
            </h1>
            <p className="page-description">
              Manage platform settings and view diagnostics
            </p>
          </div>
        </div>
      </header>

      <nav className="admin-nav-bar">
        <Link href="/admin/stats" className="nav-pill">
          <Activity size={18} style={{ color: "var(--info-color)" }} />
          <span>App Stats & Costs</span>
        </Link>
        <Link href="/admin/ai" className="nav-pill">
          <Cpu size={18} style={{ color: "var(--purple-color)" }} />
          <span>AI Configuration</span>
        </Link>
        <Link href="/admin/maintenance" className="nav-pill relative">
          <Wrench size={18} style={{ color: "var(--warning-color)" }} />
          <span>Maintenance</span>
          {notifications.systemIssues > 0 && (
            <span className="badge badge-danger ml-2">
              {notifications.systemIssues}
            </span>
          )}
        </Link>
        <Link href="/admin/configuration" className="nav-pill">
          <Settings size={18} style={{ color: "var(--success-color)" }} />
          <span>Configuration</span>
        </Link>
        <Link href="/admin/appearance" className="nav-pill">
          <Palette size={18} style={{ color: "var(--accent-color)" }} />
          <span>Appearance</span>
        </Link>
      </nav>

      <main className="card">
        <div className="card-body">{children}</div>
      </main>
    </div>
  );
}
