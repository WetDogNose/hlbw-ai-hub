import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  getDispatcher,
  resetDispatcherCache,
} from "@/lib/orchestration/dispatchers";

describe("getDispatcher (DISPATCHER_MODE)", () => {
  const originalMode = process.env.DISPATCHER_MODE;

  beforeEach(() => {
    resetDispatcherCache();
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.DISPATCHER_MODE;
    else process.env.DISPATCHER_MODE = originalMode;
    resetDispatcherCache();
  });

  it('defaults to "docker" when the env var is unset', () => {
    delete process.env.DISPATCHER_MODE;
    expect(getDispatcher().mode).toBe("docker");
  });

  it('returns the docker adapter when DISPATCHER_MODE="docker"', () => {
    process.env.DISPATCHER_MODE = "docker";
    expect(getDispatcher().mode).toBe("docker");
  });

  it('returns the noop adapter when DISPATCHER_MODE="noop"', () => {
    process.env.DISPATCHER_MODE = "noop";
    expect(getDispatcher().mode).toBe("noop");
  });

  it("falls back to noop on an unknown mode (fail-safe: refuses to claim work it can't execute)", () => {
    process.env.DISPATCHER_MODE = "kubernetes";
    expect(getDispatcher().mode).toBe("noop");
  });

  it("memoises per-mode so repeated calls return the same instance", () => {
    process.env.DISPATCHER_MODE = "docker";
    const a = getDispatcher();
    const b = getDispatcher();
    expect(a).toBe(b);
  });
});
