<p align="center">
  <img src="../../brand-mark.svg" alt="TruthMarket" width="96" />
</p>

# TruthMarket Apify Agent

This package owns the Apify-powered market-creation agent runtime.

It fetches candidate markets from the web app's `/api/apify/generated-markets` endpoint, dedupes candidates in the local agent state file, asks the host to publish the claim/rules document to Swarm, builds a clone-ready `MarketSpec`, and delegates market creation to its host.

The CLI remains a host: it provides config, policy checks, wallet loading, Swarm KV publishing, and the `MarketRegistry.createMarket` transaction. Future hosts can reuse this agent without importing CLI command code.

The agent treats Swarm publishing as a dependency because hosts may use different write paths. When the host provides `publishClaimDocument`, `swarmReference` points at a verified KV index containing the immutable claim/rules document. When the host omits it, the agent falls back to a deterministic placeholder reference and marks `swarmReferenceIsPlaceholder: true`; that mode is for offline demos only.

Build it with:

```bash
npm install
npm run build
```
