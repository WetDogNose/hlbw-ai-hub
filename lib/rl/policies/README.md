# Turn-PPO policies (pass-19 seam)

This directory is the landing pad for a future Turn-level PPO implementation.
Pass 19 only builds the *seam*: the `TurnCritic` interface
(`lib/rl/types.ts`), the `NoopTurnCritic` default
(`lib/rl/NoopTurnCritic.ts`), and the orchestrator + StateGraph callback
hooks. No training code, no gradients, no policy network ships in this
pass — per `docs/re-arch/decisions.md` D2.

## What a real PPO implementation looks like

A concrete `PpoTurnCritic implements TurnCritic` would:

1. Maintain a value network `V(s)` over the `TurnSnapshot.stateHash` feature
   (or a richer embedding of the snapshot — hashing is the no-op fallback).
2. On `recordTurn(snap)`, append the snapshot to an on-disk or in-memory
   rollout buffer keyed by `taskId`.
3. On `computeAdvantage(history, rewards)`, compute Generalized Advantage
   Estimation (GAE) using `gamma` (discount) and `lambda` (trace decay).
4. On a scheduled tick (not per-turn — PPO is offline w.r.t. the
   orchestrator), sample mini-batches from the buffer and run the PPO update
   with clipped surrogate objective.
5. Persist the policy checkpoint under `lib/rl/policies/checkpoints/` (add
   to `.gitignore` for large files).

## Three key numerical knobs

| Knob | Symbol | Typical range | Effect |
| --- | --- | --- | --- |
| Learning rate | `alpha` | `1e-5` to `3e-4` | Policy / value network step size. Too high destabilises; too low stalls. |
| Clip epsilon | `clip_eps` | `0.1` to `0.3` | PPO surrogate clip. Hard-caps per-update policy drift — the core PPO invariant. |
| Discount factor | `gamma` | `0.95` to `0.999` | How far into the future reward propagates. The seam hard-codes `0.99` as the default in `TurnAdvantage.gamma`. |

A fourth commonly tuned knob — GAE trace decay `lambda` (≈ `0.95`) — is
typically set once and left alone.

## How the seam lets a new `TurnCritic` plug in

The orchestrator and the StateGraph both call `getTurnCritic()` from
`@/lib/rl` and then invoke `.recordTurn(...)` / `.computeAdvantage(...)`.
Neither caller knows or cares which implementation backs the interface.

To swap in a PPO implementation:

1. Add `lib/rl/PpoTurnCritic.ts` implementing `TurnCritic`.
2. Update the factory in `lib/rl/index.ts` to branch on `TURN_CRITIC`:
   ```typescript
   if (process.env.TURN_CRITIC === 'ppo_v1') {
     singleton = new PpoTurnCritic();
   } else {
     singleton = new NoopTurnCritic();
   }
   ```
3. Deploy with `TURN_CRITIC=ppo_v1`.

No orchestrator code changes. No StateGraph changes. No API breakage. The
seam is the whole point of this pass.

## Reference

The user's original brief cites the Turn-PPO paradigm from recent agentic-RL
literature — turn-level advantage signals instead of token-level, so the
reward can be the Critic's rubric confidence rather than a per-token logprob.
When this directory gains a real implementation, cite the specific paper in
the `PpoTurnCritic.ts` header.
