# Architecture Review: Random Jury Belief Resolution

## Summary

The Solidity core matches the current random-jury belief-resolution model:

- product language no longer frames the contract as a fact-checker or truth oracle;
- commitments bind vote, nonce, voter address, and contract address inside the hash; stake/conviction are stored in contract state at commit time and are not part of the hash;
- conviction is stored in basis points and determines the risked portion of stake for the normal slash and the reward weight;
- losers and non-revealing non-jurors lose only their risked stake;
- jury outcome is count-based: each selected juror contributes 1 vote regardless of stake (see [ADR 0006](./adr/0006-count-based-jury-voting.md));
- selected jurors who fail to reveal forfeit their full stake — at typical conviction this is roughly 5× the normal slash;
- the extra above the normal 1× risked slash joins the distributable pool on a Yes/No outcome or accrues to the treasury on Invalid;
- winner upside is distributed by risked stake;
- treasury collects fee + Invalid-path juror penalties via a pull pattern (`withdrawTreasury`); dust sweeps on the same call once every voter has withdrawn;
- the old evidence event has been removed from the core contract.

Market parameters are locked at deployment (no separate setup tx); admin and jury committer are constructor-passed immutables (intended to become hardcoded constants once the production addresses are finalized).

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
- no selected juror reveals → Invalid outcome, non-revealing jurors slashed full stake to treasury;
- tied selected juror counts on partial reveal → Invalid outcome, non-revealing jurors slashed full stake to treasury, revealing voters refunded;
- small-stake/low-conviction commits that would round risked stake to zero revert.

### 2. Jury Selection Service Boundary

**Cluster:** SpaceComputer cTRNG fetch, committer list, deterministic selection, audit artifact, `commitJury`.

**Dependency category:** true external for SpaceComputer; mock at boundary.

**Recommended interface:** one service operation should close voting if needed, fetch randomness, select jurors from `getCommitters`, persist a replayable audit artifact, and submit `commitJury`.

### 3. Swarm Claim Rules Boundary

**Cluster:** claim/rules schema, Swarm upload/fetch, contract `swarmDocHash`, frontend rendering.

**Dependency category:** true external for Swarm; mock at boundary.

**Recommended interface:** a claim-document service should validate the PRD fields, upload to Swarm, fetch by reference, and give the contract only the immutable content reference.

### 4. Frontend Read Model

**Cluster:** public state getters (`phase`, `outcome`, `juryYesCount`, `juryNoCount`, `distributablePool`, `treasuryAccrued`, `randomness`, `juryAuditHash`, `commits`, `getJury`, `getCommitters`, `commitHashOf`).

**Recommended direction:** build the UI directly against the auto-generated getters; storage layout is stable and `commits[address]` exposes per-voter state. Add a small typed client wrapper once frontend work starts. Note the constructor takes a single `InitParams` struct — the bindings library should mirror that shape.

## Resolved Product Decisions

- **Juror non-reveal under Invalid:** previously open. Now resolved: selected jurors who fail to reveal are slashed their full stake on every post-jury-draw outcome. On Yes/No the slashed extra (above the normal 1× risked slash) flows to the distributable pool; on Invalid the full juror penalty accrues to the treasury via the pull-pattern `withdrawTreasury`. No-reveal at all paths to Invalid + treasury accrual; Yes/No is unaffected by missing jurors beyond the slash.
- **Tie behavior on partial reveals:** Invalid; non-revealing jurors still slashed; revealing voters refunded.
- **Treasury fee delivery:** pull pattern via `withdrawTreasury`. Eliminates the resolve-time risk that a reverting treasury would brick the market.
