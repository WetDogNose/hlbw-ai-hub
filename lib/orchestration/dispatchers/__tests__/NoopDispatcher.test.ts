import { describe, it, expect } from "@jest/globals";
import { NoopDispatcher } from "@/lib/orchestration/dispatchers/NoopDispatcher";
import { DispatcherUnavailableError } from "@/lib/orchestration/dispatchers/types";

describe("NoopDispatcher", () => {
  it('reports mode === "noop"', () => {
    expect(new NoopDispatcher().mode).toBe("noop");
  });

  it("throws DispatcherUnavailableError when anything tries to launch", async () => {
    const d = new NoopDispatcher();
    await expect(
      d.launch({
        taskId: "t1",
        instruction: "do a thing",
        branchName: "issue/t1",
        agentCategory: "default",
      }),
    ).rejects.toBeInstanceOf(DispatcherUnavailableError);
  });
});
