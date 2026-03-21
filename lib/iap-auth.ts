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
    if (process.env.NODE_ENV === "development") {
      // Graceful fallback for local development
      return { 
        id: "dev-local-user", 
        email: process.env.ADMIN_EMAIL || "dev@local", 
        name: "Local Dev", 
        role: "ADMIN" 
      };
    }
    return null;
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true }
    });
    
    // Return the user from the DB, or a default constructed one if not provisioned yet
    return dbUser || { id: email, email, name: email.split('@')[0], role: "USER" };
  } catch(e) {
    console.warn("IAP Auth: Failed to fetch user from DB, falling back to basic header data:", e);
    return { id: email, email, name: email.split('@')[0], role: "USER" };
  }
}
