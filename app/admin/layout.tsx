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
    <div className="container mx-auto p-4 md:p-8 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 border border-slate-700/50 rounded-xl hover:bg-slate-800 transition-colors text-slate-300"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 text-slate-50 tracking-tight">
              <ShieldAlert
                size={32}
                className="text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]"
              />
              Admin Dashboard
            </h1>
            <p className="text-sm text-slate-400 mt-1 font-medium">
              Manage platform settings and view diagnostics
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 mb-8 border-b border-slate-700/60 pb-5">
        <Link
          href="/admin/stats"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/50 text-slate-200 transition-all text-sm font-medium whitespace-nowrap"
        >
          <Activity size={18} className="text-blue-400" />
          <span>App Stats & Costs</span>
        </Link>
        <Link
          href="/admin/ai"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/50 text-slate-200 transition-all text-sm font-medium whitespace-nowrap"
        >
          <Cpu size={18} className="text-purple-400" />
          <span>AI Configuration</span>
        </Link>

        <Link
          href="/admin/maintenance"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/50 text-slate-200 transition-all text-sm font-medium whitespace-nowrap relative group"
        >
          <Wrench size={18} className="text-amber-400" />
          <span>Maintenance</span>
          {notifications.systemIssues > 0 && (
            <span className="ml-1 bg-red-500/20 text-red-500 border border-red-500/30 px-2 py-0.5 rounded-full text-xs font-bold shadow-[0_0_10px_rgba(239,68,68,0.3)]">
              {notifications.systemIssues}
            </span>
          )}
        </Link>
        <Link
          href="/admin/configuration"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/50 text-slate-200 transition-all text-sm font-medium whitespace-nowrap"
        >
          <Settings size={18} className="text-emerald-400" />
          <span>Configuration</span>
        </Link>
        <Link
          href="/admin/appearance"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/50 text-slate-200 transition-all text-sm font-medium whitespace-nowrap"
        >
          <Palette size={18} className="text-pink-400" />
          <span>Appearance</span>
        </Link>
      </div>

      <main className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
        {children}
      </main>
    </div>
  );
}
