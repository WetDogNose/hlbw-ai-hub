import { getIapUser } from "@/lib/iap-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldAlert,
} from "lucide-react";
import { getAdminNotificationCounts } from "@/lib/admin-notifications";
import AdminNav from "@/components/admin-nav";

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

      <AdminNav notifications={notifications} />

      <main className="card">
        <div className="card-body">{children}</div>
      </main>
    </div>
  );
}
