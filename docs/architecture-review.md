# Architecture Review: Random Jury Belief Resolution

## Summary

The Solidity core now matches the first-pass random-jury belief-resolution model:

- product language no longer frames the contract as a fact-checker or truth oracle;
- commitments include claim id, vote, nonce, stake, conviction, voter, and contract address;
- conviction is stored in basis points and determines the risked portion of stake;
- losers and non-revealers lose only their risked stake;
- selected juror resolution uses square-root weighting over risked stake;
- winner upside is distributed by risked stake instead of commit order;
- the old evidence event has been removed from the core contract.

The code intentionally remains one contract for hackathon speed, but the internals are separated around commitment, reveal accounting, jury outcome, settlement, and payout.

## Remaining Architecture Work

### 1. Broaden Settlement Coverage

**Cluster:** conviction accounting, invalid outcome behavior, fee transfer, dust.

**Current state:** one lifecycle test covers mixed conviction, one non-revealer, one loser, two winners, treasury fee, and full withdrawal.

**Next tests:**

- low-conviction loser gets only risked stake slashed;
- full-conviction loser loses full stake;
- non-revealer gets refundable stake only;
- no selected juror reveals -> invalid outcome and full refund;
- tied selected juror weights -> invalid outcome and full refund;
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

**Cluster:** `claimStatus`, `claimTotals`, `claimWeights`, `commits`, `getJury`, `juryAuditRef`.

**Current state:** the contract exposes smaller read helpers instead of the full storage struct getter.

**Recommended direction:** build the UI against those helpers and avoid relying on private storage shape. Add a small typed client wrapper once frontend work starts.

## Open Product Decision

The current contract treats both no-juror-reveal and tied selected-juror weights as `Invalid`, which refunds every committer in full. If the demo wants selected jurors penalized for failing to reveal even when the market is invalid, settlement semantics need one more rule change.
