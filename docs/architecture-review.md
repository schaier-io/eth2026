# Architecture Review: Random Jury Belief Resolution

## Summary

The Solidity core matches the current random-jury belief-resolution model:

- product language no longer frames the contract as a fact-checker or truth oracle;
- claim metadata (`title`, detailed YES/NO context, optional tags) is stored in the immutable Swarm/Bee claim document; the clone stores only the claim/rules `swarmReference`;
- commitments bind vote, nonce, voter address, chain id, and contract address inside the hash; stake is stored in contract state at commit time and is not part of the hash;
- voting-phase `revokeStake(voter, vote, nonce)` lets a third party claim a voter's full stake when their nonce leaks (see [ADR 0007](./adr/0007-nonce-leak-revocation.md)); self-revocation is blocked, and revocation is gated to the voting phase only;
- normal risked stake is fixed at 20% of stake and determines the normal slash plus reward weight;
- losers and non-revealing non-jurors lose only their risked stake;
- jury outcome is count-based: each selected juror contributes 1 vote regardless of stake (see [ADR 0006](./adr/0006-count-based-jury-voting.md));
- selected jurors who fail to reveal forfeit their full stake — 5× the fixed 20% normal slash;
- the extra above the normal 1× risked slash joins the distributable pool on a Yes/No outcome or accrues to the claim creator on Invalid;
- winner upside is distributed by risked stake;
- treasury collects protocol fees via `withdrawTreasury`; Invalid-path juror penalties accrue to the claim creator via `withdrawCreator`; dust may be swept to treasury after the grace window via bounded pagination;
- the old evidence event has been removed from the core contract.

Market parameters are locked in the clone initializer. `MarketRegistry` deploys EIP-1167 minimal clones from one `TruthMarket` implementation, but every clone stores its own stake token, jury committer, creator, deadlines, and claim/rules reference.

Two audit-noted behaviors are intentional for the hackathon scope:

- The current jury draw is address-based and therefore not Sybil-resistant. Future production markets must add identity-backed or eligibility-backed jury entry before one-juror-one-vote resolution is treated as robust; see [ADR 0008](./adr/0008-identity-required-for-sybil-resistance.md).
- `juryCommitter` is trusted to post the SpaceComputer cTRNG value, beacon metadata, and an audit hash. The jury draw is on-chain and replayable, and the contract exposes `randomnessHash` plus `getRandomnessEvidence`, but the posted randomness is not yet verified on-chain; see [ADR 0005](./adr/0005-spacecomputer-first-sponsor-strategy.md).
- `minRevealedJurors` is configurable and may be below strict majority. This is a liveness/market-quality parameter disclosed in the claim rules, not a hardcoded security invariant; see [ADR 0006](./adr/0006-count-based-jury-voting.md).

The code intentionally remains one contract for hackathon speed, but the internals are separated around commitment, reveal accounting, jury outcome, settlement, and payout.

## Remaining Architecture Work

### 1. Broaden Settlement Coverage

**Cluster:** risk accounting, invalid outcome behavior, fee transfer, dust.

**Current state:** lifecycle tests cover fixed-risk slashing, non-revealers, losers, winners, treasury/creator accrual, and full withdrawal.

**Next tests:**

- losing non-juror gets only fixed risked stake slashed;
- non-juror non-revealer gets refundable stake only (1× risked slash);
- selected juror non-revealer loses full stake;
- no selected juror reveals → Invalid outcome, non-revealing jurors slashed full stake to the claim creator;
- tied selected juror counts on partial reveal → Invalid outcome, non-revealing jurors slashed full stake to the claim creator, revealing voters refunded;
- small-stake commits that would round risked stake to zero revert;
- extreme aggregate stake/revocation pools settle without `uint96` boundary reverts;
- paginated dust sweeping preserves unclaimed voter payouts.

### 2. Jury Selection Service Boundary

**Cluster:** SpaceComputer cTRNG fetch, committer list, deterministic selection, audit artifact, `commitJury`.

**Dependency category:** true external for SpaceComputer; mock at boundary.

**Recommended interface:** one service operation should close voting if needed, fetch randomness from the SpaceComputer IPFS/IPNS beacon, persist a replayable audit artifact, and submit `commitJury(randomness, metadata, auditHash)`, where `metadata` contains the beacon IPFS address, `data.sequence`, `data.timestamp`, and the selected `data.ctrng` index. For hackathon scope this service is trusted not to grind seeds. Production hardening should bind `commitJury` to a verifiable SpaceComputer proof or attestation.

### 3. Swarm Claim Rules Boundary

**Cluster:** claim/rules schema, Swarm upload/fetch, verified fetch, contract `swarmReference`, frontend rendering.

**Dependency category:** true external for Swarm; mock at boundary.

**Recommended interface:** a claim-document service should validate the PRD fields, upload one canonical Swarm KV document, fetch it by reference through verified fetch, and give the contract only the immutable content reference. Mutable Swarm feeds/KV should be used only for discovery indexes and cached read models. Opening a market from a feed must still verify the immutable contract-stored reference.

### 4. Agent Policy And Heartbeat Boundary

**Cluster:** agent policy, local reveal vault, heartbeat reminders, selected-juror reveal urgency, auto-withdraw.

**Dependency category:** local agent automation; Swarm is public artifact storage only.

**Recommended interface:** agents should use explicit local policy before committing, keep unrevealed votes and nonces out of Swarm, schedule a heartbeat after commit, auto-reveal from the local vault when policy allows, and auto-withdraw after resolution when policy allows.

### 5. Frontend Read Model

**Cluster:** public state getters (`phase`, `outcome`, `juryYesCount`, `juryNoCount`, `distributablePool`, `treasuryAccrued`, `swarmReference`, `randomness`, `randomnessHash`, `randomnessIpfsAddress`, `randomnessSequence`, `randomnessTimestamp`, `randomnessIndex`, `juryAuditHash`, `getRandomnessEvidence`, `commits`, `previewPayout`, `getJury`, `getCommitters`, `commitHashOf`).

**Recommended direction:** build the UI directly against the auto-generated getters; storage layout is stable and `commits[address]` exposes per-voter state. Add a small typed client wrapper once frontend work starts. New markets are created through `MarketRegistry.createMarket(MarketSpec)`, which initializes the clone.

## Resolved Product Decisions

- **Juror non-reveal under Invalid:** previously open. Now resolved: selected jurors who fail to reveal are slashed their full stake on every post-jury-draw outcome. On Yes/No the slashed extra (above the normal 1× risked slash) flows to the distributable pool; on Invalid the full juror penalty accrues to the claim creator via the pull-pattern `withdrawCreator`. No-reveal at all paths to Invalid + creator accrual; Yes/No is unaffected by missing jurors beyond the slash.
- **Tie behavior on partial reveals:** Invalid; non-revealing jurors still slashed; revealing voters refunded.
- **Treasury fee delivery:** pull pattern via `withdrawTreasury`. Eliminates the resolve-time risk that a reverting treasury would brick the market.
