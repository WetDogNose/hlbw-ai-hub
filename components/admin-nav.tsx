"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Cpu,
  Wrench,
  Settings,
  Palette,
} from "lucide-react";

interface AdminNavProps {
  notifications: { systemIssues: number };
}

export default function AdminNav({ notifications }: AdminNavProps) {
  const pathname = usePathname();

  const isScionCommandCenter = pathname === "/admin/scion";
  const isStats = pathname === "/admin/stats";
  const isAi = pathname === "/admin/ai";
  const isMaintenance = pathname === "/admin/maintenance";
  const isConfig = pathname === "/admin/configuration";
  const isAppearance = pathname === "/admin/appearance";

  return (
    <nav className="admin-nav-bar">
      <Link 
        href="/admin/stats" 
        className={`nav-pill ${isStats ? 'nav-pill-active bg-info-subtle' : ''}`}
        style={isStats ? { fontWeight: "bold" } : {}}
      >
        <Activity size={18} style={{ color: "var(--info-color)" }} />
        <span>App Stats & Costs</span>
      </Link>
      <Link 
        href="/admin/ai" 
        className={`nav-pill ${isAi ? 'nav-pill-active bg-purple-subtle' : ''}`}
        style={isAi ? { fontWeight: "bold" } : {}}
      >
        <Cpu size={18} style={{ color: "var(--purple-color)" }} />
        <span>AI Configuration</span>
      </Link>
      <Link 
        href="/admin/scion"
        className={`nav-pill ${isScionCommandCenter ? 'nav-pill-active bg-purple-subtle' : ''}`}
        style={isScionCommandCenter ? { fontWeight: "bold" } : {}}
      >
        <Cpu size={18} style={{ color: "var(--purple-color)" }} />
        <span>Scion Command Center</span>
      </Link>
      <Link 
        href="/admin/maintenance" 
        className={`nav-pill relative ${isMaintenance ? 'nav-pill-active bg-warning-subtle' : ''}`}
        style={isMaintenance ? { fontWeight: "bold" } : {}}
      >
        <Wrench size={18} style={{ color: "var(--warning-color)" }} />
        <span>Maintenance</span>
        {notifications.systemIssues > 0 && (
          <span className="badge badge-danger ml-2">
            {notifications.systemIssues}
          </span>
        )}
      </Link>
      <Link 
        href="/admin/configuration" 
        className={`nav-pill ${isConfig ? 'nav-pill-active bg-success-subtle' : ''}`}
        style={isConfig ? { fontWeight: "bold" } : {}}
      >
        <Settings size={18} style={{ color: "var(--success-color)" }} />
        <span>Configuration</span>
      </Link>
      <Link 
        href="/admin/appearance" 
        className={`nav-pill ${isAppearance ? 'nav-pill-active bg-accent-subtle' : ''}`}
        style={isAppearance ? { fontWeight: "bold" } : {}}
      >
        <Palette size={18} style={{ color: "var(--accent-color)" }} />
        <span>Appearance</span>
      </Link>
    </nav>
  );
}
