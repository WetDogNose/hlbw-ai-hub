// Verifies `dispatchReadyIssues` short-circuits in DISPATCHER_MODE=noop
// without touching the DB. The prior bug: noop mode would still claim an
// Issue, the noop launch would throw, and the Issue would get rolled back
// on every heartbeat — burning DB round-trips to churn the same row.

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

// Import prisma via the app alias so we can assert it was never called.
jest.mock("@/lib/prisma", () => {
  const queryRaw = jest.fn();
  const transaction = jest.fn();
  const updateMany = jest.fn();
  const update = jest.fn();
  return {
    __esModule: true,
    default: {
      $queryRaw: queryRaw,
      $transaction: transaction,
      issue: { update, updateMany },
    },
  };
});

import prisma from "@/lib/prisma";
import { dispatchReadyIssues } from "@/lib/orchestration/dispatcher";
import { resetDispatcherCache } from "@/lib/orchestration/dispatchers";

describe("dispatchReadyIssues in DISPATCHER_MODE=noop", () => {
  const originalMode = process.env.DISPATCHER_MODE;

  beforeEach(() => {
    process.env.DISPATCHER_MODE = "noop";
    resetDispatcherCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.DISPATCHER_MODE;
    else process.env.DISPATCHER_MODE = originalMode;
    resetDispatcherCache();
  });

  it("returns an empty array and never touches the DB", async () => {
    const result = await dispatchReadyIssues(5);
    expect(result).toEqual([]);

    expect((prisma as any).$transaction).not.toHaveBeenCalled();

    expect((prisma as any).$queryRaw).not.toHaveBeenCalled();

    expect((prisma as any).issue.update).not.toHaveBeenCalled();
  });
});
