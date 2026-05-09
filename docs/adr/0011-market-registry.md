# Market Registry

Status: accepted

Each `TruthMarket` is a self-contained contract instance: parameters are immutable, the constructor opens the market, and there is no separate setup transaction. Deployment so far has been driven by a forge script (`script/TruthMarket.s.sol`), which is fine for hand-crafted markets but does not fit an automated agent that needs to create new markets on a schedule from a single transaction.

A `MarketRegistry` contract addresses this. The registry is constructed once with the operational addresses every market created by the same organization should share — `stakeToken`, `companyTreasury`, `admin`, `juryCommitter` — and exposes `createMarket(MarketSpec)` which deploys a fresh `TruthMarket` and records its address. The caller of `createMarket` becomes the `creator` (and is therefore entitled to the Invalid-route juror penalty for that market). The registry keeps an append-only `markets` array and emits `MarketCreated(id, market, creator, name, ipfsHash)` on each deploy so indexers and the agent loop can react without scanning every block for `TruthMarket.MarketStarted` events.

The split between registry-wide and per-market fields follows what actually varies in practice. Per-market fields are the topic-specific text (`name`, `description`, `tags`, `ipfsHash`), the timing windows (`votingPeriod`, `adminTimeout`, `revealPeriod`), and the participation thresholds (`minStake`, `jurySize`, `minCommits`, `minRevealedJurors`). `protocolFeePercent` is also passed per-market: although in practice the agent will use a single value, leaving it per-spec means future markets created via the registry can run experiments without redeploying it. Everything operationally fixed for the deploying organization is read from the registry, so an agent's market spec is purely about the topic.

**Considered Options**

- Have the agent broadcast a forge script per market: rejected because it is slow, requires the foundry toolchain at runtime, and offers no on-chain index of agent-created markets.
- Make the registry deploy via `CREATE2` clones of a `TruthMarket` template: rejected for now because `TruthMarket`'s constructor performs significant validation and emits the `MarketStarted` event from the constructor; converting it to an initializer would require reworking the existing contract for an unproven gas saving.
- Allow the caller to override `treasury`, `admin`, and `juryCommitter` per market: rejected because the registry is intended to enforce the company-wide treasury route, and per-market overrides would let an agent or third party bypass that intent. A separate registry can be deployed if a different operational set is needed.
- Permission `createMarket` to an allowlist: rejected for now because the `creator` field is already `msg.sender`, so permissionless creation does not let anyone else claim the creator-only invalid-route reward, and gating creation can be added later without breaking the spec shape.

**Consequences**

- Agents and humans share a single creation path; the agent calls `createMarket(spec)` and any other caller may do the same.
- Protocol fees and dust from every market deployed through a given registry route to the same `companyTreasury`. Multiple treasuries require multiple registries.
- Rotating `admin` or `juryCommitter` requires deploying a new registry; the current set is immutable per registry by design.
- The registry is a thin index: it does not gate participation, set timing, or know about claim-rules content. Off-chain agents remain responsible for generating spec values and uploading the rules document to Swarm before calling `createMarket`.
