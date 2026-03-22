import { NextRequest, NextResponse } from "next/server";
import { getIapUser } from "@/lib/iap-auth";
import prisma from "@/lib/prisma";

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await context.params;
        const user = await getIapUser();

        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!userId) {
            return NextResponse.json({ error: "User ID is required" }, { status: 400 });
        }

        // Do not allow an admin to force re-auth themselves via this endpoint 
        // (though they could just log out, it's safer to prevent accidents)
        if (userId === user.id) {
            return NextResponse.json({ error: "Cannot force re-authenticate yourself." }, { status: 400 });
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!targetUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Delete all active sessions for this user
        const result = await prisma.session.deleteMany({
            where: {
                userId: userId
            }
        });

        return NextResponse.json({ 
            success: true, 
            message: `Deleted ${result.count} active sessions.`,
            deletedCount: result.count
        });

    } catch (error: any) {
        console.error("Force Re-auth Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
