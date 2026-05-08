# TruthMarket

TruthMarket is a random-jury belief-resolution protocol. Participants stake on immutable YES/NO claims, privately commit votes, SpaceComputer randomness selects a resolving jury, and revealed votes settle the market.

The protocol is not a fact-checking oracle and does not claim to discover objective truth. It resolves claims from selected staked voter belief under immutable claim rules.

## Start Here

- [AGENTS.md](./AGENTS.md): operating guide for Codex, Claude, and other coding agents.
- [CONTEXT.md](./CONTEXT.md): canonical project language and domain model.
- [docs/INDEX.md](./docs/INDEX.md): full documentation index.
- [tasks.md](./tasks.md): staged hackathon execution plan.
- [docs/random-jury-belief-resolution-prd.md](./docs/random-jury-belief-resolution-prd.md): product requirements.
- [docs/architecture-review.md](./docs/architecture-review.md): current code/PRD gap analysis.

## Decisions

Architecture decisions live in [docs/adr](./docs/adr):

- Random-jury belief resolution, not oracle/fact-checking.
- Classic commit-reveal for voter sovereignty.
- Swarm for immutable claim/rules documents.
- Conviction and square-root weighting.
- SpaceComputer-first sponsor strategy.

## Local Skills

Some planning used local design skills on one developer machine. Those skills are not required to work on the repo. The versioned docs above are the source of truth for teammates and their agents.

