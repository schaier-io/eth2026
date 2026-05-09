---
name: truthmarket-agent
description: Use when an agent is creating, discovering, verifying, voting in, revealing for, watching, jury-committing, or settling a TruthMarket random-jury belief-resolution market. Covers agent creator/participant roles, Swarm claim/rules verification, local policy, private reveal vaults, persisted reveal timers, cron/heartbeat jobs, and commit-reveal safety.
---

# TruthMarket Agent Workflow

TruthMarket is random-jury belief resolution, not fact-checking and not an oracle. Agents may act as market creators, voters, selected jurors, jury committers, watchers, and settlement executors. Use "claim/rules verification" or "integrity check" for Swarm reads.

## Hard Rules

- Never commit unless the claim/rules document fetched from Swarm verifies against the contract.
- Treat mutable Swarm feeds/KV as discovery only. Contract state and immutable Swarm references are canonical.
- Never store unrevealed votes, nonces, private keys, or private strategy on Swarm.
- Never reveal for another voter or agent.
- After committing, persist the vote/nonce locally and schedule heartbeat monitoring for reveal and withdrawal.
- Reveal automation must be agent-side. The operator and contract must not know the nonce before reveal.
- If selected as a juror, reveal as soon as allowed unless explicit policy blocks it; non-revealing jurors forfeit full stake.

## Agent Roles

- **Creator**: validates claim/rules JSON, uploads it to Swarm (or computes a placeholder reference for MVP), and creates the market through `MarketRegistry.createMarket` (`truthmarket registry create-market` for manual flows, `truthmarket agent run/tick` for the Apify-driven loop). Publishes discovery-only indexes when policy allows.
- **Participant**: verifies immutable rules, commits a YES/NO belief with stake, stores the nonce locally, and reveals later to settle.
- **Selected juror**: reveals with highest urgency because selected juror non-reveal loses full stake, not only the fixed 20% risked stake.
- **Jury committer**: fetches SpaceComputer randomness after voting closes, creates a replayable public audit artifact, and commits the selected jury when policy allows.
- **Watcher**: runs a persisted timer or cron/heartbeat job for phase changes, reveal deadlines, juror selection, and withdrawal.

## Agent Quick Paths

Use the shipped CLI for agent access, creation, and voting whenever possible. It owns config loading, wallet loading, policy gates, contract calls, and vault storage.

**Access / discover markets**

1. Resolve config from env or flags: `TM_REGISTRY_ADDRESS` for registry flows and `TM_CONTRACT_ADDRESS` or `--address <market>` for single-market flows.
2. List registry markets: `truthmarket registry list --json`.
3. Inspect a market before acting: `truthmarket market info --address <market> --json`, `truthmarket market stats --address <market> --json`, and `truthmarket market jury --address <market> --json`.
4. Treat the returned market address as a candidate only until the contract state and claim/rules document have been verified.

**Create markets**

1. Generated agent market: run `truthmarket agent tick --json` for one Apify-powered creation attempt, or `truthmarket agent run --json` for the scheduler loop.
2. Manual market: build a `MarketSpec` JSON and run `truthmarket registry create-market --spec <path> --json`.
3. Creation requires `policy.allowCreateMarkets` unless the operator intentionally passes `--ignore-policy`.
4. For MVP generated markets, expect `ipfsHashIsPlaceholder: true`; those are not safe for policies that require real Swarm verification.

**Vote / reveal / settle**

1. Approve stake token allowance when needed: `truthmarket erc20 approve --address <market> --amount <base-units> --json`.
2. Commit: `truthmarket vote commit --address <market> --vote yes|no --stake <base-units> --document <claim-rules.json> --json`.
3. The commit command stores vote and nonce in the local encrypted vault. Do not pass nonces on the command line for normal reveal.
4. Reveal from the vault: `truthmarket vote reveal --address <market> --json`.
5. Withdraw after resolution: `truthmarket withdraw --address <market> --json`.
6. For unattended operation, start `truthmarket heartbeat start --json` after commits so reveal and withdraw are restart-safe.

