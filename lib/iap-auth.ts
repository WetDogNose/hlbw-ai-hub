import { headers } from "next/headers";
import prisma from "@/lib/prisma";

export type IapUser = {
  id: string;
  email: string | null;
  name?: string | null;
  role: string;
};

export async function getIapUser(): Promise<IapUser | null> {
  const headerStore = await headers();
  // Cloud IAP passes the user email in this header (e.g., 'accounts.google.com:user@domain.com')
  const iapEmailHeader = headerStore.get("x-goog-authenticated-user-email");

  const email = iapEmailHeader?.replace("accounts.google.com:", "");

  if (!email) {
    // Local dev bypass: NODE_ENV gets statically inlined by Next.js, so also honor
    // a runtime-only flag for previewing the prod build locally.
    if (
      process.env.NODE_ENV === "development" ||
      process.env.LOCAL_TRUSTED_ADMIN === "1"
    ) {
      return {
        id: "dev-local-user",
        email: process.env.ADMIN_EMAIL || "dev@local",
        name: "Local Dev",
        role: "ADMIN",
      };
    }
    return null;
  }

  const isAdminEmail = email === process.env.ADMIN_EMAIL;
  const assumedRole = isAdminEmail ? "ADMIN" : "USER";
  return { id: email, email, name: email.split("@")[0], role: assumedRole };
}
