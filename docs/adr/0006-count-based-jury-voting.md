# Count-Based Jury Voting And Full-Stake Juror Non-Reveal Penalty

Status: accepted (supersedes [ADR 0004](./0004-conviction-weighting.md))

Each selected juror contributes exactly one vote to the YES/NO outcome regardless of stake or conviction. Stake and conviction control only the slash on a wrong vote, the share of the slashed pool a winner receives, and the bond at risk when a juror skips reveal. Jury voting power is decoupled from money.

**Considered Options**

- Square-root conviction weighting (originally accepted in ADR 0004): rejected after revisiting. Coupling vote weight to economic conviction lets large stakers still meaningfully dominate jury outcomes — the sublinear curve flattens influence but does not separate it from capital. It also conflates two distinct roles (voting weight and economic exposure) that are clearer when separated.
- Linear stake weighting: rejected for the same whale-dominance reason that motivated 0004 originally.
- Count-based jury voting (1 vote per juror, accepted here): jury power is one-juror-one-vote. Stake remains meaningful via slash and reward distribution, but jury composition itself decides the outcome. Tie behavior on even revealed-juror counts resolves to Invalid.

**Juror Non-Reveal Penalty**

A randomly selected juror who skips reveal damages the resolution process and is penalized much more harshly than the normal 1× `riskedStake` slash:

- Normal slash (loser, or non-revealing non-juror): 1 × `riskedStake` (= stake × conviction). At a typical 20% conviction this is roughly 20% of stake.
- Juror non-reveal slash: full stake. Conviction is ignored for jurors. At a typical 20% conviction this lines up with ~5× the normal slash.

The extra (above the normal 1× `riskedStake`) joins the distributable pool on a Yes/No outcome (so honest revealing winners absorb it) or accrues to the treasury when the market resolves Invalid.

**Implications**

- Jury composition matters more than juror wealth. Stake/conviction tune economic exposure but do not bias the YES/NO decision.
- Jury size should be configured odd so a full-reveal jury cannot tie. Even-count partial reveals can still tie → Invalid.
- A juror who knows they cannot reveal in time should ideally not commit; once selected, skipping reveal is the most expensive failure mode in the protocol.
