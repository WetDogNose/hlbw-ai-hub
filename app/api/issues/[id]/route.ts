import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request, context: any) {
  try {
    // Properly await params based on Next.js 15+ routing requirements
    const { id } = await context.params;
    const issue = await prisma.issue.findUnique({ where: { id }, include: { thread: true, assignedAgent: true } });
    return NextResponse.json(issue);
  } catch(e: any) {
    return NextResponse.json({error: e.message}, {status: 500});
  }
}

export async function PATCH(req: Request, context: any) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const issue = await prisma.issue.update({ where: { id }, data: body });
    return NextResponse.json(issue);
  } catch(e: any) {
    return NextResponse.json({error: e.message}, {status: 500});
  }
}
