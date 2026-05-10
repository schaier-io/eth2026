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
- Runs `SimulateAnvil.deploy()` which deploys `MockERC20`, one `TruthMarket` implementation, the `MarketRegistry` clone factory/discovery index, and a seed market clone
- Writes `TM_*` and `NEXT_PUBLIC_*` env vars to `.env` at the repo root

Verify the registry is reachable. The CLI walks up from cwd looking for `.env`, so no `source` is needed for `truthmarket *` commands run from inside the repo:

```sh
npx tsx src/cli.ts registry info
# expect: total markets: 1 (the seed clone)
```

(Forge / cast / shell scripts that aren't dotenv-aware still need `source ../../.env` first.)

### 2. Seed the agent policy

```sh
npx tsx src/cli.ts dev seed-agent
# writes ~/.truthmarket/policy.json with allowCreateMarkets=true and a generous maxStake
```

For non-interactive vote / reveal / withdraw flows (CLI runs without a TTY), also export a vault passphrase:

```sh
export TM_VAULT_PASSPHRASE=demo   # any value; encrypts local nonce vault
```

### 3. Start the web app

In a second terminal:

```sh
cd apps/web
npm run dev
# Next.js picks up repo-root NEXT_PUBLIC_* values written by dev up.
```

Open `http://localhost:3000`. The "Registry markets" panel will show the seed clone. Agent-created clones appear in the same registry list.

### 4. Create a market via the agent

```sh
cd apps/cli
npx tsx src/cli.ts agent tick --items-file ../../docs/agent/sample-items.json
```

This posts the sample items to the web `/api/apify/generated-markets` route, picks the first unseen candidate, builds a `MarketSpec`, and broadcasts `MarketRegistry.createMarket`. The CLI prints the new market address.

Refresh the web app — the "Registry markets" panel now shows the market with name + phase. Click it to open the market, commit from a wallet, then use the dashboard. The dashboard stores encrypted reveal data per wallet and per market, so each demo wallet sees only its own local positions.

For a real Apify run instead, set `APIFY_TOKEN` and `APIFY_REDDIT_ACTOR_ID` in your env and drop `--items-file`.

### 5. Vote, reveal, resolve

The seed `TruthMarket` address is written to `.env` as `TM_CONTRACT_ADDRESS`. It was created as a minimal clone with `jurySize=1, minCommits=1, minRevealedJurors=1`. Use anvil voter accounts 5–11 (already funded with 1000 MockERC20 each) to commit through the CLI, advance time via cast, draw a juror, reveal, and resolve. This is documented per phase in [`contracts/README.md`](../contracts/README.md) under `bin/sim-anvil`.

Agent-created markets default to `jurySize=1, minCommits=1, minRevealedJurors=1` and a 1-hour split window (24m voting / 12m jury / 24m reveal); identical lifecycle, just different parameters.

#### Funding friend wallets

Live-demo viewers connecting MetaMask to anvil arrive empty — they have no MockERC20 stake and no anvil ETH. Use the deployer wallet to fund them:

```sh
# from apps/cli, deployer PK is in the env
npx tsx src/cli.ts dev fund --to 0xVIEWER_ADDRESS
# default: 1000 TRUTH (1000e18) + 1 ETH (1e18). Override with --tokens / --eth.
```

The recipient can then approve + commit through the web app's stake screen, or via the CLI flow below.

#### Vote / reveal via CLI

```sh
export TM_VAULT_PASSPHRASE=demo

# approve a market for spending stake
npx tsx src/cli.ts erc20 approve --address <market-addr> --amount 1000000000000000000000

# commit a YES/NO vote (5 TRUTH stake)
npx tsx src/cli.ts vote commit --address <market-addr> --vote yes --stake 5000000000000000000 --ignore-policy

# (after voting deadline, jury committed, reveal phase open)
npx tsx src/cli.ts vote reveal --address <market-addr>
npx tsx src/cli.ts withdraw --address <market-addr>
```

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

- Agent-created markets may use a deterministic placeholder `swarmReference` until their Swarm upload path is configured. The agent emits `swarmReferenceIsPlaceholder: true` on those specs. See [ADR 0012](./adr/0012-apify-agent-market-loop.md).
- Voters that require Swarm verification (`policy.requireSwarmVerification: true`) should refuse to commit on placeholder-reference markets.
- Agent dedupe is local (`~/.truthmarket/agent-state.json`); running two agents on the same wallet can create duplicates. Single-machine is the MVP boundary.
- `dev up` always points at the deterministic anvil deployer (`PRIVATE_KEY=0xac09...ff80`) and reads the actual clone/factory addresses from `contracts/.sim-anvil.json`; for non-anvil networks, deploy `MarketRegistry.s.sol`, then set `TM_REGISTRY_ADDRESS`, `NEXT_PUBLIC_REGISTRY_ADDRESS`, and per-clone defaults such as `TM_STAKE_TOKEN` / `NEXT_PUBLIC_STAKE_TOKEN` by hand.
