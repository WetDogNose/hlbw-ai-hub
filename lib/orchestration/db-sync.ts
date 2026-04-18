import prisma from "@/lib/prisma";

export async function lockIssueForWorkload(issueId: string, agentId: string) {
  return prisma.issue.update({
    where: { id: issueId },
    data: { status: "IN_PROGRESS", assignedAgentId: agentId },
  });
}

export async function unlockIssue(issueId: string, targetStatus: string = "PAUSED") {
  return prisma.issue.update({
    where: { id: issueId },
    data: { status: targetStatus },
  });
}
