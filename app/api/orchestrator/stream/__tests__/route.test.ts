// Pass 16 — /api/orchestrator/stream SSE tests.
//
// Verifies:
//   1. First `transition` event is emitted within ~2s of opening.
//   2. A keep-alive comment is emitted after 15s of idle time.
//   3. 400 when `issueId` query param is missing.
//
// Implementation note: `fake-timers` + a mocked Prisma findUnique that
// drains a scripted queue per call.

import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

type HistoryEntry = {
  node: string;
  enteredAt: string;
  exitedAt: string;
  outcome: "ok" | "error" | "interrupt";
  detail?: string;
};

let historyQueue: HistoryEntry[][] = [];
const findUnique =
  jest.fn<
    (
      args: unknown,
    ) => Promise<{ history: HistoryEntry[]; status: string } | null>
  >();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    taskGraphState: {
      findUnique: (args: unknown) =>
        (
          findUnique as unknown as (
            a: unknown,
          ) => Promise<{ history: HistoryEntry[]; status: string } | null>
        )(args),
    },
  },
}));

import { GET, KEEPALIVE_COMMENT } from "../route";

async function readChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  opts: { untilIncludes?: string; timeoutMs?: number } = {},
): Promise<string> {
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + (opts.timeoutMs ?? 5000);
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    if (done) break;
    if (opts.untilIncludes && buf.includes(opts.untilIncludes)) break;
  }
  return buf;
}

function baseEntry(): HistoryEntry {
  return {
    node: "execute_step",
    enteredAt: "2026-04-19T00:00:00.000Z",
    exitedAt: "2026-04-19T00:00:01.000Z",
    outcome: "ok",
    detail: "-> record_observation",
  };
}

describe("GET /api/orchestrator/stream", () => {
  beforeEach(() => {
    historyQueue = [];
    findUnique.mockReset();
    findUnique.mockImplementation(async () => {
      const next = historyQueue.shift() ?? [];
      return { history: next, status: "running" };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 400 without issueId", async () => {
    const res = await GET(
      new Request("http://localhost/api/orchestrator/stream"),
    );
    expect(res.status).toBe(400);
  });

  it("emits the first transition event within 2 seconds", async () => {
    historyQueue = [[baseEntry()]];
    const req = new Request(
      "http://localhost/api/orchestrator/stream?issueId=i-1",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const reader = res.body!.getReader();
    const start = Date.now();
    const text = await readChunks(reader, {
      untilIncludes: "event: transition",
      timeoutMs: 2500,
    });
    const elapsed = Date.now() - start;
    expect(text).toContain("event: open");
    expect(text).toContain("event: transition");
    expect(text).toContain('"node":"execute_step"');
    expect(elapsed).toBeLessThan(2500);
    await reader.cancel();
  });

  it("emits a keep-alive comment after 15 seconds of idleness", async () => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "queueMicrotask"] });
    historyQueue = []; // nothing new ever
    const req = new Request(
      "http://localhost/api/orchestrator/stream?issueId=i-2",
    );
    const res = await GET(req);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    // Drain the initial "event: open" chunk so the next reader.read()
    // waits for new data (which arrives via the keep-alive interval).
    const first = await reader.read();
    if (first.value) buf += decoder.decode(first.value, { stream: true });
    expect(buf).toContain("event: open");

    // Advance past the first poll tick (1s); still no history.
    await jest.advanceTimersByTimeAsync(1000);
    // Advance past the 15s keep-alive tick.
    await jest.advanceTimersByTimeAsync(15_000);

    const second = await reader.read();
    if (second.value) buf += decoder.decode(second.value, { stream: true });

    expect(buf).toContain(KEEPALIVE_COMMENT);

    await reader.cancel();
    jest.useRealTimers();
  }, 20_000);
});
