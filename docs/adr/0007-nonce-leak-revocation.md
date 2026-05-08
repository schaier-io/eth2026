# Nonce-Leak Revocation

Status: accepted

A voter's commit hash is opened by the tuple `(vote, nonce, voter, address(this))`. The nonce is the only secret a voter holds during the voting phase. If a voter publishes or shares that nonce, the integrity of their committed vote breaks down — a third party knowing the nonce can predict and front-run the reveal, or worse, lobby the voter to reveal a particular way.

The contract therefore exposes `revokeStake(voter, vote, nonce)` during the voting phase only. Anyone who can produce a valid `(vote, nonce)` for `voter`'s commit can call it and claim that voter's full stake.

**Why this works as a deterrent**

- The only useful destination for a leaked nonce becomes the leaker's own pocket — no one else benefits from learning it.
- Voters are economically motivated to keep their nonce secret; the moment any third party has it, the voter's stake is at risk.
- The window is gated to the voting phase. After the voting deadline (and during/after reveal) revocation is no longer callable; once nonces enter their natural reveal window, the disclosure is no longer "leakage."

**Constraints**

- Self-revocation is blocked. Without that block, a voter could call `revokeStake` on themselves to recover their full stake before the slash mechanics could apply, defeating both the loss-on-wrong-vote and the juror-non-reveal penalties.
- Revoked commits cannot reveal and cannot withdraw. Aggregate `totalCommittedStake` and `totalRiskedStake` are decremented by the revoked entry's amounts; subsequent payout math treats the slot as if the voter were never there for purposes of slash/reward, while the address remains in `_committers` (the jury draw might still pick them, in which case they appear as an absent juror).

**Considered Alternatives**

- Burn the leaked stake (send to zero or the treasury) instead of paying the leaker: rejected because removing the personal incentive lets the leaker freely publish — they have nothing to gain from extracting it themselves but also nothing to lose from sharing.
- Allow self-revocation: rejected because it would let voters bypass the slash/penalty design.
- Revocation across all phases: rejected because by reveal phase the nonce is naturally about to be disclosed; allowing revocation there would let opponents grief late deciders.
