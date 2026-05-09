# Apify Agent Market-Creation Loop

Status: accepted

The product agent needs to create markets continuously: every interval, fetch viral ambiguous Reddit questions through Apify, pick one that has not yet spawned a market, and call the registry to deploy it. Other agents (third-party participants, future internal tooling) should be able to reuse the same single-market path without running the loop themselves.

The loop lives in the CLI as `truthmarket agent run` and `truthmarket agent tick`. `tick` runs one iteration and exits — this is the surface other agents call through the `truthmarket-agent` skill. `run` is `tick` on a timer with NDJSON event output, SIGINT-graceful shutdown, and an `--once` short-circuit. Both share `runAgentTick(cfg, opts, emit)` so there is a single integration test surface and no behavior drift between the loop and the one-shot.

A single iteration is: HTTP-POST the existing Next.js route at `/api/apify/generated-markets` (single source of truth for the Apify scoring/drafting algorithm — the CLI does not duplicate that logic), pick the first candidate whose Reddit permalink is not in the local agent state, gate the action on `policy.allowCreateMarkets`, build a `MarketSpec` from the candidate, call `MarketRegistry.createMarket`, and append `{ permalink, candidateId, marketAddress, ipfsHash, txHash, name, createdAt }` to `~/.truthmarket/agent-state.json` (capped at 200 entries). The state file is the dedupe ledger; the contract is the system of record.

Default cadence is `--interval-seconds=3600 --duration-seconds=3600`: a new short-lived market is created roughly every hour. The total duration is split 40/20/40 across `votingPeriod`, `juryCommit (adminTimeout)`, and `revealPeriod`, with a 60-second floor enforced to satisfy the contract's `MIN_PERIOD`. All values are flag-overridable, so demos can flip to 5-minute markets or 3-hour intervals without code changes. Custom one-off markets created by humans through `truthmarket registry create-market` use the same registry but bypass the loop entirely.

For MVP the on-chain `ipfsHash` is `keccak256(JSON.stringify(claimRulesDraft))` rather than a real Swarm reference. This unblocks an end-to-end demo without requiring a running Swarm gateway, and the swap to a real Swarm upload is isolated to one helper (`placeholderIpfsHash` in `apps/cli/src/agent/spec-builder.ts`). The agent emits `ipfsHashIsPlaceholder: true` on every spec it builds so callers can see the MVP boundary in the logs.

**Considered Options**

- Embed the Apify scoring/drafting logic directly in the CLI: rejected because the web app already exposes the route; duplicating the 500-line algorithm in two TypeScript projects guarantees drift and triples the maintenance surface for a hackathon-time demo.
- Make the agent a Next.js cron / Vercel scheduler: rejected because debuggability matters more than deploy ergonomics during the demo, the CLI already has a wallet, vault, and policy infrastructure, and an agent skill should be reachable from anywhere a developer can run a CLI.
- Put the swarm upload behind a feature flag and require it for every run: rejected because it forces every demo to stand up a Bee node before it can create a market. The placeholder hash with explicit telemetry preserves the demo path while keeping the production swap small.
- Store the dedupe ledger on-chain: rejected because the registry already records every created market; what we actually need is a permalink → market-address map for *off-chain candidate selection*, which doesn't justify gas.
- Treat the loop as the only entry point and skip `agent tick`: rejected because the skill calls one-shot, and the second function pulls double duty as a unit-testable surface for the loop logic.

**Consequences**

- The web app must be running (or the configured `--endpoint` reachable) for the agent loop to make progress. Agent runs that lose endpoint connectivity emit `tick_failed` events and continue at the next interval rather than crash.
- The dedupe ledger is per-machine (`~/.truthmarket/agent-state.json`). Running the same agent on two machines with the same wallet can race to create duplicate markets for the same candidate; the registry would accept both. If we run multi-replica, the ledger needs to move to shared storage or be replaced with on-chain `MarketCreated` log scanning keyed by a candidate-id field added to the spec.
- The MVP ipfsHash is not verifiable against a Swarm document. ADR 0009 (verification boundaries) still applies: voters that require Swarm verification should refuse to commit until the upload path lands.
- `policy.allowCreateMarkets` gates both the loop and the manual `registry create-market` command. Operators must explicitly opt in by editing the local policy file or passing `--ignore-policy` per call.
