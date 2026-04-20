// Pass 19 — No-op TurnCritic implementation.
//
// Records turn snapshots and computed advantages as `MemoryEpisode` rows
// (`kind: "entity"`, discriminated via `content.kind`). This reuses the
// pass-15 storage convention so no schema change is required.
//
// The Noop implementation makes NO policy updates and performs NO gradient
// descent. `estimateValue` returns 0 for every snapshot; `computeAdvantage`
// therefore reduces to `advantage = reward`.
//
// SDK signatures verified against:
//   lib/orchestration/memory/MemoryStore.ts — `MemoryStore.write`.
//   lib/orchestration/memory/PgvectorMemoryStore.ts — `getPgvectorMemoryStore`.

import type {
  MemoryStore,
  WriteEpisodeInput,
} from "@/lib/orchestration/memory/MemoryStore";
import { getPgvectorMemoryStore } from "@/lib/orchestration/memory/PgvectorMemoryStore";
import type { TurnAdvantage, TurnCritic, TurnSnapshot } from "./types";

const DEFAULT_GAMMA = 0.99;

function nowIso(): string {
  return new Date().toISOString();
}

function makeTurnId(taskId: string, index: number, at: string): string {
  return `turn_${taskId}_${index}_${at}`;
}

export class NoopTurnCritic implements TurnCritic {
  readonly name = "noop";

  constructor(private readonly store: MemoryStore = getPgvectorMemoryStore()) {}

  async recordTurn(snap: TurnSnapshot): Promise<void> {
    const input: WriteEpisodeInput = {
      taskId: snap.taskId,
      kind: "entity",
      agentCategory: null,
      summary: `turn_snapshot:${snap.role}:${snap.node}:${snap.outcome}`,
      content: {
        kind: "turn_snapshot",
        ...snap,
      },
    };
    await this.store.write(input);
  }

  async estimateValue(_snap: TurnSnapshot): Promise<number> {
    return 0;
  }

  async computeAdvantage(
    history: TurnSnapshot[],
    rewards: number[],
  ): Promise<TurnAdvantage[]> {
    const computedAt = nowIso();
    const defaultTaskId = history[0]?.taskId ?? "unknown";
    const out: TurnAdvantage[] = [];
    for (let i = 0; i < rewards.length; i++) {
      const reward = rewards[i];
      const scopedTaskId = history[i]?.taskId ?? defaultTaskId;
      const record: TurnAdvantage = {
        turnId: makeTurnId(scopedTaskId, i, computedAt),
        taskId: scopedTaskId,
        turnIndex: i,
        reward,
        predictedValue: 0,
        advantage: reward - 0,
        gamma: DEFAULT_GAMMA,
        computedAt,
      };
      out.push(record);
      const input: WriteEpisodeInput = {
        taskId: scopedTaskId,
        kind: "entity",
        agentCategory: null,
        summary: `turn_advantage:${i}:reward=${reward}`,
        content: {
          kind: "turn_advantage",
          ...record,
        },
      };
      await this.store.write(input);
    }
    return out;
  }

  async close(): Promise<void> {
    // No-op; MemoryStore lifecycle is managed by the process-level singleton.
  }
}
