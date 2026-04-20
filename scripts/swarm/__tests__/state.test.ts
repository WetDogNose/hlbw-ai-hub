import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { TaskStatus } from "../types";

// Pass 5: state-manager now uses Postgres (`@/lib/prisma`) for Task CRUD
// and keeps the JSON file as a best-effort snapshot. The tests below
// mock BOTH the Prisma client AND `node:fs/promises` so they can still
// exercise the old assertions without a live DB or a real state file.

type FakeIssue = {
  id: string;
  title: string | null;
  instruction: string;
  status: string;
  priority: number;
  dependencies: string[];
  blockedBy: string[];
  agentCategory: string | null;
  isolationId: string | null;
  assignedAgentLabel: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  metadata: unknown;
  threadId: string;
  assignedAgentId: string | null;
  goalId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const fixture = {
  issues: [] as FakeIssue[],
  defaultThreadId: "thread-default",
};

jest.mock("@/lib/prisma", () => {
  let nextId = 1;
  const client = {
    thread: {
      findFirst: async () => ({ id: fixture.defaultThreadId }),
      create: async () => ({ id: fixture.defaultThreadId }),
    },
    issue: {
      create: async ({ data }: any) => {
        const now = new Date();
        const issue: FakeIssue = {
          id: `issue-${nextId++}`,
          title: data.title ?? null,
          instruction: data.instruction,
          status: data.status ?? "pending",
          priority: data.priority ?? 5,
          dependencies: data.dependencies?.set ?? data.dependencies ?? [],
          blockedBy: data.blockedBy?.set ?? data.blockedBy ?? [],
          agentCategory: data.agentCategory ?? null,
          isolationId: data.isolationId ?? null,
          assignedAgentLabel: data.assignedAgentLabel ?? null,
          startedAt: data.startedAt ?? null,
          completedAt: data.completedAt ?? null,
          metadata: data.metadata ?? {},
          threadId: fixture.defaultThreadId,
          assignedAgentId: null,
          goalId: null,
          createdAt: now,
          updatedAt: now,
        };
        fixture.issues.push(issue);
        return issue;
      },
      findMany: async () => fixture.issues,
      findUnique: async ({ where: { id } }: any) =>
        fixture.issues.find((i) => i.id === id) ?? null,
      update: async ({ where: { id }, data }: any) => {
        const idx = fixture.issues.findIndex((i) => i.id === id);
        if (idx === -1) throw new Error(`not found: ${id}`);
        fixture.issues[idx] = { ...fixture.issues[idx], ...data };
        return fixture.issues[idx];
      },
      deleteMany: async () => ({ count: 0 }),
    },
  };
  return { __esModule: true, default: client };
});

jest.mock("node:fs/promises");
import fs from "node:fs/promises";
import * as stateManager from "../state-manager";

describe("State Manager Tasks", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    fixture.issues = [];
  });

  it("returns default state when JSON throws access error", async () => {
    jest.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
    jest
      .mocked(fs.readFile)
      .mockResolvedValue(JSON.stringify({ tasks: [], workers: [] }));

    const state = await stateManager.getState();
    expect(state).toHaveProperty("tasks");
  });

  it("adds a new task with pending status", async () => {
    jest
      .mocked(fs.readFile)
      .mockResolvedValue(JSON.stringify({ tasks: [], workers: [] }));

    const task = await stateManager.addTask({
      title: "Hello",
      description: "Test task",
      priority: 3,
      dependencies: [],
      metadata: {},
    });

    expect(task.status).toBe(TaskStatus.Pending);
    expect(fixture.issues.length).toBe(1);
    expect(fixture.issues[0].title).toBe("Hello");
  });
});
