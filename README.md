<p align="center">
  <img src="brand-mark.svg" alt="TruthMarket" width="120" />
</p>

# TruthMarket

TruthMarket is a random-jury belief-resolution protocol. Participants stake on immutable YES/NO claims, privately commit votes, SpaceComputer randomness selects a resolving jury, and revealed votes settle the market.

The protocol is not a fact-checking oracle and does not claim to discover objective truth. It resolves claims from selected staked voter belief under immutable claim rules.

## Hackathon Monorepo

This repository is the ETH 2026 hackathon monorepo for TruthMarket. It keeps the protocol contract, demo app, sponsor integrations, package experiments, and agent-facing documentation in one place so judges and teammates can inspect the full build without chasing separate repos.

Main workspaces:

- [`contracts`](./contracts): Solidity random-jury belief-resolution contract and tests.
- [`apps/web`](./apps/web): Next.js demo app.
- [`packages/swarm-verified-fetch`](./packages/swarm-verified-fetch): standalone `@truth-market/swarm-verified-fetch` TypeScript package for verified Swarm gateway reads, including immutable CAC/BMT verification, Mantaray manifest reads, and SOC/feed verification.
- [`packages/swarm-kv`](./packages/swarm-kv): Swarm feed/KV discovery package used for mutable indexes and read-model convenience.
- [`docs`](./docs): PRD, ADRs, architecture notes, and sponsor integration plans.

## Start Here

- [AGENTS.md](./AGENTS.md): operating guide for Codex, Claude, and other coding agents.
- [CONTEXT.md](./CONTEXT.md): canonical project language and domain model.
- [docs/INDEX.md](./docs/INDEX.md): full documentation index.
- [tasks.md](./tasks.md): compact agent-readable task board.
- [docs/random-jury-belief-resolution-prd.md](./docs/random-jury-belief-resolution-prd.md): product requirements.
- [docs/architecture-review.md](./docs/architecture-review.md): current code/PRD gap analysis.

## Run The Web App

The active UI is the Next.js app in `apps/web`:

```bash
cd apps/web
npm install
npm run dev
```

The legacy static prototype was removed so the app surface stays TypeScript/React and shares the wallet/contract integration path.

## Decisions

Architecture decisions live in [docs/adr](./docs/adr):

- Random-jury belief resolution, not oracle/fact-checking.
- Classic commit-reveal for voter sovereignty.
- Swarm for immutable claim/rules documents; clones store only the Swarm/Bee reference.
- Fixed 20% normal risked-stake slash; jury voting is count-based (1 juror = 1 vote, ADR 0006 supersedes the original square-root weighting).
- Selected jurors who skip reveal forfeit their full stake (~5× normal slash).
- Nonce-leak revocation (voting phase only): anyone with a voter's leaked nonce can claim half of that voter's stake; the other half flows into the slash pool — see ADR 0007.
- SpaceComputer-first sponsor strategy.

## Local Skills

Some planning used local design skills on one developer machine. Those skills are not required to work on the repo. The versioned docs above are the source of truth for teammates and their agents.
