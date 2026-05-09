# TruthMarket Context

TruthMarket is a random-jury belief-resolution protocol. Participants stake on immutable claims, privately commit votes, SpaceComputer randomness selects a resolving jury, and revealed votes settle the market.

## Language

**TruthMarket**:
The protocol for creating, voting on, randomly resolving, and settling belief markets.
_Avoid_: fact-checker, oracle

**Belief-resolution market**:
A market that resolves from selected staked voter beliefs rather than an external truth source.
_Avoid_: truth market, fact-checking market

**Claim**:
A YES/NO proposition with immutable rules that voters stake on.
_Avoid_: fact, truth claim

**Claim/rules document**:
The immutable Swarm-hosted document defining the claim, YES/NO meaning, deadlines, jury size, and risk model.
_Avoid_: evidence bundle, mutable metadata

**Committed vote**:
A hidden vote represented by a commitment hash during the voting phase.
_Avoid_: encrypted vote

**Reveal**:
The act of publishing the vote and nonce needed to prove a committed vote.
_Avoid_: decrypt

**Selected juror**:
A committed voter selected by SpaceComputer randomness to determine the market outcome.
_Avoid_: oracle, truth oracle

**Risked stake**:
The portion of a voter stake that can be slashed when the voter loses or, as a non-juror, fails to reveal. Selected jurors who skip reveal are slashed their FULL stake regardless of this value — see _Juror non-reveal slash_.
_Avoid_: user-selected risk controls

**Juror non-reveal slash**:
The penalty applied when a selected juror skips reveal. Equal to the juror's full stake. With the fixed 20% normal loss, this is 5× the normal loss. The extra above the normal 1× risked slash joins the distributable pool on Yes/No, or accrues to the claim creator on Invalid.
_Avoid_: 1× risked, partial slash for jurors

**Slashed pool**:
The pool formed from risked stake lost by losing or non-revealing voters, plus the juror full-stake extras. Distributed to winning revealers in proportion to their own risked stake (after the protocol fee).
_Avoid_: loser pool

**Jury vote**:
Each selected juror contributes one vote (1) to the YES/NO outcome. Stake does not influence the YES/NO decision.
_Avoid_: weighted vote, square-root vote, stake-based vote

**Claim metadata**:
The on-chain `name`, `description`, and up to five short `tags` stored at deployment so the claim is discoverable and self-describing without an off-chain fetch.
_Avoid_: confusing this with the Swarm/IPFS claim/rules document, which is the authoritative long-form reference

**Nonce-leak revocation**:
The `revokeStake` mechanism. Anyone who can prove knowledge of another voter's nonce during the voting phase can claim half of that voter's stake; the other half accrues to the slashed-stake pool (distributable on Yes/No, creator on Invalid). Disabled after the voting deadline; voters cannot revoke themselves. The 50/50 split also blocks Sybil self-withdraw with no penalty.
_Avoid_: "early withdrawal" — it is not a refund path for the original voter

**SpaceComputer randomness**:
The cTRNG output used to select the resolving jury from committed voters.
_Avoid_: oracle result

**Protocol token**:
The token used for staking and, in the venture story, protocol fee/revenue share.
_Avoid_: governance token unless governance is explicitly added later

## Relationships

- A **Claim** has exactly one **Claim/rules document**.
- A **Claim/rules document** is stored on Swarm before voters stake.
- A voter creates one **Committed vote** per **Claim** (one wallet → one commit, hard-enforced).
- A **Committed vote** includes stake.
- **Risked stake** is fixed at 20% of stake for normal losing/non-reveal paths.
- **SpaceComputer randomness** selects **Selected jurors** from committed voters via on-chain Fisher-Yates.
- **Selected jurors** reveal; the market outcome is the simple count majority of revealing jurors (one juror = one **Jury vote**).
- All voters reveal to settle their own stake.
- Losing voters and non-revealing non-jurors contribute **Risked stake** to the **Slashed pool**.
- Selected jurors who skip reveal contribute their **full stake** (the **Juror non-reveal slash**) — risked portion to the slashed pool, extra to the distributable pool on Yes/No or to the claim creator on Invalid.
- Winning voters receive returned stake plus a share of the **Slashed pool** weighted by their own risked stake.

## Example Dialogue

> **Dev:** "Can the operator reveal votes automatically?"
> **Domain expert:** "No. Votes use classic commit-reveal. The operator must not be able to decrypt or reveal for users."
>
> **Dev:** "So what decides the truth?"
> **Domain expert:** "Nothing external. The selected jurors decide the market outcome by revealed belief under the immutable claim rules."
>
> **Dev:** "Where does Swarm fit?"
> **Domain expert:** "Swarm stores the claim/rules document so the market rules cannot be quietly changed after voters stake."

## Flagged Ambiguities

- "Truth" was originally used as if the protocol discovers objective truth. Resolved: the protocol resolves selected juror belief, not objective truth.
- "Fact-checking agent" was originally treated as the protagonist. Resolved: agents may participate later, but the core protocol is voter/jury resolution.
- Earlier user-selected-risk terminology was removed. Resolved: normal slash is fixed at 20% of stake.
- "Oracle" appeared in contract wording. Resolved: avoid oracle language except when discussing rejected alternatives.
- Apify was originally part of the critical path. Resolved: Apify is optional and not core.
- "Jury weight" originally meant `sqrt(riskedStake)` per juror. Resolved (ADR 0006): each juror contributes 1 **Jury vote**; stake no longer affects the YES/NO decision.