## Policy

Require an explicit local policy before an agent commits:

```json
{
  "autoReveal": true,
  "revealBufferMinutes": 30,
  "autoWithdraw": true,
  "maxStake": "1000000000000000000",
  "requireSwarmVerification": true,
  "allowCreateMarkets": true,
  "allowJuryCommit": true,
  "allowScrapedMarketCreation": false,
  "allowScheduledMarketGeneration": false
}
```

Reject or ask for operator approval when a requested action exceeds policy.

Recommended additional policy fields when implementing a daemon:

```json
{
  "heartbeatCron": "*/2 * * * *",
  "minRevealSafetySeconds": 300,
  "maxMarketsWatched": 100,
  "maxMarketsCreatedPerRun": 3,
  "maxOpenGeneratedMarkets": 3,
  "requireHumanReviewForCreatedMarkets": true,
  "allowedSources": ["reddit"],
  "allowedSubreddits": [],
  "blockedSubreddits": [],
  "generatorMode": "live-mini",
  "generatorCron": "0 * * * *",
  "vaultPath": ".truthmarket/agent-vault.json"
}
```

## Verify Before Commit

1. Read `getConfig()` or the individual getters from the market contract.
2. Fetch the claim/rules document from `swarmReference()`/`ipfsHash`.
3. If the contract exposes a separate `claimRulesHash`, verify `keccak256(fetchedBytes) == claimRulesHash`.
4. The current contract exposes both `swarmReference()` and `claimRulesHash`; the CLI `vote commit` enforces this when `policy.requireSwarmVerification` is true and a `--document` path is supplied.
5. For MVP generated markets whose `ipfsHash` is a placeholder hash, refuse to commit when `requireSwarmVerification` is true unless a local document is supplied and matches the on-chain `claimRulesHash`.
6. Decode JSON and compare any duplicated fields against contract getters.
7. Only then decide whether the agent policy allows commit.

## Find Markets

Use discovery as a convenience layer, then verify from contract state:

1. Read a configured market address such as `NEXT_PUBLIC_TRUTHMARKET_ADDRESS` when working with the current web app.
2. Read mutable Swarm indexes/feeds such as `truthmarket:v1:markets:<chainId>` or `truthmarket:v1:creator:<chainId>:<creator>` when available.
3. Scan `MarketStarted` events or deployment artifacts when no discovery index exists.
4. For each candidate market, read `getConfig()`, `phase()`, `outcome()`, `getJury()`, and `getRevealStats()`.
5. Fetch and verify the immutable claim/rules document before showing it as actionable.

Do not trust discovery indexes for rules, phase, outcome, selected jurors, or payouts.

## Apify Reddit Market Creation

Use Apify to scrape viral ambiguous Reddit questions and create quick candidate belief markets. Apify is public context collection and market drafting only; it must not decide the market outcome.

1. Fetch candidate Reddit posts, questions, comments, timestamps, author metadata, edit/deletion state, and source URLs.
2. Normalize the scraped output into a public context artifact.
3. Draft a neutral YES/NO claim/rules document from one candidate.
4. Define YES and NO as juror belief positions, not external truth claims. Example: "YES means selected jurors believe the post is likely authentic under the listed signals; NO means they do not."
5. Upload the claim/rules document to Swarm before market creation.
6. Optionally upload the scraped context as a separate public artifact linked from the rules document.
7. Let selected jurors resolve by revealed belief under the immutable rules.

Do not store private votes, nonces, wallet keys, private strategy, or agent policy in Apify output or Swarm artifacts. Avoid language like "Apify verifies the post" or "the scraper decides the outcome."

Scraped-market policy gates:

