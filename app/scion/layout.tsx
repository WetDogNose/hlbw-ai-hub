import { getIapUser } from "@/lib/iap-auth";
import { redirect } from "next/navigation";

export default async function ScionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getIapUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/");
  }

  return children;
}
