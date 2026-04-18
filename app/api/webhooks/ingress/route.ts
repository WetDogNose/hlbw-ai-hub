import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    // Provide a generic webhook thread ingress logic
    const newThread = await prisma.thread.create({
      data: {
        title: "Webhook Ingress: " + new Date().toISOString(),
        issues: {
          create: {
            instruction: JSON.stringify(data),
            status: "OPEN"
          }
        }
      }
    });
    return NextResponse.json({ success: true, threadId: newThread.id });
  } catch(error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
