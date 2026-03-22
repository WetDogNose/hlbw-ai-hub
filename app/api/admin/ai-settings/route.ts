import { NextResponse } from 'next/server';
import { getIapUser } from "@/lib/iap-auth";
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const user = await getIapUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const settings = await prisma.aISetting.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error fetching AI settings:', error);
        return NextResponse.json({ error: 'Failed to fetch AI settings' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const user = await getIapUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const {
            maxOutputTokens,
            topP,
            topK,
        } = await request.json();

        // Transaction: Deactivate existing, create new, delete oldest if > 10
        await prisma.$transaction(async (tx: any) => {
            await tx.aISetting.updateMany({
                where: { isActive: true },
                data: { isActive: false }
            });

            await tx.aISetting.create({
                data: {
                    maxOutputTokens: maxOutputTokens !== undefined ? Number(maxOutputTokens) : 8192,
                    topP: topP !== undefined ? Number(topP) : 1.0,
                    topK: topK !== undefined ? Number(topK) : 40,
                    stage1Prompt: "",
                    stage2Prompt: "", // Required fields from schema
                    isActive: true,
                }
            });

            const allSettings = await tx.aISetting.findMany({
                orderBy: { createdAt: 'desc' },
                select: { id: true },
                skip: 10
            });

            if (allSettings.length > 0) {
                const idsToDelete = allSettings.map((s: { id: string }) => s.id);
                await tx.aISetting.deleteMany({
                    where: { id: { in: idsToDelete } }
                });
            }
        });

        const activeSettings = await prisma.aISetting.findFirst({
            where: { isActive: true }
        });

        return NextResponse.json(activeSettings);

    } catch (error) {
        console.error('Error creating AI setting:', error);
        return NextResponse.json({ error: 'Failed to create AI setting' }, { status: 500 });
    }
}
