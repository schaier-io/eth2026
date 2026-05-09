# TruthMarket Agent CLI

Standalone CLI + TUI for interacting with the [`TruthMarket`](../../contracts/src/TruthMarket.sol) contract. Built for autonomous agents and headless operators that need to commit, reveal, watch deadlines, and auto-resolve participation, mirroring the on-chain commit-reveal flow used by [`apps/web`](../web/).

## Contents

- [Install](#install)
- [Quickstart (local anvil)](#quickstart-local-anvil)
- [Quickstart (Base Sepolia / Sepolia)](#quickstart-base-sepolia--sepolia)
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

## Install

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
- For `truthmarket dev *`: [Foundry](https://book.getfoundry.sh/getting-started/installation) (`anvil` and `forge` on PATH)

---

## Quickstart (local anvil)

The CLI ships a one-shot bootstrapper that spawns `anvil`, deploys the contract via the existing `SimulateAnvil.s.sol::deploy()` script, and writes a working `.env` for you:

```sh
cd apps/cli
truthmarket dev up
# anvil up at http://127.0.0.1:8545 (pid 12345)
# contract: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
# stake token: 0x5FbDB2315678afecb367f032d93F642f64180aa3
# wrote env: /…/apps/cli/.env

# the .env is auto-loaded on every truthmarket call from this directory
truthmarket market info
truthmarket erc20 approve
echo '{ "autoReveal":true,"revealBufferMinutes":30,"autoWithdraw":true,"maxStake":"100000000000000000000","requireSwarmVerification":false,"allowCreateMarkets":false,"allowJuryCommit":false,"pollIntervalSeconds":30 }' \
  > /tmp/policy.json
truthmarket policy set --file /tmp/policy.json
truthmarket vote commit --vote yes --stake 1000000000000000000
truthmarket vault list
# advance the chain past votingDeadline, run jury commit, advance past reveal phase, then:
truthmarket vote reveal
truthmarket withdraw

# tear it all down
truthmarket dev down
```

`dev up` is idempotent: if anvil is already running on the configured port and the PID file matches, it just re-runs the deploy and rewrites `.env`. Pass `--rpc-port` to use a different port. Pass `--skip-deploy` to spawn anvil without redeploying.

You can also run `dev up --skip-deploy`, do your own deploys, and let the CLI just manage anvil + .env wiring.

---

## Quickstart (Base Sepolia / Sepolia)

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

`requireSwarmVerification` defaults to `false` because the current verifier only matches deployments whose `ipfsHash` is a raw keccak256 — see Troubleshooting.

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
| `requireSwarmVerification` | `vote commit` | when `true`, requires `--document <path>` and verifies it against `ipfsHash()` |
| `allowJuryCommit` | `jury commit` | `false` → refuse |
| `allowCreateMarkets` | (n/a in this contract version) | reserved |

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
| `market info` | Full config snapshot: name, description, tags, phase, outcome, deadlines, stake token, ipfsHash. |
| `market phase` | Current phase enum + label. |
| `market stats` | Reveal-phase aggregates (commit count, totals, jury Yes/No, etc.). |
| `market jury` | List of selected jurors + active wallet's selection status. |
| `market watch [--interval-seconds n]` | Long-running phase/outcome tail. NDJSON when `--json`. |

### `vote`

| Command | What it does |
|---------|--------------|
| `vote commit --vote yes\|no --stake <base-units> [--document <path>] [--ignore-policy]` | Generate nonce, save vault entry, broadcast `commitVote`. |
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
| `jury commit --randomness <uint256> --audit-hash 0x… [--ignore-policy]` | Post jury commitment (juryCommitter only). |

### `swarm`

| Command | What it does |
|---------|--------------|
| `swarm show-hash` | Print the on-chain `ipfsHash()` bytes. |
| `swarm verify --document <path>` | Verify a local document against `ipfsHash()`. Always exits 0; result lives in `data.match`. |

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

The contract address that `dev up` writes is the deterministic `MARKET_ADDR = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` — the second contract deployed by the deterministic anvil deployer. Pair with the deterministic deployer key (anvil account 0) and you have a self-contained mock chain you can tear down at any time.

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

`swarm verify` always exits 0; the boolean is `data.match`.

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

**`SWARM_HASH_MISMATCH` for every document** — the current verifier only matches deployments whose `ipfsHash` is a raw keccak256. CID/multihash deployments need decoding that is not yet implemented. Either keep `requireSwarmVerification: false` (the default) or pass `--ignore-policy` until multihash support lands.

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

82 vitest cases across vault, keystore, atomic write, JSON envelope, swarm verify, wallet loader, policy gates, config resolution, commit-hash equivalence, `commitVoteCore` orchestration with mocked viem clients, and heartbeat lifecycle. AAD coverage is verified field-by-field for both the keystore and vault formats.
