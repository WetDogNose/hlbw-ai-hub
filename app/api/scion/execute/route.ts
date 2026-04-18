import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { agentName, instruction } = await req.json();

    if (!agentName) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });
    }

    // New Paperclip Compliance check: check ledger budget total first
    const sumResult = await prisma.budgetLedger.aggregate({
      _sum: { tokensUsed: true }
    });

    const totalUsage = sumResult._sum.tokensUsed || 0;
    if (totalUsage > 5000000) {
      return NextResponse.json({ error: 'Budget Interception: Daily Token Limit Exceeded' }, { status: 429 });
    }

    // Now write to an Issue instead of headless exec
    const newThread = await prisma.thread.create({
      data: {
        title: `Manual execution: ${agentName}`,
        issues: {
          create: {
            instruction: instruction || "Execute default workflow",
            status: "OPEN"
          }
        }
      }
    });

    // In a real environment, this might invoke tasks asynchronously
    // For now, this triggers the thread to be picked up by the heartbeat.

    return NextResponse.json({ 
        message: 'Agent execution successfully queued', 
        threadId: newThread.id 
    });
  } catch (error: any) {
    console.error('Execution error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
