import { NextResponse } from "next/server";
import { getIapUser } from "@/lib/iap-auth";

import prisma from '@/lib/prisma';


export async function DELETE(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const user = await getIapUser();

        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = params.id;

        // Ensure not deleting self
        if (userId === user.id) {
            return NextResponse.json({ error: "Cannot delete your own account." }, { status: 403 });
        }

        const dbUser = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!dbUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        await prisma.user.delete({
            where: { id: userId }
        });

        return NextResponse.json({ success: true, message: "User deleted successfully." });

    } catch (error) {
        console.error("Delete user error:", error);
        return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
    }
}
