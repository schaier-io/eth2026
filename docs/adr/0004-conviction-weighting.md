# Conviction And Square-Root Weighting

Status: superseded by [ADR 0006](./0006-count-based-jury-voting.md)

The original decision used square-root weighting over risked stake for jury vote weight. ADR 0006 replaces this with count-based jury voting (1 vote per juror) — stake and conviction now affect only the slash and the reward distribution, not the YES/NO decision.

The conviction concept itself (a whole-percent share of stake placed at risk, 0–100) is preserved.

## Original notes

Voters choose a conviction percentage that defines how much of their stake is at risk. Jury resolution used square-root weighting over risked stake so larger commitments matter, while whale influence grows sublinearly instead of linearly.

**Considered Options**

- One-juror-one-vote: rejected at the time because the product should reward economic conviction.
- Linear stake weighting: rejected because a single large selected juror can dominate too easily.
- Square-root conviction weighting: accepted because it balances skin in the game with anti-whale pressure.

The reversal in 0006 follows from realizing that vote weight and economic exposure are two distinct roles, and that one-juror-one-vote (originally rejected here) is the cleaner separation.
