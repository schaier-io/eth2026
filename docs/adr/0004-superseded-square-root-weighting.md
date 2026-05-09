# Superseded Square-Root Weighting

Status: superseded by [ADR 0006](./0006-count-based-jury-voting.md) and the fixed-risk model

The original decision used square-root weighting over risked stake for jury vote weight. ADR 0006 replaces this with count-based jury voting (1 vote per juror). The later contract model also removes user-selected risk; normal loss is fixed at 20% of stake.

This ADR remains only as historical context for a rejected design.

## Original notes

Voters would have chosen a percentage that defined how much of their stake was at risk. Jury resolution used square-root weighting over risked stake so larger commitments mattered, while whale influence grew sublinearly instead of linearly.

**Considered Options**

- One-juror-one-vote: rejected at the time because the product should reward economic exposure.
- Linear stake weighting: rejected because a single large selected juror can dominate too easily.
- Square-root risk weighting: accepted because it balanced skin in the game with anti-whale pressure.

The reversal in 0006 follows from realizing that vote weight and economic exposure are two distinct roles, and that one-juror-one-vote (originally rejected here) is the cleaner separation.
