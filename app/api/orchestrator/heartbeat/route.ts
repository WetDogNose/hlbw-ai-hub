import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // 1. Fetch routines
    const routines = await prisma.routine.findMany({ where: { isActive: true }});
    
    // 2. Scan for hung issues
    const hungIssues = await prisma.issue.findMany({ where: { status: "IN_PROGRESS" }});
    
    // 3. In a real environment, trigger child processes or external microservices here.
    return NextResponse.json({ message: "Heartbeat complete", routinesCount: routines.length, hungCount: hungIssues.length });
  } catch(error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
