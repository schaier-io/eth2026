# Market Registry Minimal Clones

Status: accepted

Each `TruthMarket` is still a self-contained market: it owns its own stake token, jury committer, creator, deadlines, Swarm claim/rules reference, commit set, jury state, and settlement accounting. The change is how markets are created. Instead of redeploying the full `TruthMarket` bytecode for every claim, the system deploys one implementation contract and creates each market as an EIP-1167 minimal clone through `MarketRegistry.createMarket(MarketSpec)`.

`MarketRegistry` is both the clone factory and the append-only discovery index. It stores the shared `implementation` address, the referenced `implementationVersion`, its own `CONTRACT_VERSION`, and the market list/indexes. It does not bake in `stakeToken` or `juryCommitter`: those are per-clone fields inside `MarketSpec`, so different markets can use different stake assets or randomness submitters while sharing the same implementation bytecode. The caller of `createMarket` becomes the market `creator`.

Clone creation and registration are atomic. The registry clones the implementation, calls `TruthMarket.initialize(...)`, and the clone registers back into the same registry during initialization. Consumers can index `MarketCreated(id, market, creator)` and `MarketRegistered(market, creator, index, registeredAt)`, then read the clone getters for the actual market configuration.

**Considered Options**

- Deploy full `TruthMarket` bytecode per market: rejected because it makes every market pay the full contract deployment cost even though most logic is identical.
- Store every claim inside one giant contract: rejected because the global contract becomes a growing state and accounting bottleneck. Per-market clones keep each market isolated while still making creation cheap.
- Bake `stakeToken` and `juryCommitter` into the registry: rejected because markets may need different assets or jury/rand-commit operators. These values now live in the clone's initialized storage.
- Keep a separate discovery `TruthMarketRegistry`: rejected for the primary path because factory + discovery in one registry is simpler for apps and agents. The legacy registry can still exist for compatibility, but new markets use `MarketRegistry`.
- Use upgradeable proxies: rejected. These markets are intentionally immutable once initialized; minimal clones give the gas saving without upgrade authority.

**Consequences**

- Agents and humans share one creation path: `createMarket(spec)`.
- Deployment cost per market drops sharply because only a tiny proxy is deployed; each clone still has isolated market storage.
- `stakeToken`, `juryCommitter`, and all claim/rules parameters are per market.
- The implementation constructor locks the implementation against direct initialization; only fresh clones can initialize once.
- Apps should treat the registry as discovery and each clone as the source of market configuration.
