# Architecture Review: Random Jury Belief Resolution

## Summary

The Solidity core matches the current random-jury belief-resolution model:

- product language no longer frames the contract as a fact-checker or truth oracle;
- claim metadata (`name`, `description`, up to `MAX_TAGS = 5` tags) is stored on-chain at deployment alongside the Swarm/IPFS rules pointer;
- commitments bind vote, nonce, voter address, chain id, and contract address inside the hash; stake/conviction are stored in contract state at commit time and are not part of the hash;
- voting-phase `revokeStake(voter, vote, nonce)` lets a third party claim a voter's full stake when their nonce leaks (see [ADR 0007](./adr/0007-nonce-leak-revocation.md)); self-revocation is blocked, and revocation is gated to the voting phase only;
- conviction is stored as a whole percent (0–100) and determines the risked portion of stake for the normal slash and the reward weight;
- losers and non-revealing non-jurors lose only their risked stake;
- jury outcome is count-based: each selected juror contributes 1 vote regardless of stake (see [ADR 0006](./adr/0006-count-based-jury-voting.md));
- selected jurors who fail to reveal forfeit their full stake — at typical conviction this is roughly 5× the normal slash;
- the extra above the normal 1× risked slash joins the distributable pool on a Yes/No outcome or accrues to the claim creator on Invalid;
- winner upside is distributed by risked stake;
- treasury collects protocol fees via `withdrawTreasury`; Invalid-path juror penalties accrue to the claim creator via `withdrawCreator`; dust may be swept to treasury after the grace window via bounded pagination;
- the old evidence event has been removed from the core contract.

Market parameters are locked at deployment (no separate setup tx); admin and jury committer are constructor-passed immutables (intended to become hardcoded constants once the production addresses are finalized).

Two audit-noted behaviors are intentional for the hackathon scope:

- `juryCommitter` is trusted to post the SpaceComputer cTRNG value and an audit hash. The jury draw is on-chain and replayable, but the posted randomness is not yet verified on-chain; see [ADR 0005](./adr/0005-spacecomputer-first-sponsor-strategy.md).
- `minRevealedJurors` is configurable and may be below strict majority. This is a liveness/market-quality parameter disclosed in the claim rules, not a hardcoded security invariant; see [ADR 0006](./adr/0006-count-based-jury-voting.md).

The code intentionally remains one contract for hackathon speed, but the internals are separated around commitment, reveal accounting, jury outcome, settlement, and payout.

## Remaining Architecture Work

### 1. Broaden Settlement Coverage

**Cluster:** conviction accounting, invalid outcome behavior, fee transfer, dust.

**Current state:** one lifecycle test covers mixed conviction, one non-revealer, one loser, two winners, treasury fee, and full withdrawal.

**Next tests:**

- low-conviction loser gets only risked stake slashed;
- full-conviction loser loses full stake;
- non-juror non-revealer gets refundable stake only (1× risked slash);
- selected juror non-revealer at low conviction still loses full stake (covered);
- no selected juror reveals → Invalid outcome, non-revealing jurors slashed full stake to the claim creator;
- tied selected juror counts on partial reveal → Invalid outcome, non-revealing jurors slashed full stake to the claim creator, revealing voters refunded;
- small-stake/low-conviction commits that would round risked stake to zero revert;
- extreme aggregate stake/revocation pools settle without `uint96` boundary reverts;
- paginated dust sweeping preserves unclaimed voter payouts.

### 2. Jury Selection Service Boundary

**Cluster:** SpaceComputer cTRNG fetch, committer list, deterministic selection, audit artifact, `commitJury`.

**Dependency category:** true external for SpaceComputer; mock at boundary.

**Recommended interface:** one service operation should close voting if needed, fetch randomness, persist a replayable audit artifact, and submit `commitJury`. For hackathon scope this service is trusted not to grind seeds. Production hardening should bind `commitJury` to a verifiable SpaceComputer proof or attestation.

### 3. Swarm Claim Rules Boundary

**Cluster:** claim/rules schema, Swarm upload/fetch, contract `swarmDocHash`, frontend rendering.

**Dependency category:** true external for Swarm; mock at boundary.

**Recommended interface:** a claim-document service should validate the PRD fields, upload to Swarm, fetch by reference, and give the contract only the immutable content reference.

### 4. Frontend Read Model

**Cluster:** public state getters (`phase`, `outcome`, `juryYesCount`, `juryNoCount`, `distributablePool`, `treasuryAccrued`, `randomness`, `juryAuditHash`, `commits`, `getJury`, `getCommitters`, `commitHashOf`).

**Recommended direction:** build the UI directly against the auto-generated getters; storage layout is stable and `commits[address]` exposes per-voter state. Add a small typed client wrapper once frontend work starts. Note the constructor takes a single `InitParams` struct — the bindings library should mirror that shape.

## Resolved Product Decisions

- **Juror non-reveal under Invalid:** previously open. Now resolved: selected jurors who fail to reveal are slashed their full stake on every post-jury-draw outcome. On Yes/No the slashed extra (above the normal 1× risked slash) flows to the distributable pool; on Invalid the full juror penalty accrues to the claim creator via the pull-pattern `withdrawCreator`. No-reveal at all paths to Invalid + creator accrual; Yes/No is unaffected by missing jurors beyond the slash.
- **Tie behavior on partial reveals:** Invalid; non-revealing jurors still slashed; revealing voters refunded.
- **Treasury fee delivery:** pull pattern via `withdrawTreasury`. Eliminates the resolve-time risk that a reverting treasury would brick the market.
