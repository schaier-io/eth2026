# Swarm Stores Immutable Claim Rules

Status: accepted

Swarm is used for immutable claim/rules documents. The contract stores a Swarm reference so voters can inspect the claim, YES/NO meaning, deadlines, max jury size, and weighting mode before staking, and those rules cannot be quietly changed after stake enters the market.

**Considered Options**

- Evidence storage as the main Swarm use case: rejected because the product is not fact-checking.
- Frontend hosting only: deferred as a nice-to-have.
- Immutable claim/rules documents: accepted because it is core to market fairness and easy to explain.
