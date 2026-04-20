// Pass 12 — Rubric types for the per-category registry.
//
// These types are re-declared (not imported from `scripts/swarm/roles/critic`)
// so `lib/` does not take a dependency on `scripts/`. The shape is identical
// to `CriticInput["rubric"]` in `scripts/swarm/roles/critic.ts`; the critic's
// input type resolves to this same shape structurally, so values flow in
// either direction without an explicit cast.

export interface RubricCheck {
  id: string;
  description: string;
}

export interface Rubric {
  name: string;
  description: string;
  checks: RubricCheck[];
}
