import NextAuth from "next-auth";
export const dynamic = "force-dynamic";
import { buildAuthOptions } from "@/auth";

// Use the async builder to ensure Apple Sign-In's JWT secret is generated
const handler = NextAuth(await buildAuthOptions());

export { handler as GET, handler as POST };