- Require `allowScrapedMarketCreation`.
- Respect `allowedSources`, `allowedSubreddits`, and `blockedSubreddits`.
- Enforce `maxMarketsCreatedPerRun`.
- Require human approval when `requireHumanReviewForCreatedMarkets` is true.
- Reject posts that require private data, doxxing, harassment, illegal instructions, or non-public evidence to evaluate.
- Prefer questions where reasonable jurors can disagree under public context.

Good market shapes:

- "Do selected jurors believe this post is likely authentic under the linked public signals?"
- "Do selected jurors believe this claim is credible enough to classify as YES under the rules?"
- "Do selected jurors believe the community question should resolve YES after reviewing the supplied public context?"

Bad market shapes:

- "Did this objectively happen?" when the rules require unavailable private evidence.
- "Does Apify prove this is true?"
- Any claim where YES/NO meaning is not defined before staking.

## Scheduled Market Generator

When `policy.allowCreateMarkets` is true, run at most one generated market per scheduler tick. The shipped path is the `agent` subcommand group (see ADR 0012):

- `truthmarket agent run` — long-running loop, one market per `--interval-seconds`. NDJSON event stream when `--json`. Exits cleanly on SIGINT.
- `truthmarket agent tick` — runs a single iteration and exits. This is the single-shot surface other agents and the operator should call for one-off generation; both share `runApifyAgentTick` from `agents/apify` so behavior is identical.

Each tick:

1. POSTs the existing web route at `${TM_APIFY_ENDPOINT}` (default `http://localhost:3000/api/apify/generated-markets`) — the CLI does not duplicate the Apify scoring/drafting logic.
2. Skips candidates whose Reddit `sourceUrl` or `id` already appears in `~/.truthmarket/agent-state.json` (capped at 200 entries; the file is the dedupe ledger).
3. Gates the action on `policy.allowCreateMarkets`; pass `--ignore-policy` to override per call.
4. Builds a `MarketSpec` from the candidate. The total lifetime is `--duration-seconds` (default 3600), split 40/20/40 across `votingPeriod`, `juryCommit`, and `revealPeriod` with a 60-second floor enforced.
5. Calls `MarketRegistry.createMarket(spec)`. The factory injects the configured discovery `TruthMarketRegistry` so the new market self-registers for UI/API discovery. The wallet that signs becomes the market's on-chain creator and is entitled to the Invalid-route juror-penalty payout.
6. Appends `{ permalink, candidateId, marketAddress, txHash, ipfsHash, name, createdAt }` to the dedupe ledger.

For MVP the on-chain `ipfsHash` is `keccak256(JSON.stringify(claimRulesDraft))` rather than a real Swarm reference; the agent emits `ipfsHashIsPlaceholder: true` so the boundary is visible. Voters with `requireSwarmVerification: true` should refuse to commit on these markets until a real Swarm upload is wired in.

Recommended timing modes:

- `demo-fast`: manual or every 15 minutes; 5 minute voting, 2 minute jury commit timeout, 5 minute reveal; `jurySize=1`, `minCommits=7`, `minRevealedJurors=1`.
- `live-mini`: every 60 minutes; 20 minute voting, 5 minute jury commit timeout, 25 minute reveal; `jurySize=1`, `minCommits=7`, `minRevealedJurors=1`.
- `public-hourly`: every 3 hours; 60 minute voting, 10 minute jury commit timeout, 50 minute reveal; `jurySize=3`, `minCommits=20`, `minRevealedJurors=2`.

The current contract requires `minCommits * 15 >= jurySize * 100`. Use a 1-person jury for fast live demos unless the agent swarm can reliably produce at least 20 commits.

Implementation boundary: the Apify market-creation runtime lives in `agents/apify`; the CLI's `truthmarket agent run/tick` commands are host adapters that provide config, policy checks, wallet loading, and registry transactions.

## Eligibility Or Registry

If a voter registry or identity adapter exists, check it before commit and before accepting a juror candidate. For hackathon demos, identity may be display-only; production markets need a real eligibility boundary.

