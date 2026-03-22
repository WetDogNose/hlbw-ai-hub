import { NextResponse } from "next/server";
import { getIapUser } from "@/lib/iap-auth";

import prisma from '@/lib/prisma';
import { tracer } from '@/lib/otel';


export async function GET(request: Request) {
    return tracer.startActiveSpan('Admin:Users:GET', async (span) => {
    try {
        const user = await getIapUser();

        // Security Gate: Only authenticated users with the ADMIN role can execute this
        if (!user || user.role !== "ADMIN") {
            span.recordException(new Error('Unauthorized'));
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        span.setAttribute('user.id', user.id);

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10));
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                skip,
                take: limit,
                orderBy: [
                    { isApproved: 'asc' },
                    { name: 'asc' },
                    { email: 'asc' }
                ]
            }),
            prisma.user.count()
        ]);

        return NextResponse.json({ users, total });
    } catch (error: any) {
        console.error("Admin user fetch error:", error);
        span.recordException(error);
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    } finally {
        span.end();
    }
    });
}

export async function PUT(request: Request) {
    return tracer.startActiveSpan('Admin:Users:PUT', async (span) => {
    try {
        const user = await getIapUser();

        // Security Gate: Only authenticated users with the ADMIN role can execute this
        if (!user || user.role !== "ADMIN") {
            span.recordException(new Error('Unauthorized'));
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        span.setAttribute('user.id', user.id);

        const body = await request.json();
        const { userId, role, isApproved, isTestUser, planType } = body;

        if (!userId) {
            span.recordException(new Error('User ID is required'));
            return NextResponse.json({ error: "User ID is required" }, { status: 400 });
        }
        
        span.setAttribute('target.userId', userId);

        // Prepare the update object dynamically based on what was passed
        const updateData: any = {};
        if (role !== undefined) updateData.role = role;
        if (isApproved !== undefined) updateData.isApproved = isApproved;
        if (isTestUser !== undefined) updateData.isTestUser = isTestUser;


        // Prevent admins from modifying their own roles via API to avoid lockout
        if (userId === user.id && role !== undefined) {
            return NextResponse.json({ error: "Cannot modify own admin status" }, { status: 403 });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
        });

        return NextResponse.json(updatedUser);

    } catch (error: any) {
        console.error("Admin user update error:", error);
        span.recordException(error);
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    } finally {
        span.end();
    }
    });
}

export async function POST(request: Request) {
    return tracer.startActiveSpan('Admin:Users:POST', async (span) => {
    try {
        const user = await getIapUser();

        // Security Gate: Only authenticated users with the ADMIN role can execute this
        if (!user || user.role !== "ADMIN") {
            span.recordException(new Error('Unauthorized'));
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        span.setAttribute('user.id', user.id);

        const body = await request.json();
        const { email, role, isApproved } = body;

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: "User already exists. Update their access in the table below." }, { status: 400 });
        }

        const newUser = await prisma.user.create({
            data: {
                email,
                role: role || "USER",
                isApproved: isApproved !== undefined ? isApproved : true,
                emailVerified: new Date(),
            },
        });

        return NextResponse.json(newUser, { status: 201 });

    } catch (error: any) {
        console.error("Admin user creation error:", error);
        span.recordException(error);
        return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    } finally {
        span.end();
    }
    });
}
