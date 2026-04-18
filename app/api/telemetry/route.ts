import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentId, tokensUsed, issueId } = body;
    const costPerToken = 0.00001; 
    
    // Check if the payload is valid before recording
    if (!agentId || typeof tokensUsed !== 'number') {
        return NextResponse.json({ error: "Missing required telemetry fields" }, { status: 400 });
    }

    const ledger = await prisma.budgetLedger.create({
      data: {
        agentId,
        tokensUsed,
        issueId: issueId || null,
        cost: tokensUsed * costPerToken
      }
    });
    return NextResponse.json(ledger);
  } catch(error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
