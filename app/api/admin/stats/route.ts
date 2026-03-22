import { NextResponse } from 'next/server';
import { getIapUser } from "@/lib/iap-auth";
import * as fs from 'fs';
import * as path from 'path';

import prisma from '@/lib/prisma';
import { tracer } from '@/lib/otel';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    return tracer.startActiveSpan('Admin:Stats:GET', async (span) => {
    try {
        const user = await getIapUser();

        if (!user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
        });

        if (!dbUser || dbUser.role !== "ADMIN") {
            span.recordException(new Error('Forbidden'));
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        
        span.setAttribute('user.id', dbUser.id);

        // ---------------------------------------------------------------------
        // 1. Entity Counts
        // ---------------------------------------------------------------------
        const [userCount, sessionCount, accountCount] = await Promise.all([
            prisma.user.count(),
            prisma.session.count(),
            prisma.account.count()
        ]);

        // ---------------------------------------------------------------------
        // 2. Database Sizes (PostgreSQL specific queries)
        // ---------------------------------------------------------------------
        const dbSizeQuery = await prisma.$queryRaw<Array<{ size: bigint }>>`
            SELECT pg_database_size(current_database()) as size;
        `;
        const dbSizeBytes = dbSizeQuery.length > 0 ? Number(dbSizeQuery[0].size) : 0;

        const tableSizesQuery = await prisma.$queryRaw<Array<{ table_name: string, total_size: bigint }>>`
            SELECT
                relname as table_name,
                pg_total_relation_size(relid) as total_size
            FROM pg_catalog.pg_statio_user_tables
            ORDER BY pg_total_relation_size(relid) DESC;
        `;
        const tableSizes = tableSizesQuery.map((row: any) => ({
            tableName: row.table_name,
            sizeBytes: Number(row.total_size)
        }));

        // ---------------------------------------------------------------------
        // 3. System Info
        // ---------------------------------------------------------------------
        const uptimeSeconds = process.uptime();
        const startTime = new Date(Date.now() - (uptimeSeconds * 1000)).toISOString();

        let appVersion = process.env.APP_VERSION || "development";
        try {
            const versionFilePath = path.join(process.cwd(), 'public', 'version.txt');
            if (fs.existsSync(versionFilePath)) {
                appVersion = fs.readFileSync(versionFilePath, 'utf-8').trim();
            }
        } catch (e) {
            console.warn("Could not read version.txt:", e);
        }

        const systemInfo = {
            gitHash: appVersion,
            containerRevision: process.env.K_REVISION || "local",
            nodeVersion: process.version,
            startTime: startTime,
            uptimeSeconds: Math.floor(uptimeSeconds)
        };

        return NextResponse.json({
            counts: {
                users: userCount,
                sessions: sessionCount,
                accounts: accountCount
            },
            database: {
                totalSizeBytes: dbSizeBytes,
                tableSizes: tableSizes
            },
            system: systemInfo,
        });

    } catch (error: any) {
        console.error("Error generating admin stats:", error);
        span.recordException(error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    } finally {
        span.end();
    }
    });
}