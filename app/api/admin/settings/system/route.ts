import { NextResponse } from "next/server";
import { getIapUser } from "@/lib/iap-auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
    const user = await getIapUser();
    if (!user || user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        let setting = await prisma.systemSetting.findFirst({
            where: { isActive: true }
        });

        if (!setting) {
            setting = await prisma.systemSetting.create({
                data: {
                    isActive: true,
                    autoApproveNewUsers: false,
                }
            });
        }

        return NextResponse.json(setting);
    } catch (error: any) {
        console.error("Error fetching system setting:", error);
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    const user = await getIapUser();
    if (!user || user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();

        let setting = await prisma.systemSetting.findFirst({
            where: { isActive: true }
        });

        if (!setting) {
            setting = await prisma.systemSetting.create({
                data: {
                    isActive: true,
                    autoApproveNewUsers: false,
                }
            });
        }

        const updated = await prisma.systemSetting.update({
            where: { id: setting.id },
            data: {
                autoApproveNewUsers: body.autoApproveNewUsers !== undefined ? body.autoApproveNewUsers : setting.autoApproveNewUsers,
            }
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Error updating system setting:", error);
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}
