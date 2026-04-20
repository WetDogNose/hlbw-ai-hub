// Pass 19 — Turn-PPO seam: type contract only. No training, no gradients.
//
// Per decisions.md D2 this pass builds the seam so a future PPO
// implementation can plug in without re-architecting the orchestrator. The
// `NoopTurnCritic` default writes turn snapshots and computed advantages
// through `MemoryStore` as `MemoryEpisode` rows (`kind: "entity"` with a
// discriminated `content.kind`), matching the pass-15 pattern used for code
// symbols. No Prisma schema change required.

/**
 * Snapshot of a single Actor/Critic (or graph-node) turn. Captured at turn
 * boundaries by the orchestrator hook and the StateGraph hook. Role carries
 * the SPAN_ROLE convention from `lib/orchestration/tracing/attrs.ts`.
 *
 * `stateHash` is a 16-char collision-avoidance identifier derived from the
 * RunnerContext / GraphContext at turn start via `hashState`. It is NOT
 * cryptographically sensitive — do not use it as an auth token.
 */
export interface TurnSnapshot {
  taskId: string;
  issueId: string;
  node: string;
  role: "actor" | "critic" | "orchestrator" | "explorer";
  stateHash: string;
  action: { kind: string; summary: string };
  outcome: "ok" | "error" | "interrupt";
  rewardSignal?: number;
  tokensUsed?: { input: number; output: number };
  durationMs: number;
  modelId: string;
  timestamp: string; // ISO-8601
}

/**
 * Advantage record computed at the end of an Actor/Critic loop (best-effort
 * mapping from Critic confidence to reward). `predictedValue` is 0 until a
 * real value model exists; `advantage = reward - predictedValue` therefore
 * collapses to `reward` in the Noop implementation.
 */
export interface TurnAdvantage {
  turnId: string;
  taskId: string;
  turnIndex: number;
  reward: number;
  predictedValue: number;
  advantage: number;
  gamma: number;
  computedAt: string; // ISO-8601
}

/**
 * Future RL implementations implement this interface. The factory in
 * `./index.ts` selects the concrete implementation based on env var once a
 * real implementation exists; the default is `NoopTurnCritic`.
 */
export interface TurnCritic {
  readonly name: string;
  recordTurn(snap: TurnSnapshot): Promise<void>;
  estimateValue(snap: TurnSnapshot): Promise<number>;
  computeAdvantage(
    history: TurnSnapshot[],
    rewards: number[],
  ): Promise<TurnAdvantage[]>;
  close?(): Promise<void>;
}
