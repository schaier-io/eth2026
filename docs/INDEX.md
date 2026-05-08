# Documentation Index

This is the entry point for project context. Teammates and agents should use these files instead of relying on local-only design skills.

## Core Context

- [Agent Operating Guide](../AGENTS.md): instructions for Codex, Claude, and other agents.
- [Context](../CONTEXT.md): project language, canonical terms, and resolved ambiguities.
- [Task Plan](../tasks.md): staged implementation and hackathon plan.
- [PRD](./random-jury-belief-resolution-prd.md): product requirements for random-jury belief resolution.
- [Architecture Review](./architecture-review.md): current code gaps and recommended module boundaries.

## Decisions

- [ADR 0001](./adr/0001-random-jury-belief-resolution.md): use random-jury belief resolution, not fact-checking/oracle framing.
- [ADR 0002](./adr/0002-classic-commit-reveal.md): preserve voter sovereignty with classic commit-reveal.
- [ADR 0003](./adr/0003-swarm-claim-rules.md): use Swarm for immutable claim/rules documents.
- [ADR 0004](./adr/0004-conviction-weighting.md): use conviction and square-root weighting.
- [ADR 0005](./adr/0005-spacecomputer-first-sponsor-strategy.md): prioritize SpaceComputer as the core sponsor integration.

## Local Skill Provenance

The following local skills influenced the documents, but are not required to work on the repo:

- `grill-me`: used to stress-test the product frame.
- `to-prd`: used to structure the PRD.
- `improve-codebase-architecture`: used to review code/PRD architecture gaps.
- `domain-model`: used to capture canonical project language and ADRs.

The versioned documents above are the portable outputs. If a teammate does not have these skills installed, they can still use the repo normally.

## Current Implementation Status

The contract has been aligned with the first-pass PRD model: conviction-aware commitments, partial slashing, square-root jury weighting, and risk-weighted rewards. See [Architecture Review](./architecture-review.md) for remaining test and service boundaries.
