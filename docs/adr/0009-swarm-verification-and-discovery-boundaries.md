# Swarm Verification And Discovery Boundaries

Status: accepted

TruthMarket uses Swarm in two distinct ways:

1. Immutable Swarm content stores claim/rules documents and audit artifacts.
2. Mutable Swarm feeds/KV store discovery indexes and cached read models.

The contract stores the immutable claim/rules Swarm reference and a hash of the exact claim/rules bytes. Voters, agents, and the UI must verify the fetched document against the contract before committing. Mutable Swarm feeds may help users discover markets, but they never define rules, outcomes, votes, selected jurors, or payouts.

**Considered Options**

- Store rules in mutable Swarm KV/feed: rejected because rules could change after voters inspect them.
- Store only a Swarm reference without a content hash: rejected because the product needs an explicit verification gate and a simple proof for agents and judges.
- Store one canonical claim/rules JSON plus `claimRulesHash`: accepted because it avoids Solidity JSON parsing while preserving user and agent verification.
- Use Swarm manifests for every market: deferred because single JSON is simpler for the hackathon; manifests remain useful for future multi-file bundles.

**Consequences**

- `ipfsHash` naming should be replaced by `swarmReference`.
- The contract should add `claimRulesHash`.
- Commit UX should be gated on claim/rules verification.
- Swarm KV/feed is allowed only for discovery and read-model convenience.
- Opening a market from a feed must still verify the contract-stored immutable reference.