Expected registry behavior:

- `isEligible(address, market)` or equivalent gates who may commit or be counted as a jury candidate.
- ENS or another identity layer may display names, but display alone is not Sybil resistance.
- Claim/rules documents should disclose the eligibility mechanism used by the market.

## Commit

1. Choose YES or NO under the immutable claim/rules document.
2. Generate a high-entropy nonce locally.
3. Compute the contract commitment hash using vote, nonce, voter address, chain id, and contract address.
4. Read `stakeToken()`, `minStake()`, `RISK_PERCENT()`, and existing ERC20 `allowance(agent, market)`.
5. If allowance is below stake, run `truthmarket erc20 approve --address <market> --amount <stake> --json` or call `approve(market, stake)` on the stake token.
6. Submit `commitVote(commitHash, stake)` to the market.
7. Store vote, nonce, market, chain, wallet, commitment hash, stake, and deadlines in a local private vault.
8. Create or update a persisted reveal timer for `revealDeadline - revealBufferMinutes`.
9. Start or update the heartbeat watcher.

## Heartbeat Or Cron Job

The watcher must be idempotent and restart-safe. Prefer a persisted cron/worker loop over a single in-memory timeout.

On each tick:

1. Load local policy and vault entries.
2. For each watched market, read phase, deadlines, selected-juror status, reveal status, outcome, and withdrawal status from the contract.
3. If voting has closed and `allowJuryCommit` is true, run the jury committer flow when no jury is committed yet.
4. If reveal is open, `autoReveal` is true, and the vault has vote/nonce:
   - reveal immediately when the agent is a selected juror;
   - otherwise reveal once the persisted reveal timer is due or the deadline is inside the safety buffer.
5. If reveal is open but the vault is missing vote/nonce, alert and do not fabricate a reveal.
6. If resolved and `autoWithdraw` is true, withdraw once.
7. Persist the latest checked block, job status, and any transaction hash.

Timer guidance:

- Create the reveal timer immediately after commit.
- Recompute timers from contract deadlines on every heartbeat instead of trusting local wall-clock state alone.
- Treat selected-juror reveal as urgent because it avoids full-stake slash.
- Keep nonces private until the reveal transaction is intentionally sent.

## Create Market

Markets are created through the `MarketRegistry` factory (ADR 0011). The factory is constructed once per organization with the operational addresses every market should share — `stakeToken`, `companyTreasury`, discovery `TruthMarketRegistry`, `admin`, `juryCommitter` — so the caller only supplies a topic-only `MarketSpec`. The caller of `createMarket` is recorded as the on-chain `creator`.

Two creation paths share the same registry, gated by `policy.allowCreateMarkets`:

- `truthmarket agent tick` / `agent run` — Apify-driven, used by the product agent and other agents calling this skill. See *Scheduled Market Generator*.
- `truthmarket registry create-market --spec <spec.json>` — manual single-market creation from a hand-edited spec file. Used for demo markets with custom timing or for human-curated topics.

When creating manually:

1. Validate canonical `claim-rules.json`.
2. Upload it to Swarm (when a gateway is configured) and use the Swarm reference as `ipfsHash`. For MVP without a gateway, the agent loop uses `keccak256(JSON.stringify(claim-rules))` as a placeholder; humans creating manually should still prefer a real reference where possible.
3. Build a `MarketSpec` JSON file with `name`, `description`, `tags`, `ipfsHash`, `votingPeriod`, `adminTimeout`, `revealPeriod`, `protocolFeePercent`, `minStake`, `jurySize`, `minCommits`, `minRevealedJurors`.
4. Run `truthmarket registry create-market --spec <path>`. The CLI prints the deployed market address and tx hash; both are also emitted as `MarketCreated(id, market, creator)`. Read the deployed market for name, description, phase, and rules reference.
5. Store creator metadata, market address, Swarm reference, and claim-rules hash locally.
6. Update mutable Swarm discovery index/feed when one exists.

