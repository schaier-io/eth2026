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

## Current Code Status

The Solidity contract is aligned with the current PRD model:

- normal losing/non-reveal risk is fixed at 20% of stake (`RISK_PERCENT`);
- commitment hash binds vote, nonce, voter address, chain id, and contract address;
- partial slashing on losing voters and non-revealing non-jurors (1× risked stake);
- count-based jury outcome (each selected juror = 1 vote, [ADR 0006](./docs/adr/0006-count-based-jury-voting.md));
- selected jurors who fail to reveal forfeit their full stake (~5× the normal slash);
- risked-stake-weighted reward distribution to winning revealers;
- treasury fee on Yes/No → `treasuryAccrued`; Invalid-path juror penalty → `creatorAccrued`; both pull-pattern;
- on-chain claim metadata (name, description, ≤5 tags) stored at deployment;
- nonce-leak revocation (`revokeStake`) callable in voting phase only — see [ADR 0007](./docs/adr/0007-nonce-leak-revocation.md);
- no fact-checker/oracle wording in contract or events.
