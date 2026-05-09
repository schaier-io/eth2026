# Documentation Index

This is the entry point for project context. Teammates and agents should use these files instead of relying on local-only design skills.

## Core Context

- [Agent Operating Guide](../AGENTS.md): instructions for Codex, Claude, and other agents.
- [Context](../CONTEXT.md): project language, canonical terms, and resolved ambiguities.
- [Root README](../README.md): hackathon monorepo overview and workspace map.
- [Task Plan](../tasks.md): staged implementation and hackathon plan.
- [PRD](./random-jury-belief-resolution-prd.md): product requirements for random-jury belief resolution.
- [Architecture Review](./architecture-review.md): current code gaps and recommended module boundaries.
- [Swarm Integration Plan](./swarm-integration-plan.md): minimal Swarm build plan for immutable rules, verified fetch, KV discovery, and audit artifacts.

## Decisions

- [ADR 0001](./adr/0001-random-jury-belief-resolution.md): use random-jury belief resolution, not fact-checking/oracle framing.
- [ADR 0002](./adr/0002-classic-commit-reveal.md): preserve voter sovereignty with classic commit-reveal.
- [ADR 0003](./adr/0003-swarm-claim-rules.md): use Swarm for immutable claim/rules documents.
- [ADR 0004](./adr/0004-superseded-square-root-weighting.md): superseded square-root risk weighting.
- [ADR 0005](./adr/0005-spacecomputer-first-sponsor-strategy.md): prioritize SpaceComputer as the core sponsor integration.
- [ADR 0006](./adr/0006-count-based-jury-voting.md): one-juror-one-vote outcome with full-stake juror non-reveal penalty.
- [ADR 0007](./adr/0007-nonce-leak-revocation.md): voting-phase `revokeStake` lets anyone with a leaked nonce claim the voter's stake.
- [ADR 0008](./adr/0008-identity-required-for-sybil-resistance.md): future production jury entry requires identity-backed Sybil resistance.
- [ADR 0009](./adr/0009-swarm-verification-and-discovery-boundaries.md): separate immutable Swarm verification from mutable KV/feed discovery.
- [ADR 0010](./adr/0010-agent-policy-heartbeat-and-auto-reveal.md): require explicit agent policy, local reveal vaults, heartbeat monitoring, and agent-side auto-reveal.

## Local Skill Provenance

Repo-local skill files live in [../.agents/skills](../.agents/skills). The `truthmarket-agent` skill captures the portable agent workflow for Swarm verification, local policy, heartbeat monitoring, and auto-reveal.

The following local skills influenced the documents, but are not required to work on the repo:

- `grill-me`: used to stress-test the product frame.
- `to-prd`: used to structure the PRD.
- `improve-codebase-architecture`: used to review code/PRD architecture gaps.
- `domain-model`: used to capture canonical project language and ADRs.

The versioned documents above are the portable outputs. If a teammate does not have these skills installed, they can still use the repo normally.

## Current Implementation Status

The contract has been aligned with the current PRD model: fixed 20% normal slashing on losers/non-revealers, count-based jury voting (1 vote per selected juror), full-stake slash for non-revealing jurors, and risk-weighted rewards for winning revealers. See [Architecture Review](./architecture-review.md) for remaining test and service boundaries.

The monorepo also contains [`packages/swarm-verified-fetch`](../packages/swarm-verified-fetch), a standalone `@truth-market/swarm-verified-fetch` package for the Swarm verified-fetch bounty. It verifies immutable CAC/BMT byte trees, Mantaray manifest paths, and SOC/feed mutable reads without trusting a gateway.