Do not put deadlines, jury size, stake token, creator, or risk percentage into Swarm as canonical state. Those values come from the contract. The UI or agent may display them beside the Swarm document.

## Jury Committer

When policy allows jury committing:

1. Wait until voting deadline.
2. Fetch SpaceComputer randomness.
3. Build a replayable jury audit artifact.
4. Upload the artifact to Swarm.
5. Call `commitJury(randomness, auditHash)`.

The jury audit artifact is public. It must not include private votes or nonces.

## Contract And Client Surface

There are no repo HTTP API routes yet. Agents should use EVM contract calls, Swarm fetch/KV, and the SpaceComputer randomness service.

Core market reads:

- `getConfig()`, `phase()`, `outcome()`, `commits(agent)`, `getCommitters()`, `getJury()`, `isJuror(agent)`, `getRevealStats()`, `getJurorVotes()`, `commitHashOf(vote, nonce, voter)`.

Core market writes:

- `commitVote(commitHash, stake)`, `revokeStake(voter, vote, nonce)`, `commitJury(randomness, auditHash)`, `revealVote(vote, nonce)`, `resolve()`, `withdraw()`, `withdrawTreasury()`, `withdrawCreator()`, `forceSweepDust(maxIters)`.

Stake token calls:

- `allowance(owner, market)`, `approve(market, stake)`, `balanceOf(owner)`, `decimals()`, `symbol()`.

Current web client ABI is in `apps/web/lib/truthmarket.ts`; update it when contract methods used by agents are missing.

## CLI Expectations

When a TruthMarket CLI exists, prefer it over hand-written transaction scripts. The CLI should expose stable JSON output so agents can call it safely.

Shipped command surface (run `truthmarket --help` or `truthmarket <group> --help` for the live list):

- `truthmarket registry info --json` — registry-wide config + market count
- `truthmarket registry list --offset <n> --limit <n> --json` — deployed market addresses
- `truthmarket registry create-market --spec <path> --json` — manual market creation through the registry
- `truthmarket agent tick --json` — one Apify-driven market creation iteration
- `truthmarket agent run --interval-seconds <n> --duration-seconds <n> --json` — continuous loop, NDJSON event stream
- `truthmarket market info | phase | stats | jury | watch --address <addr> --json` — read a deployed market
- `truthmarket vote commit --vote yes|no --stake <amount> --address <addr> --json`
- `truthmarket vote reveal --address <addr> --json`
- `truthmarket jury commit --randomness <uint256> --audit-hash <hex> --address <addr> --json`
- `truthmarket withdraw --address <addr> --json`
- `truthmarket heartbeat start --json` — agent heartbeat watcher (foreground)
- `truthmarket policy show | set --file <path> --json`
- `truthmarket swarm verify --document <path> --address <addr>`

CLI safety requirements:

- Return machine-readable JSON with `ok`, `action`, `market`, `txHash`, and `error` fields where applicable.
- Never require vote nonces, private keys, or secrets in command-line arguments.
- Read reveal vote/nonce from the local vault.
- Support dry-run or preview for market creation and commit transactions.
- Print exact claim/rules hash, Swarm reference, stake amount, risked stake, and deadlines before signing.

## Settlement

After resolution:

1. Confirm the agent revealed if it had a committed vote.
2. Read the claimable amount or settlement status from the contract.
3. Withdraw only once per market.
4. Record the transaction hash and final status locally.
5. Keep the vault entry until settlement is final, then archive or delete according to local retention policy.

## Refuse Or Escalate

Pause and ask for approval when:

- policy is missing or does not allow the requested action;
- claim/rules verification fails;
- the requested stake exceeds `maxStake`;
- the reveal deadline is too close for the configured safety buffer;
- the local vault lacks the vote/nonce needed for a reveal;
- the requested action would expose a nonce, private key, or private strategy publicly.
