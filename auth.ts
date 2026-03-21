import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import AzureADProvider from "next-auth/providers/azure-ad";
import AppleProvider from "next-auth/providers/apple";
import { PrismaAdapter } from "@auth/prisma-adapter";

import prisma from '@/lib/prisma';
import { generateAppleClientSecret } from '@/lib/apple-secret';
import { tracer } from '@/lib/otel';

/**
 * Extracts a human-readable name from an email address (e.g., "john.doe@example.com" -> "John Doe").
 */
function extractNameFromEmail(email?: string | null): string | null {
    if (!email) return null;
    const prefix = email.split('@')[0];
    if (!prefix) return null;
    
    return prefix
        .split(/[._-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Cache the Apple client secret so we only generate it once per process lifetime
let cachedAppleSecret: string | null = null;

async function getAppleSecret(): Promise<string> {
    if (!cachedAppleSecret) {
        cachedAppleSecret = await generateAppleClientSecret();
    }
    return cachedAppleSecret;
}

/**
 * Build NextAuth options dynamically.
 * This is async because Apple Sign-In requires generating a JWT client secret
 * from the .p8 private key at runtime.
 */
export async function buildAuthOptions(): Promise<NextAuthOptions> {
    const appleSecret = await getAppleSecret();

    return {
        adapter: PrismaAdapter(prisma) as unknown as NextAuthOptions["adapter"],
        providers: [
            GoogleProvider({
                clientId: process.env.GOOGLE_CLIENT_ID || "demo_id",
                clientSecret: process.env.GOOGLE_CLIENT_SECRET || "demo_secret",
                allowDangerousEmailAccountLinking: true,
                profile(profile) {
                    return {
                        id: profile.sub,
                        name: profile.name || extractNameFromEmail(profile.email),
                        email: profile.email,
                        image: profile.picture,
                    }
                }
            }),
            GitHubProvider({
                clientId: process.env.GITHUB_CLIENT_ID || "demo_id",
                clientSecret: process.env.GITHUB_CLIENT_SECRET || "demo_secret",
                allowDangerousEmailAccountLinking: true,
                profile(profile) {
                    return {
                        id: profile.id.toString(),
                        name: profile.name || profile.login || extractNameFromEmail(profile.email),
                        email: profile.email,
                        image: profile.avatar_url,
                    }
                }
            }),
            AzureADProvider({
                clientId: process.env.AZURE_AD_CLIENT_ID || "demo_id",
                clientSecret: process.env.AZURE_AD_CLIENT_SECRET || "demo_secret",
                tenantId: "common",
                allowDangerousEmailAccountLinking: true,
                profile(profile) {
                    return {
                        id: profile.oid || profile.sub,
                        name: profile.name || profile.preferred_username || extractNameFromEmail(profile.email) || extractNameFromEmail(profile.preferred_username),
                        email: profile.email || profile.preferred_username,
                        image: profile.picture,
                    }
                }
            }),
            AppleProvider({
                clientId: process.env.APPLE_CLIENT_ID || "demo_id",
                clientSecret: appleSecret,
                allowDangerousEmailAccountLinking: true,
                checks: ["none"],
                profile(profile) {
                    // Apple only provides the name on the FIRST login in a separate JSON payload, 
                    // which NextAuth tries to handle, but if it fails or it's a subsequent login via a new device,
                    // we must fallback to the email prefix.
                    return {
                        id: profile.sub,
                        name: profile.name || extractNameFromEmail(profile.email),
                        email: profile.email,
                        image: null,
                    }
                }
            }),
        ],
        callbacks: {
            signIn: async ({ user, account, profile }) => {
                return tracer.startActiveSpan('NextAuth:signIn', async (span) => {
                  try {
                    span.setAttribute('auth.provider', account?.provider || 'unknown');
                    span.setAttribute('user.email', user.email || 'unknown');
                    return true;
                  } finally {
                    span.end();
                  }
                });
            },
            session: async ({ session, user }) => {
                return tracer.startActiveSpan('NextAuth:session', async (span) => {
                  try {
                    if (session.user && user) {
                        span.setAttribute('user.id', user.id);
                        // Ensure the base properties are mapped
                        session.user.id = user.id;

                    // Fetch the latest user record to ensure we have the most up-to-date role/approval status,
                    // because the JWT/Session callback `user` object might be cached or missing custom fields depending on strategy
                    try {
                        const dbUser = await prisma.user.findUnique({
                            where: { id: user.id }
                        });

                        if (dbUser) {
                            session.user.role = dbUser.role;
                            session.user.isApproved = dbUser.isApproved;
                            session.user.emailVerified = dbUser.emailVerified;
                            session.user.createdAt = dbUser.createdAt;
                            
                            if (dbUser.name && !session.user.name) {
                                session.user.name = dbUser.name;
                            }
                        }
                    } catch (e) {
                         console.error("Failed to fetch user roles for session:", e);
                         span.recordException(e as Error);
                    }
                }
                return session;
                  } finally {
                    span.end();
                  }
                });
            },
        },
        events: {
            async signIn({ user, account, profile, isNewUser }) {
                return tracer.startActiveSpan('NextAuth:Event:signIn', async (span) => {
                  try {
                    span.setAttribute('user.id', user.id || 'unknown');
                    span.setAttribute('auth.isNewUser', String(isNewUser));
                // Fire-and-forget update to track last login and oauth provider
                if (user.id) {
                    try {
                        const provider = account?.provider || null;
                        const updateData: any = {
                            lastLogin: new Date(),
                            oauthProvider: provider
                        };

                        // Opportunistically fix existing users with null names
                        if (!user.name && user.email) {
                            const extractedName = extractNameFromEmail(user.email);
                            if (extractedName) {
                                updateData.name = extractedName;
                                user.name = extractedName;
                            }
                        }

                        await prisma.user.update({
                            where: { id: user.id },
                            data: updateData
                        });
                    } catch (e) {
                        console.error("Failed to update user login metrics in events.signIn:", e);
                        span.recordException(e as Error);
                    }
                }
                  } finally {
                    span.end();
                  }
                });
            },
            async createUser({ user }) {
                return tracer.startActiveSpan('NextAuth:Event:createUser', async (span) => {
                  try {
                    span.setAttribute('user.id', user.id || 'unknown');
                    span.setAttribute('user.email', user.email || 'unknown');
                  } finally {
                    span.end();
                  }
                });
            }
        },
        pages: {
            signIn: '/',
            error: '/login/error', // Redirect to custom error page
        }
    };
}
