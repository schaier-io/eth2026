# TruthMarket Apify Agent

This package owns the Apify-powered market-creation agent runtime.

It fetches candidate markets from the web app's `/api/apify/generated-markets` endpoint, dedupes candidates in the local agent state file, builds a `MarketSpec`, and delegates market creation to its host.

The CLI remains a host: it provides config, policy checks, wallet loading, and the registry transaction. Future hosts can reuse this agent without importing CLI command code.

Build it with:

```bash
npm install
npm run build
```
