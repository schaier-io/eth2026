# Agent Operating Guide

This repository is meant to be usable by teammates running Codex, Claude, or another coding agent without the local design skills installed on this machine.

## First Files To Read

Before making product or architecture changes, read these files in order:

1. [CONTEXT.md](./CONTEXT.md) — project language and domain model.
2. [docs/INDEX.md](./docs/INDEX.md) — documentation map.
3. [docs/adr/](./docs/adr/) — accepted architecture and product decisions.
4. [tasks.md](./tasks.md) — staged execution plan.
5. [docs/random-jury-belief-resolution-prd.md](./docs/random-jury-belief-resolution-prd.md) — PRD.
6. [docs/architecture-review.md](./docs/architecture-review.md) — current code/PRD gap analysis.

## Current Product Frame

TruthMarket is a random-jury belief-resolution protocol. It is not a fact-checking product, not an oracle, and not an external truth source.

Use this language:

- "random-jury belief resolution"
- "immutable claim/rules document"
- "committed vote"
- "selected juror"
- "conviction"
- "risked stake"
- "slashed pool"

Avoid this language unless discussing rejected alternatives:

- "fact-checking oracle"
- "source of truth"
- "operator reveals votes"
- "Apify decides the outcome"

## Local Skills

Some earlier planning used local design skills such as:

- `grill-me`
- `to-prd`
- `improve-codebase-architecture`
- `domain-model`

Those skills are not required to work on this repo. Their outputs have been copied into versioned documentation. Do not assume a teammate has the same local skills installed.

If an agent does have similar skills available, it may use them, but repo files are authoritative.

## Implementation Guardrails

- Preserve classic commit-reveal. The operator must not be able to decrypt or reveal votes.
- Keep Swarm focused on immutable claim/rules documents.
- Keep SpaceComputer randomness central to jury selection.
- Keep Apify optional and out of the critical path.
- Treat Sourcify as optional verification hygiene.
- Do not reintroduce oracle/fact-checker framing into product docs or code comments.
- Update ADRs when a decision is hard to reverse, surprising without context, and based on a real trade-off.

## Current Code Caveat

The current Solidity contract still reflects parts of the older model. Before building frontend or services, align the contract with the PRD:

- add conviction to committed positions;
- update commitment preimage;
- implement partial slashing;
- replace raw stake jury totals with square-root conviction weighting;
- replace commit-order reward weighting with risked-stake/conviction reward weighting;
- remove fact-checker/oracle wording.

