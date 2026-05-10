# Count-Based Jury Voting And Full-Stake Juror Non-Reveal Penalty

Status: accepted (supersedes [ADR 0004](./0004-superseded-square-root-weighting.md))

Each selected juror contributes exactly one vote to the YES/NO outcome regardless of stake. Stake controls absolute economic exposure and reward share, but jury voting power is decoupled from money.

**Considered Options**

- Square-root stake/risk weighting (originally accepted in ADR 0004): rejected after revisiting. Coupling vote weight to economic exposure lets large stakers still meaningfully dominate jury outcomes — the sublinear curve flattens influence but does not separate it from capital. It also conflates two distinct roles (voting weight and economic exposure) that are clearer when separated.
- Linear stake weighting: rejected for the same whale-dominance reason that motivated 0004 originally.
- Count-based jury voting (1 vote per juror, accepted here): jury power is one-juror-one-vote. Stake remains meaningful via slash and reward distribution, but jury composition itself decides the outcome. Tie behavior on even revealed-juror counts resolves to Invalid.

**Juror Non-Reveal Penalty**

A randomly selected juror who skips reveal damages the resolution process and is penalized much more harshly than the normal 1× `riskedStake` slash:

- Normal slash (loser, or non-revealing non-juror): 1 × `riskedStake` (= stake × `RISK_PERCENT` / 100, currently 20%).
- Juror non-reveal slash: full stake. With the fixed 20% normal risk, this is 5× the normal slash.

The extra (above the normal 1× `riskedStake`) joins the distributable pool on a Yes/No outcome (so honest revealing winners absorb it) or accrues to the claim creator when the market resolves Invalid.

**Reveal Quorum**

`minRevealedJurors` is intentionally a deployment-time market parameter. The contract enforces that it is non-zero and no greater than `targetJurySize`; it does not force a strict majority quorum. This is a liveness trade-off: some demo or low-stakes markets may prefer resolution from a smaller number of selected juror reveals instead of frequent Invalid outcomes, while higher-stakes markets can set `minRevealedJurors` to a majority or to the full odd max jury size.

The claim/rules document should disclose the chosen reveal quorum before voters stake. A low quorum is not a contract bug, but it is a market-quality choice that affects how representative the resolved belief is.

**Dynamic Jury Size**

`targetJurySize` is the maximum jury draw size, not the guaranteed draw size. The actual draw uses active, non-revoked committers:

`min(maxJurors, max(minJurors, activeCommitters * 15 / 100))`

The 15% cap is ignored only until the minimum juror floor is reached. After that, the draw grows with voter turnout and stops at `targetJurySize`. Solidity integer division rounds the 15% term down.

**Implications**

- Jury composition matters more than juror wealth. Stake tunes economic exposure but does not bias the YES/NO decision.
- Max jury size should be configured odd, but dynamic intermediate draw sizes and partial reveals can still be even → ties resolve to Invalid.
- Reveal quorum is configurable for liveness; strict-majority or full-jury quorum should be chosen for higher-stakes markets.
- A juror who knows they cannot reveal in time should ideally not commit; once selected, skipping reveal is the most expensive failure mode in the protocol.
