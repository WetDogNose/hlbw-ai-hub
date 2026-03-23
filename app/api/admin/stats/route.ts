import { NextResponse } from "next/server";
import { getIapUser } from "@/lib/iap-auth";
import * as fs from "fs";
import * as path from "path";

import prisma from "@/lib/prisma";
import { tracer } from "@/lib/otel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return tracer.startActiveSpan("Admin:Stats:GET", async (span) => {
    try {
      const user = await getIapUser();

      if (!user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (user.role !== "ADMIN") {
        span.recordException(new Error("Forbidden"));
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      span.setAttribute("user.id", user.id);

      // ---------------------------------------------------------------------
      // 1 & 2. Database Stats (Counts & Sizes)
      // ---------------------------------------------------------------------
      let userCount = 0;
      let sessionCount = 0;
      let accountCount = 0;
      let dbSizeBytes = 0;
      let tableSizes: any[] = [];

      try {
        const getApproxCount = async (tableName: string) => {
          const res = await prisma.$queryRaw<Array<{ estimate: bigint }>>`
            SELECT reltuples::bigint as estimate
            FROM pg_class
            WHERE relname = ${tableName};
          `;
          if (res.length > 0 && Number(res[0].estimate) > 0) {
            return Number(res[0].estimate);
          }
          // Fallback to strict count for tiny/empty tables or generic errors
          return (prisma as any)[tableName.toLowerCase()]
            .count()
            .catch(() => 0);
        };

        [userCount, sessionCount, accountCount] = await Promise.all([
          getApproxCount("User"),
          getApproxCount("Session"),
          getApproxCount("Account"),
        ]);

        const dbSizeQuery = await prisma.$queryRaw<Array<{ size: bigint }>>`
                SELECT pg_database_size(current_database()) as size;
            `;
        dbSizeBytes = dbSizeQuery.length > 0 ? Number(dbSizeQuery[0].size) : 0;

        const tableSizesQuery = await prisma.$queryRaw<
          Array<{ table_name: string; total_size: bigint }>
        >`
                SELECT
                    relname as table_name,
                    pg_total_relation_size(relid) as total_size
                FROM pg_catalog.pg_statio_user_tables
                ORDER BY pg_total_relation_size(relid) DESC;
            `;
        tableSizes = tableSizesQuery.map((row: any) => ({
          tableName: row.table_name,
          sizeBytes: Number(row.total_size),
        }));
      } catch (dbError) {
        console.warn("Could not reach DB for stats, returning 0s:", dbError);
      }

      // ---------------------------------------------------------------------
      // 3. System Info
      // ---------------------------------------------------------------------
      const uptimeSeconds = process.uptime();
      const startTime = new Date(
        Date.now() - uptimeSeconds * 1000,
      ).toISOString();

      let appVersion = process.env.APP_VERSION || "development";
      try {
        const versionFilePath = path.join(
          process.cwd(),
          "public",
          "version.txt",
        );
        if (fs.existsSync(versionFilePath)) {
          appVersion = fs.readFileSync(versionFilePath, "utf-8").trim();
        }
      } catch (e) {
        console.warn("Could not read version.txt:", e);
      }

      const systemInfo = {
        gitHash: appVersion,
        containerRevision: process.env.K_REVISION || "local",
        nodeVersion: process.version,
        startTime: startTime,
        uptimeSeconds: Math.floor(uptimeSeconds),
      };

      return NextResponse.json({
        counts: {
          users: userCount,
          sessions: sessionCount,
          accounts: accountCount,
        },
        database: {
          totalSizeBytes: dbSizeBytes,
          tableSizes: tableSizes,
        },
        system: systemInfo,
      });
    } catch (error: any) {
      console.error("Error generating admin stats:", error);
      span.recordException(error);
      return NextResponse.json(
        { error: error.message || "Internal server error" },
        { status: 500 },
      );
    } finally {
      span.end();
    }
  });
}
