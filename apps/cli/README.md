<p align="center">
  <img src="../../brand-mark.svg" alt="TruthMarket" width="96" />
</p>

# TruthMarket Agent CLI

Standalone CLI + TUI for interacting with the [`TruthMarket`](../../contracts/src/TruthMarket.sol) contract. Built for autonomous agents and headless operators that need to commit, reveal, watch deadlines, and auto-resolve participation, mirroring the on-chain commit-reveal flow used by [`apps/web`](../web/).

## Five-minute first run

Three commands, ~5 minutes from a fresh checkout to a working agent against a local mock chain.

```sh
cd apps/cli
./skills.sh bootstrap          # installs CLI, spawns anvil, deploys mock contract, writes .env, sets policy
truthmarket market info        # reads from your fresh mock market
./skills.sh clean              # tear it down
```

Prerequisites: Node ≥ 20 and Foundry on PATH. Run `./skills.sh doctor` to verify.

What `bootstrap` actually does:

1. `npm install && npm run build && npm link` — globally exposes the `truthmarket` binary.
2. Spawns `anvil --accounts 12 --silent` detached and waits for the RPC.
3. Runs `forge script script/SimulateAnvil.s.sol --sig "deploy()" --broadcast` — deploys MockERC20, one TruthMarket implementation, a clone registry, and a seed market clone.
4. Writes `apps/cli/.env` with `TM_CHAIN`, `TM_RPC_URL`, `TM_CONTRACT_ADDRESS`, `TM_REGISTRY_ADDRESS`, `TM_STAKE_TOKEN`, and the anvil deterministic deployer key.
5. Installs a permissive default policy at `~/.truthmarket/policy.json` (allows commits up to 100 tokens; swarm verification off).

After that you have a real local agent environment. Try:

```sh
truthmarket wallet balance              # ETH + stake-token balance
truthmarket erc20 approve               # approve stake token for the contract
truthmarket vote commit --vote yes --stake 1000000000000000000
truthmarket vault list                  # encrypted local nonce vault
truthmarket tui                         # interactive dashboard (q to quit)
```

