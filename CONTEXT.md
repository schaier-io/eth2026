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
The immutable Swarm-hosted document defining the claim, YES/NO meaning, deadlines, jury size, and weighting mode.
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

**Conviction**:
The percentage of a voter stake that the voter is willing to risk.
_Avoid_: leverage

**Risked stake**:
The portion of a voter stake that can be slashed if the voter loses or fails to reveal.
_Avoid_: full stake unless conviction is 100%

**Slashed pool**:
The pool formed from risked stake lost by losing or non-revealing voters.
_Avoid_: loser pool

**SpaceComputer randomness**:
The cTRNG output used to select the resolving jury from committed voters.
_Avoid_: oracle result

**Protocol token**:
The token used for staking and, in the venture story, protocol fee/revenue share.
_Avoid_: governance token unless governance is explicitly added later

## Relationships

- A **Claim** has exactly one **Claim/rules document**.
- A **Claim/rules document** is stored on Swarm before voters stake.
- A voter creates one **Committed vote** per **Claim**.
- A **Committed vote** includes stake and **Conviction**.
- **Conviction** determines **Risked stake**.
- **SpaceComputer randomness** selects **Selected jurors** from committed voters.
- **Selected jurors** reveal to determine the market outcome.
- All voters reveal to settle their own stake.
- Losing or non-revealing voters contribute **Risked stake** to the **Slashed pool**.
- Winning voters receive returned stake plus a share of the **Slashed pool**.

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
- "Leverage" was used for user-selected risk. Resolved: use **Conviction** because no borrowing or liquidation is implied.
- "Oracle" appeared in contract wording. Resolved: avoid oracle language except when discussing rejected alternatives.
- Apify was originally part of the critical path. Resolved: Apify is optional and not core.

