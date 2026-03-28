import { NextResponse } from "next/server";
import { getIapUser } from "@/lib/iap-auth";
import { Logging } from "@google-cloud/logging";

export async function GET(request: Request) {
  try {
    const userRole = await getIapUser();
    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const hoursAgo = parseInt(searchParams.get("hoursAgo") || "1", 10);
    const severity = searchParams.get("severity") || "ALL";

    const logging = new Logging();

    const date = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    let filter = `timestamp >= "${date.toISOString()}"`;

    if (severity !== "ALL") {
      if (severity === "ERROR") {
        filter += ` AND severity >= ERROR`;
      } else if (severity === "WARNING") {
        filter += ` AND severity >= WARNING`;
      } else {
        filter += ` AND severity = "${severity}"`;
      }
    }

    try {
      const [entries] = await logging.getEntries({
        filter: filter,
        orderBy: "timestamp desc",
        pageSize: 100,
      });

      const formattedLogs = entries.map((entry: any) => ({
        id: entry.metadata.insertId || Math.random().toString(),
        timestamp:
          entry.metadata.timestamp instanceof Date
            ? entry.metadata.timestamp.toISOString()
            : entry.metadata.timestamp?.seconds
              ? new Date(entry.metadata.timestamp.seconds * 1000).toISOString()
              : new Date().toISOString(),
        severity: entry.metadata.severity || "DEFAULT",
        message:
          entry.data?.message ||
          (typeof entry.data === "string"
            ? entry.data
            : JSON.stringify(entry.data)) ||
          "No message",
        source: entry.metadata.resource?.type || "unknown",
      }));

      return NextResponse.json({ logs: formattedLogs });
    } catch (e: any) {
      console.warn("Cloud Logging could not be fetched:", e.message);
      return NextResponse.json({
        logs: [
          {
            id: "mock-1",
            timestamp: new Date().toISOString(),
            severity: "WARNING",
            message: `Google Cloud Logging could not be fetched: ${e.message}`,
            source: "system",
          },
        ],
      });
    }
  } catch (error) {
    console.error("Logs fetch error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
