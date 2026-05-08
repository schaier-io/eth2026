# Nonce-Leak Revocation

Status: accepted

A voter's commit hash is opened by the tuple `(vote, nonce, voter, address(this))`. The nonce is the only secret a voter holds during the voting phase. If a voter publishes or shares that nonce, the integrity of their committed vote breaks down — a third party knowing the nonce can predict and front-run the reveal, or worse, lobby the voter to reveal a particular way.

The contract therefore exposes `revokeStake(voter, vote, nonce)` during the voting phase only. Anyone who can produce a valid `(vote, nonce)` for `voter`'s commit can call it. The voter's stake is split 50/50: half pays the claimer immediately, the other half accrues to `revokedSlashAccrued` and routes through the slash-pool plumbing at resolve (distributable pool on Yes/No, creator on Invalid).

**Why this works as a deterrent**

- A claimer with a leaked nonce still walks away with half the stake — enough to make them call the function rather than sit on the secret. They keep the entire pooled benefit if they're also a winning revealer when the slashed pool gets distributed.
- Voters are economically motivated to keep their nonce secret; the moment any third party has it, half the stake is gone instantly and the rest is at risk.
- The window is gated to the voting phase. After the voting deadline (and during/after reveal) revocation is no longer callable; once nonces enter their natural reveal window, the disclosure is no longer "leakage."

**Why 50/50 instead of 100% to the claimer**

Sending 100% of the stake to the caller would let a voter recover their stake with zero penalty by Sybil-revoking their own commit through a sock-puppet address. Splitting the stake 50/50 makes that workaround cost the voter at least half their stake — comparable to the 1× normal slash a typical losing voter would already absorb, and well above doing nothing during the voting phase. Self-revocation through `msg.sender == voter` is also blocked outright, so this only matters as a Sybil deterrent.

**Constraints**

- Self-revocation is blocked. Without that block, a voter could call `revokeStake` on themselves to recover their full stake before the slash mechanics could apply, defeating both the loss-on-wrong-vote and the juror-non-reveal penalties.
- Revoked commits cannot reveal and cannot withdraw. Aggregate `totalCommittedStake` and `totalRiskedStake` are decremented by the revoked entry's amounts; subsequent payout math treats the slot as if the voter were never there for purposes of slash/reward, while the address remains in `_committers` (the jury draw might still pick them, in which case they appear as an absent juror).

**Known interaction with the juror-non-reveal penalty**

A selected juror who realises mid-voting that they cannot reveal in time has a strictly cheaper exit through revoke than through silent non-reveal. Sketch: the juror feeds their own nonce to a sock-puppet address, which calls `revokeStake` and recovers 50% of stake (the other 50% goes to the slash pool). The protocol still slashes them — 50% of stake is materially more than the typical 1× `riskedStake` slash a non-juror loser absorbs (~20% at typical conviction) — but it is materially less than the **100% full-stake slash** a non-revealing juror would otherwise face. This is consistent with the design intent (any nonce leak is punished, including a deliberate self-leak), but operators should be aware that a known-unreliable juror set may use this path. The recommended mitigations are off-chain: pick jurors who are committed to revealing, and treat any pre-deadline revoke against a juror address as an early signal of trouble.

**Considered Alternatives**

- Burn the leaked stake entirely (send to zero or only the treasury) instead of paying any to the claimer: rejected because removing the personal incentive lets the leaker freely publish — they have nothing to gain from extracting it themselves but also nothing to lose from sharing. The 50/50 split keeps the claimer motivated.
- 100% to the claimer: rejected because it provides a clean Sybil self-withdraw path (a voter spins up a sock-puppet, "leaks" the nonce, and recovers full stake without the natural slash kicking in).
- Allow direct self-revocation: rejected because it would let voters bypass the slash/penalty design entirely.
- Revocation across all phases: rejected because by reveal phase the nonce is naturally about to be disclosed; allowing revocation there would let opponents grief late deciders.