See [`skills.sh`](#skillssh-bootstrapper) for all subcommands and [Common workflows](#common-workflows) for end-to-end patterns.

## Contents

- [Five-minute first run](#five-minute-first-run)
- [`skills.sh` bootstrapper](#skillssh-bootstrapper)
- [Manual install](#manual-install)
- [Quickstart against a remote chain](#quickstart-against-a-remote-chain)
- [Configuration & `.env`](#configuration--env)
- [Wallets & passphrases](#wallets--passphrases)
- [Vault](#vault)
- [Agent policy (ADR 0010)](#agent-policy-adr-0010)
- [Commands](#commands)
- [`--json` contract](#--json-contract)
- [Common workflows](#common-workflows)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Tests](#tests)

---

## `skills.sh` bootstrapper

[`apps/cli/skills.sh`](skills.sh) is the single entry point for setup, demos, and teardown. Every subcommand is idempotent — re-run it any time.

| Subcommand | What it does |
|------------|--------------|
| `./skills.sh doctor` | Checks `node`, `npm`, `forge`, `anvil`, `cast` are on PATH. Run this first if anything looks off. |
| `./skills.sh install` | One-time `npm install` + `npm run build` + `npm link`. Exposes `truthmarket` globally. Falls back to a clear note if `npm link` lacks permission. |
| `./skills.sh bootstrap` | `install` (if needed) + `truthmarket dev up` + writes a permissive default policy. Leaves you in a state where every `truthmarket` command works. |
| `./skills.sh demo` | `bootstrap` + a read-only tour: `market info`, `wallet balance`, `market phase`, `erc20 approve`, `erc20 allowance`. Useful for a screenshare or sanity check. |
| `./skills.sh clean` | `truthmarket dev down`, `rm -rf dist`, removes the generated `.env` only if it points at `127.0.0.1:8545`. |
| `./skills.sh help` | Print this table. |

Recommended first run:

```sh
./skills.sh doctor
./skills.sh bootstrap
truthmarket market info
truthmarket vote commit --vote yes --stake 1000000000000000000
./skills.sh clean
```

If you'd rather not symlink the binary globally, run via `node dist/cli.js` instead — `skills.sh` falls back to that automatically when `npm link` isn't available.

---

## Manual install

```sh
cd apps/cli
npm install
npm run build
```

Then either:

```sh
# global symlink for convenience
npm link
truthmarket --help

# or run directly without linking
node dist/cli.js --help
```

Requirements:

- Node 20+
- For `truthmarket dev *` and `skills.sh`: [Foundry](https://book.getfoundry.sh/getting-started/installation) (`anvil`, `forge`, `cast` on PATH).

If you'd rather not run `skills.sh`, the equivalent low-level flow is:

```sh
truthmarket dev up                               # anvil + deploy + .env
truthmarket policy set --file ./policy.json      # see "Agent policy" below
truthmarket vote commit --vote yes --stake 1000000000000000000
truthmarket dev down
```

`dev up` is idempotent — re-running it reuses an existing managed anvil and just rewrites `.env`. Pass `--rpc-port` to use a different port; `--skip-deploy` to spawn anvil only.

---

## Quickstart against a remote chain

```sh
cd apps/cli
cp .env.example .env
$EDITOR .env   # set TM_CHAIN, TM_RPC_URL, TM_CONTRACT_ADDRESS, your key

# safer than putting PRIVATE_KEY in .env: encrypt a keystore
unset PRIVATE_KEY
truthmarket wallet init        # prompts for a passphrase
truthmarket wallet show

# now configure your agent policy and go
truthmarket policy set --file /path/to/policy.json
truthmarket erc20 approve
truthmarket vote commit --vote yes --stake <token-base-units>
truthmarket vote reveal
truthmarket withdraw
```

For unattended runs, set `TM_KEYSTORE_PASSPHRASE` and `TM_VAULT_PASSPHRASE` in the environment of the agent process. Treat them like the keys themselves.

---

## Configuration & `.env`

Every command reads a small layer of configuration. Resolution order (top wins):

1. Command-line flag (`--chain`, `--rpc`, `--address`).
2. Process environment variable (set by your shell, by `direnv`, by your container, etc.).
3. `.env` file in the current directory or any ancestor up to 5 levels — auto-loaded at startup.
4. Hardcoded fallback in `src/config.ts` (zero address; useful only after `dev up` rewrites `.env`).

`.env` keys recognised:

| Key | What it does |
|-----|--------------|
| `TM_CHAIN` | `foundry` \| `baseSepolia` \| `sepolia` |
| `TM_RPC_URL` | RPC endpoint to use; overrides chain default |
| `TM_CONTRACT_ADDRESS` | TruthMarket contract address |
| `TM_REGISTRY_ADDRESS` | MarketRegistry clone factory + discovery address |
| `TM_STAKE_TOKEN` | default ERC-20 stake token for new market clones |
| `TM_JURY_COMMITTER` | default jury committer for new market clones; defaults to the creator wallet when unset |
| `TM_SWARM_GATEWAY_URL` | Swarm gateway used for verified claim/rules fetches |
| `TM_SWARM_BEE_API_URL` | Bee API used to publish claim/rules documents; defaults to the public Swarm testnet gateway |
| `TM_SWARM_POSTAGE_BATCH_ID` | postage batch used for writes; the public testnet gateway uses a dummy batch for small demo documents |
| `PRIVATE_KEY` | hex private key (with or without `0x`) — wins over keystore |
| `TM_KEYSTORE_PASSPHRASE` | non-interactive keystore unlock |
| `TM_VAULT_PASSPHRASE` | non-interactive vault unlock |
| `TM_POLICY_FILE` | override `~/.truthmarket/policy.json` |
| `TM_HOME` | override `~/.truthmarket` base directory |

The shipped [`.env.example`](.env.example) lists the same keys with safe defaults you can copy in.

---

## Wallets & passphrases

Resolution order in [`src/wallet/loader.ts`](src/wallet/loader.ts):

1. `PRIVATE_KEY` env (matches the deploy script convention).
2. Encrypted keystore at `~/.truthmarket/keystore.json`. Decryption uses `TM_KEYSTORE_PASSPHRASE` if set, otherwise prompts.
3. If neither is configured, every command refuses with `WALLET_NOT_CONFIGURED`.

The keystore uses scrypt N=131 072 / r=8 / p=1 + AES-256-GCM. Files are written atomically with mode `0600`. The auth tag covers the public header (version, scrypt params, address), so an attacker rewriting `kdfparams.N` to weaken the KDF fails decryption.

Create one with:

```sh
truthmarket wallet init                       # generates a new key, prompts for passphrase
truthmarket wallet init --private-key 0x...   # imports an existing key
truthmarket wallet init --force               # overwrites an existing keystore
```

Inspect with:

```sh
truthmarket wallet show
truthmarket wallet balance
```

Decrypt and print the raw key (only when you absolutely need it):

```sh
truthmarket wallet export --unsafe
```

---

## Vault

The vault stores the (vote, nonce, stake) tuple per market under `~/.truthmarket/vault/<chainId>-<contract>-<wallet>.json`, encrypted with AES-256-GCM keyed by PBKDF2-SHA256 (600 000 iterations). Without the nonce you cannot reveal a vote you've already committed, so the vault is the only thing that bridges commit and reveal — back it up.

```sh
truthmarket vault list
truthmarket vault show                        # decrypts the active wallet's entry
truthmarket vault export --output ./vote.bak  # encrypted blob, safe to copy off the box
truthmarket vault import --file ./vote.bak    # restore on another machine
```

The vault file format is v2: the public header (version, KDF params, market/chain/voter triple) is bound into AES-GCM `additionalData` so a tampered header invalidates the auth tag.

---

## Agent policy (ADR 0010)

Policy is enforced — not advisory. Without a configured policy file, `DEFAULT_POLICY` applies (`maxStake: "0"`, `requireSwarmVerification: false`, `allowJuryCommit: false`), which blocks all commits (zero stake) and jury commits. Run `policy set` first, or pass `--ignore-policy` to bypass per-command (intended for ad-hoc debugging). `--ignore-policy` still requires the policy file to be valid JSON; see Troubleshooting.

`requireSwarmVerification` defaults to `false`. When enabled, the CLI fetches the claim/rules document from the on-chain Swarm reference and verifies the content-addressed bytes before committing.

Example `policy.json`:

```json
{
  "autoReveal": true,
  "revealBufferMinutes": 30,
  "autoWithdraw": true,
  "maxStake": "1000000000000000000",
  "requireSwarmVerification": false,
  "allowCreateMarkets": false,
  "allowJuryCommit": false,
  "pollIntervalSeconds": 30
}
```

| Field | Enforced by | Behaviour |
|-------|-------------|-----------|
| `autoReveal`, `revealBufferMinutes`, `autoWithdraw`, `pollIntervalSeconds` | `heartbeat start` | controls the watcher loop |
| `maxStake` | `vote commit` | `"0"` → refuse; `stake > maxStake` → refuse |
| `requireSwarmVerification` | `vote commit` | when `true`, requires `--document <path>` and verifies it against the Swarm reference |
| `allowJuryCommit` | `jury commit` | `false` → refuse |
| `allowCreateMarkets` | `registry create-market`, `agent tick`, `agent run` | `false` → refuse market creation |

```sh
truthmarket policy show
truthmarket policy set --file ./policy.json
```

---

## Commands

`truthmarket --help` prints the full tree. Per-command flags via `truthmarket <group> <cmd> --help`.

### `wallet`

| Command | What it does |
|---------|--------------|
| `wallet init [--private-key 0x…] [--passphrase …] [--force]` | Create or replace the encrypted keystore. Generates a key if `--private-key` is omitted. |
| `wallet show` | Print active wallet address, chain, and key source (`env`/`keystore`). |
| `wallet balance` | ETH + stake-token balance and decimals. |
| `wallet export --unsafe` | Decrypt and print the raw private key. Refuses without `--unsafe`. |

### `market` (read-only)

| Command | What it does |
|---------|--------------|
| `market info` | Full config snapshot: phase, outcome, deadlines, stake token, and Swarm claim/rules reference. |
| `market phase` | Current phase enum + label. |
| `market stats` | Reveal-phase aggregates (commit count, totals, jury Yes/No, etc.). |
| `market jury` | List of selected jurors + active wallet's selection status. |
| `market watch [--interval-seconds n]` | Long-running phase/outcome tail. NDJSON when `--json`. |

### `registry`

| Command | What it does |
|---------|--------------|
| `registry info` | Read registry version, implementation address/version, total market count, and clone defaults. |
| `registry list [--offset n] [--limit n]` | List registered TruthMarket clone addresses; invalid clone bytecode is hidden and reported. |
| `registry create-market --spec <path> [--ignore-policy]` | Publish a claim/rules document to Swarm when needed, then create a minimal clone through `MarketRegistry.createMarket`. |
| `market verify-code` | Verify the target market is the registry implementation's minimal clone and report the Sourcify implementation match. |

`create-market` accepts either a raw `swarmReference` hex value or a `claimDocument` object:

```json
{
  "claimDocument": {
    "title": "Was this the best ETHPrague so far?",
    "context": "YES means selected jurors believe it was the best ETHPrague so far under the supplied public context. NO means selected jurors do not.",
    "tags": ["ethprague"]
  },
  "votingPeriod": 1200,
  "adminTimeout": 300,
  "revealPeriod": 1200,
  "minStake": "1000000000000000000",
  "jurySize": 1,
  "minCommits": 7,
  "minRevealedJurors": 1
}
```

When `claimDocument` is present, the CLI stores it through `@truth-market/swarm-kv`, puts the resulting `bzz://...` reference bytes on the clone, and prints the gateway URL.

### `agent`

| Command | What it does |
|---------|--------------|
| `agent tick [--json]` | Run one Apify-powered market creation attempt. Publishes the claim/rules document to Swarm by default. |
| `agent run [--interval-seconds n] [--json]` | Run the same loop continuously with NDJSON events. |

Use `--no-swarm-publish` only for offline demos. It falls back to a deterministic placeholder `swarmReference`, which is not a verifiable Swarm document and should not be used for commit policies that require claim/rules verification.

### `vote`

| Command | What it does |
|---------|--------------|
| `vote commit --vote yes\|no --stake <base-units> [--document <path>] [--swarm-gateway <url>] [--ignore-policy]` | Generate nonce, verify claim/rules when policy requires it, save vault entry, broadcast `commitVote`. |
| `vote reveal` | Reveal using the local vault. |
| `vote revoke --voter 0x… --vote yes\|no --nonce 0x…` | Slash another voter using their leaked nonce (voting phase only). |

### `withdraw`

`truthmarket withdraw` — pull the post-resolution payout for the active wallet.

### `vault`

| Command | What it does |
|---------|--------------|
| `vault list` | Enumerate vault files in `~/.truthmarket/vault/`. |
| `vault show [--voter 0x…]` | Decrypt and print one entry. |
| `vault export [--voter 0x…] [--output <path>]` | Emit the encrypted blob (base64 on stdout, or to a file). |
| `vault import --file <path>` | Restore an entry from a previously exported blob. |

### `erc20`

| Command | What it does |
|---------|--------------|
| `erc20 approve [--amount n\|max]` | Approve the stake token for the contract. Defaults to MaxUint256. |
| `erc20 allowance` | Print current allowance + decimals/symbol. |

### `jury`

| Command | What it does |
|---------|--------------|
| `jury status` | Am I selected? Have I revealed? When does reveal end? |
| `jury commit [--ignore-policy]` | Fetch the latest SpaceComputer IPFS/IPNS beacon, derive the cTRNG value, beacon metadata, and audit hash, then post the jury commitment (juryCommitter only). |

`jury commit` does not accept manual randomness fields. It reads `https://ipfs.io/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f` at execution time with cache-bypass headers and a query nonce, uses `data.ctrng[0]`, stores the canonical `/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f` beacon path plus `data.sequence`, `data.timestamp`, and `randomnessIndex = 0`, and sets `juryAuditHash` to the keccak256 hash of the exact beacon response bytes.

### `swarm`

| Command | What it does |
|---------|--------------|
| `swarm show-hash` | Print the on-chain Swarm reference. |
| `swarm verify --document <path> [--gateway <url>]` | Verify a local document against the Swarm reference. Mismatches exit 0; `data.match` carries the boolean. |

### `policy`

| Command | What it does |
|---------|--------------|
| `policy show` | Print the active policy (defaults if no file is set). |
| `policy set --file <path>` | Validate + install a policy at `~/.truthmarket/policy.json`. |

### `heartbeat`

| Command | What it does |
|---------|--------------|
| `heartbeat start` | Foreground loop: poll phase, auto-reveal, auto-withdraw per policy. NDJSON when `--json`. |
| `heartbeat status` | Show static config (running detection is foreground-only). |

### `dev`

| Command | What it does |
|---------|--------------|
| `dev up [--contracts-dir …] [--rpc-port 8545] [--accounts 12] [--skip-deploy]` | Spawn anvil, run `forge script SimulateAnvil.s.sol --sig "deploy()" --broadcast`, and write `.env` with the resolved chain + key. |
| `dev down` | SIGTERM the managed anvil process. |
| `dev status` | Report whether managed anvil is running and reachable. |

`dev up` reads the actual seed clone, registry, implementation, and token addresses from `contracts/.sim-anvil.json` after the forge script runs. Pair those values with the deterministic deployer key (anvil account 0) and you have a self-contained mock chain you can tear down at any time.

### `tui`

`truthmarket tui` — Ink-based interactive UI. Tabs:

1. **Dashboard** — phase, outcome, stake totals, deadlines, jury list (5 s polling).
2. **Vote / Reveal** — commit/reveal forms backed by the same `commitVoteCore` the CLI uses, so policy gates apply.
3. **Heartbeat** — start/stop the watcher; live event log.
4. **Wallet** — address, ETH + stake-token balance, allowance, vault entries.

`q` or Ctrl-C exits. `Tab` cycles tabs; `1`–`4` jumps directly.

---

## `--json` contract

Every non-streaming subcommand accepts:

- `--json` — single envelope on stdout.
- `--yes` — skip confirmation prompts.

Standard envelope:

```json
{ "ok": true, "data": { ... } }
```

On error, stderr gets:

```json
{ "ok": false, "error": { "code": "UPPER_SNAKE", "message": "human" } }
```

Exit codes: `0` success, `1` runtime/user error, `2` chain revert.

Streaming commands (`market watch`, `heartbeat start`) emit NDJSON — one JSON object per line on stdout.

`vault export`'s `data` always carries both `path` and `blob`; one is `null` depending on whether `--output` was set.

`swarm verify` exits 0 for document mismatches; the boolean is `data.match`. Chain, file, or gateway failures still exit as errors.

When `--json` is set, interactive prompts are an error (`INTERACTIVE_PROMPT_REQUIRED`). Set `PRIVATE_KEY`, `TM_KEYSTORE_PASSPHRASE`, `TM_VAULT_PASSPHRASE` ahead of time for unattended runs.

---

## Common workflows

### Local agent, local mock chain

```sh
truthmarket dev up
truthmarket policy set --file ./policy.json
truthmarket erc20 approve
truthmarket vote commit --vote yes --stake 1000000000000000000
TM_VAULT_PASSPHRASE=… truthmarket heartbeat start --json | tee heartbeat.ndjson
# heartbeat auto-reveals near revealBufferMinutes before deadline, auto-withdraws on resolve
```

### Headless server agent against Base Sepolia

```sh
# .env on the box (mode 0600; never committed)
cat <<'EOF' > /etc/truthmarket/.env
TM_CHAIN=baseSepolia
TM_RPC_URL=https://your.rpc/...
TM_CONTRACT_ADDRESS=0x...
TM_KEYSTORE_PASSPHRASE=...
TM_VAULT_PASSPHRASE=...
EOF

# systemd unit runs:
ExecStart=/usr/local/bin/truthmarket heartbeat start --json
WorkingDirectory=/etc/truthmarket
```

The keystore lives at `~/.truthmarket/keystore.json` (override with `TM_HOME`). Don't put the private key in `.env` — use the keystore + a passphrase env var.

### Recover a vote from another machine

```sh
# on the original machine
truthmarket vault export --output ./mainnet-vote.bak

# copy mainnet-vote.bak securely

# on the new machine, with the same wallet keystore + same passphrase
truthmarket vault import --file ./mainnet-vote.bak
truthmarket vault list
truthmarket vote reveal
```

### Pure JSON pipeline

```sh
truthmarket --json market info \
  | jq -r '.data.deadlines.reveal'
```

---

## Security model

The CLI keeps two encrypted files at rest, both under `~/.truthmarket/` with mode `0600`:

| File | Encrypts | KDF | Cipher |
|------|----------|-----|--------|
| `keystore.json` | Wallet private key (32 bytes) | scrypt N=131 072 r=8 p=1 | AES-256-GCM |
| `vault/<chainId>-<contract>-<wallet>.json` | (vote, nonce, stake) tuple per market | PBKDF2-SHA256 600 000 iters | AES-256-GCM |

Both file formats are version 2. The plaintext header (`version`, `kdfparams`, `cipher`, and the wallet/market/chain/voter triple where applicable) is bound into AES-GCM as `additionalData`, so an attacker who can write the file but doesn't know the passphrase cannot weaken the KDF parameters and brute-force offline — any header tamper invalidates the auth tag. Every save uses a fresh salt + IV; writes are atomic (write-tmp → rename).

**Protected against**

- Casual disk read of the encrypted file.
- KDF downgrade by a write-capable attacker (rewriting `iterations` or scrypt `N`).
- Concurrent reader/writer races (heartbeat reading while `vote commit` writes).

**Not protected against**

- A passphrase leaked via shell history, environment dumps, or process listings.
- Memory inspection while the CLI is running (passphrase / decrypted secrets are JS strings).
- Code execution on your machine.
- Cross-tool replay: the vault filename leaks `<chainId>-<contract>-<voter>` as metadata.
- A forgotten passphrase. Lose it and the staked vote becomes unrevealable. Back up `~/.truthmarket/`.

**Headless agents** must put the passphrase in env (`TM_KEYSTORE_PASSPHRASE`, `TM_VAULT_PASSPHRASE`). Treat those env vars like the keys themselves — restrict to the agent's process, never log them.

**Planned (not yet shipped)**: optional OS-keychain backend (macOS Keychain / libsecret / Windows Credential Manager) so interactive desktop users can unlock without re-typing a passphrase. Tracked separately because it adds a native dependency.

---

## Troubleshooting

**`POLICY_INVALID` even with `--ignore-policy`** — `--ignore-policy` skips the *gates* (maxStake, allowJuryCommit, requireSwarmVerification) but the policy file is still loaded and zod-validated first. Fix the file (or move it aside) and rerun.

**`SWARM_HASH_MISMATCH` for every document** — the fetched Swarm bytes do not match the local file, or the on-chain reference points at a different document. Verify you are using the exact deployed claim/rules bytes and the right market address.

**Vault entry exists but `vote reveal` reverts with `CommitNotFound`** — happens when `vote commit` saved the nonce locally but the broadcast reverted. Recover with:

```sh
truthmarket vault list                    # confirm the stale entry
rm ~/.truthmarket/vault/<chainId>-<contract>-<wallet>.json
# then retry: truthmarket vote commit ...
```

The save-before-broadcast ordering is intentional — losing the nonce *after* a successful commit would make the stake unrevealable.

**`PORT_IN_USE` from `dev up`** — something else is already listening on `127.0.0.1:8545` and it isn't a TruthMarket-managed anvil. Stop it (`lsof -i :8545`) or pass `--rpc-port 8546`.

**`ANVIL_NOT_FOUND` / `FORGE_NOT_FOUND`** — install Foundry: <https://book.getfoundry.sh/getting-started/installation>.

**TUI commit blocks with `POLICY_SWARM_VERIFICATION_REQUIRED`** — the TUI doesn't yet expose a `--document` picker. Either flip the policy or use `truthmarket vote commit --document …` from the command line.

**`INTERACTIVE_PROMPT_REQUIRED` when running with `--json`** — agents can't be prompted. Set `PRIVATE_KEY` (or both keystore + `TM_KEYSTORE_PASSPHRASE`) and `TM_VAULT_PASSPHRASE` before invoking the command.

---

## Tests

```sh
npm test
```

99 vitest cases across vault, keystore, atomic write, JSON envelope, SpaceComputer beacon parsing, swarm verify, wallet loader, policy gates, config resolution, commit-hash equivalence, `commitVoteCore` orchestration with mocked viem clients, and heartbeat lifecycle. AAD coverage is verified field-by-field for both the keystore and vault formats.
