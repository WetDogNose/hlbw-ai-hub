// Pass 19 — hashState unit tests.

import { describe, expect, it } from "@jest/globals";
import { hashState } from "../hash";

describe("hashState", () => {
  it("returns exactly 16 characters", () => {
    const out = hashState({ a: 1, b: "two" });
    expect(out).toHaveLength(16);
  });

  it("is deterministic: same input -> same output", () => {
    const ctx = { taskId: "t1", node: "x", arr: [1, 2, 3] };
    expect(hashState(ctx)).toBe(hashState(ctx));
  });

  it("different inputs -> different outputs", () => {
    const a = hashState({ taskId: "t1", node: "x" });
    const b = hashState({ taskId: "t2", node: "x" });
    expect(a).not.toBe(b);
  });

  it("handles unserializable input without throwing", () => {
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(() => hashState(circ)).not.toThrow();
    expect(hashState(circ)).toHaveLength(16);
  });

  it("returns hex characters only", () => {
    const out = hashState({ foo: "bar" });
    expect(out).toMatch(/^[0-9a-f]{16}$/);
  });
});
