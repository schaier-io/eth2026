# Swarm Verification And Discovery Boundaries

Status: accepted

TruthMarket uses Swarm in two distinct ways:

1. Immutable Swarm content stores initial claim/rules documents and claim attachments.
2. Mutable Swarm feeds/KV store discovery indexes and cached read models.

The contract stores the immutable claim/rules Swarm reference. Voters, agents, and the UI must fetch and verify the document from that contract-stored reference before committing. Mutable Swarm feeds may help users discover markets, but they never define rules, outcomes, votes, selected jurors, or payouts.

**Considered Options**

- Store rules in mutable Swarm KV/feed: rejected because rules could change after voters inspect them.
- Store a Swarm reference plus a duplicate exact-byte hash: rejected for the clone path because Swarm's content address already anchors the immutable bytes, and the extra storage makes every market more expensive.
- Store one canonical claim/rules document in Swarm KV and put only its immutable reference on-chain: accepted because it keeps clone creation cheap while preserving user and agent verification through verified fetch.
- Use Swarm manifests for every market: deferred because single JSON is simpler for the hackathon; manifests remain useful for future multi-file bundles.

**Consequences**

- `swarmReference()` is the single on-chain claim/rules pointer.
- Commit UX should be gated on claim/rules verification.
- Swarm KV/feed is allowed only for discovery and read-model convenience.
- Opening a market from a feed must still verify the contract-stored immutable reference.
