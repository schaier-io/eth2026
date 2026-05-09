# MVP Live Demo Walkthrough

End-to-end path: deploy a local registry, create a market through the agent, vote with multiple wallets, settle. Targets a fresh anvil node and the local Next.js web app.

## What you'll see

1. The agent CLI hitting the web Apify endpoint, picking a candidate, calling the registry, and getting a fresh market address.
2. The web feed rendering the registry's market list live, with phase + outcome pulled from chain.
3. Multiple anvil-funded wallets committing votes, a juror revealing, and the contract resolving.

## One-time setup

```sh
# Foundry (anvil + forge)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# CLI deps
(cd apps/cli && npm install)

# Web deps
(cd apps/web && npm install)
```

## Run the demo

### 1. Deploy registry + seed market on a fresh anvil

```sh
cd apps/cli
npx tsx src/cli.ts dev up --env-out ../../.env
```

This:
- Spawns anvil on `127.0.0.1:8545` with 12 funded accounts
- Runs `SimulateAnvil.deploy()` which deploys `MockERC20` (nonce 0), the seed `TruthMarket` (nonce 1), and `MarketRegistry` (nonce 2) at deterministic addresses
- Writes `TM_*` and `NEXT_PUBLIC_*` env vars to `.env` at the repo root

Verify the registry is reachable:

```sh
source ../../.env && npx tsx src/cli.ts registry info
# expect: market count: 0
```

### 2. Seed the agent policy

```sh
npx tsx src/cli.ts dev seed-agent
# writes ~/.truthmarket/policy.json with allowCreateMarkets=true and a generous maxStake
```

### 3. Start the web app

In a second terminal:

```sh
cd apps/web
npm run dev
# Next.js picks up NEXT_PUBLIC_REGISTRY_ADDRESS from the repo-root .env automatically
```

Open `http://localhost:3000`. The "Registry markets" panel will show *0 on-chain markets* — that's the empty registry.

### 4. Create a market via the agent

```sh
cd apps/cli
npx tsx src/cli.ts agent tick --items-file ../../docs/agent/sample-items.json
```

This posts the sample items to the web `/api/apify/generated-markets` route, picks the first unseen candidate, builds a `MarketSpec`, and broadcasts `MarketRegistry.createMarket`. The CLI prints the new market address.

Refresh the web app — the "Registry markets" panel now shows the market with name + phase. Click it to drop into the existing single-market UI.

For a real Apify run instead, set `APIFY_TOKEN` and `APIFY_REDDIT_ACTOR_ID` in your env and drop `--items-file`.

### 5. Vote, reveal, resolve

The seed `TruthMarket` (`0xe7f1725...`) was deployed with `jurySize=1, minCommits=7, minRevealedJurors=1`. Use anvil voter accounts 5–11 (already funded with 1000 MockERC20 each) to commit through the CLI, advance time via cast, draw a juror, reveal, and resolve. This is documented per phase in [`contracts/README.md`](../contracts/README.md) under `bin/sim-anvil`.

Agent-created markets default to `jurySize=1, minCommits=7, minRevealedJurors=1` and a 1-hour split window (24m voting / 12m jury / 24m reveal); identical lifecycle, just different parameters. The participating wallets need MockERC20 — top up via the same `bin/anvil` faucet account or `truthmarket erc20` flow.

### 6. Run the agent on a loop (optional)

```sh
npx tsx src/cli.ts agent run --items-file ../../docs/agent/sample-items.json --interval-seconds 60 --duration-seconds 300
```

Creates one market per minute (5-min lifetime each, 2m/1m/2m phase split) until SIGINT. The dedupe ledger at `~/.truthmarket/agent-state.json` ensures the same item never spawns two markets.

## Tear-down

```sh
cd apps/cli
npx tsx src/cli.ts dev down
```

## Known MVP boundaries

- `ipfsHash` is `keccak256(JSON.stringify(claimRulesDraft))` — a placeholder until Swarm upload lands. The agent emits `ipfsHashIsPlaceholder: true` on every spec it builds. See [ADR 0012](./adr/0012-apify-agent-market-loop.md).
- Voters that require Swarm verification (`policy.requireSwarmVerification: true`) should refuse to commit on agent-created markets until that path is real.
- Agent dedupe is local (`~/.truthmarket/agent-state.json`); running two agents on the same wallet can create duplicates. Single-machine is the MVP boundary.
- `dev up` always points at the deterministic anvil deployer (`PRIVATE_KEY=0xac09...ff80`); for non-anvil networks, deploy `MarketRegistry.s.sol` separately and set `TM_REGISTRY_ADDRESS` + `NEXT_PUBLIC_REGISTRY_ADDRESS` by hand.
