-- Pass 8: StateGraph runtime persistence. DO NOT apply automatically.
-- User must run: npx prisma migrate dev --name task_graph_state
-- Depends on: 20260420011457_init (Issue table), 20260420032326_memory_episode (not strictly required but chronologically prior).

-- CreateEnum
CREATE TYPE "GraphStateStatus" AS ENUM ('running', 'paused', 'interrupted', 'completed', 'failed');

-- CreateTable
CREATE TABLE "task_graph_state" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "currentNode" TEXT NOT NULL,
    "status" "GraphStateStatus" NOT NULL DEFAULT 'running',
    "context" JSONB NOT NULL DEFAULT '{}',
    "history" JSONB NOT NULL DEFAULT '[]',
    "interruptReason" TEXT,
    "lastTransitionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_graph_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_graph_state_issueId_key" ON "task_graph_state"("issueId");

-- CreateIndex
CREATE INDEX "task_graph_state_status_idx" ON "task_graph_state"("status");

-- CreateIndex
CREATE INDEX "task_graph_state_currentNode_idx" ON "task_graph_state"("currentNode");

-- AddForeignKey
ALTER TABLE "task_graph_state" ADD CONSTRAINT "task_graph_state_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
