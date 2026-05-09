# TruthMarket Agent CLI

Standalone CLI + TUI for interacting with the [`TruthMarket`](../../contracts/src/TruthMarket.sol) contract. Built for autonomous agents and headless operators that need to commit, reveal, watch deadlines, and auto-resolve participation, mirroring the on-chain commit-reveal flow used by [`apps/web`](../web/).

The contract address is hardcoded in [`src/config.ts`](src/config.ts) for the canonical deployment; export `TM_CONTRACT_ADDRESS` to override (useful for local anvil runs).

## Install

```sh
cd apps/cli
npm install
npm run build
# either install globally:
npm link
# or invoke directly:
node dist/cli.js --help
```

## Quickstart (local anvil)

```sh
# 1. deploy contracts
cd contracts && anvil &
forge script script/TruthMarket.s.sol --broadcast --rpc-url http://127.0.0.1:8545
# capture the deployed contract address from the broadcast log

# 2. point the CLI at it
cd apps/cli
export TM_CHAIN=foundry
export TM_CONTRACT_ADDRESS=0x...           # paste from forge output
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# (optional) export TM_VAULT_PASSPHRASE=...

# 3. work
truthmarket market info
truthmarket erc20 approve
# either configure policy:
echo '{ "autoReveal": true, "revealBufferMinutes": 30, "autoWithdraw": true, "maxStake": "10000000000000000000", "requireSwarmVerification": false, "allowCreateMarkets": false, "allowJuryCommit": false, "pollIntervalSeconds": 30 }' > /tmp/policy.json
truthmarket policy set --file /tmp/policy.json
truthmarket vote commit --vote yes --stake 1000000000000000000
# or skip enforcement for ad-hoc:
truthmarket vote commit --vote yes --stake 1000000000000000000 --ignore-policy
truthmarket vault list
# advance time past votingDeadline, juryCommitter calls commitJury, then:
truthmarket vote reveal
truthmarket withdraw

# 4. or interactively
truthmarket tui
```

## Wallets

Resolution order:

1. `PRIVATE_KEY` env (matches [`contracts/script/TruthMarket.s.sol`](../../contracts/script/TruthMarket.s.sol)).
2. Encrypted keystore at `~/.truthmarket/keystore.json`. Create with `truthmarket wallet init`. Decryption uses `TM_KEYSTORE_PASSPHRASE` if set, otherwise an interactive prompt.

The keystore is AES-256-GCM with scrypt KDF (N=131072, r=8, p=1).

## Vault

The CLI persists committed (vote, nonce, stake) tuples encrypted on disk under `~/.truthmarket/vault/<chainId>-<contract>-<wallet>.json`, AES-256-GCM with PBKDF2-SHA256 (600 000 iterations). Without the vault you cannot reveal, so back up `~/.truthmarket/` or run `vault export`/`vault import` between machines.

The web app uses an analogous AES-GCM scheme keyed off a wallet signature in `localStorage`. Cross-app interop is not guaranteed (key derivation differs); export the vault explicitly if you need to migrate.

## Agent policy (ADR 0010)

`~/.truthmarket/policy.json`:

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

`truthmarket policy set --file ./policy.json` validates and copies it into place.

**Policy is enforced — not advisory.** Without a configured policy file, `DEFAULT_POLICY` applies (`maxStake: "0"`, `requireSwarmVerification: false`, `allowJuryCommit: false`), which blocks all commits (zero stake) and jury commits. Run `policy set` first, or pass `--ignore-policy` to bypass per-command (logged plainly; intended for ad-hoc debugging). `--ignore-policy` still requires the policy file to be valid JSON; see Troubleshooting below.

`requireSwarmVerification` defaults to `false` because the current verifier only matches deployments whose `ipfsHash` is a raw keccak256 — see Troubleshooting.

| Field | Enforced by | Behavior |
|-------|-------------|----------|
| `autoReveal`, `revealBufferMinutes`, `autoWithdraw`, `pollIntervalSeconds` | `heartbeat start` | controls the watcher loop |
| `maxStake` | `vote commit` | `"0"` → refuse; `stake > maxStake` → refuse |
| `requireSwarmVerification` | `vote commit` | when `true`, requires `--document <path>` and verifies it against `ipfsHash()` |
| `allowJuryCommit` | `jury commit` | `false` → refuse |
| `allowCreateMarkets` | (n/a in this contract version) | reserved |

## `--json` contract

Every non-streaming subcommand accepts `--json`. Output is one envelope on stdout:

```json
{ "ok": true, "data": { ... } }
```

Errors go to stderr as `{ "ok": false, "error": { "code": "UPPER_SNAKE", "message": "human" } }`. Exit codes: `0` success, `1` runtime/user error, `2` chain revert.

`heartbeat start --json` and `market watch --json` emit NDJSON (one JSON object per line) — these are streaming commands.

`swarm verify` always exits 0 on a successful verification *operation*; the boolean result lives at `data.match`. A no-match is not an error.

`vault export` always returns `{ voter, path, blob }`. Without `--output`, `path` is `null` and `blob` carries the base64 ciphertext on stdout. With `--output <path>`, the file is written and `blob` is `null`.

When `--json` is set, interactive prompts are an error. Set `PRIVATE_KEY`, `TM_KEYSTORE_PASSPHRASE`, `TM_VAULT_PASSPHRASE` ahead of time for unattended runs.

## Subcommand reference

```text
wallet init|show|balance|export
market info|phase|stats|jury|watch
vote commit|reveal|revoke
withdraw
vault list|show|export|import
erc20 approve|allowance
jury status|commit
swarm show-hash|verify
policy show|set
heartbeat start|status
tui
```

`truthmarket --help` and `truthmarket <group> --help` give per-command flags.

## Environment

- `PRIVATE_KEY` — hex private key (with or without 0x).
- `TM_CHAIN` — `foundry` | `baseSepolia` | `sepolia`.
- `TM_RPC_URL` — RPC URL override.
- `TM_CONTRACT_ADDRESS` — contract address override.
- `TM_KEYSTORE_PASSPHRASE` — non-interactive keystore unlock.
- `TM_VAULT_PASSPHRASE` — non-interactive vault unlock.
- `TM_POLICY_FILE` — policy file override (default `~/.truthmarket/policy.json`).
- `TM_HOME` — override `~/.truthmarket` base dir.

## Security model

The CLI keeps two encrypted files at rest, both under `~/.truthmarket/` with mode `0600`:

| File | Encrypts | KDF | Cipher |
|------|----------|-----|--------|
| `keystore.json` | Wallet private key (32 bytes) | scrypt N=131072 r=8 p=1 | AES-256-GCM |
| `vault/<chainId>-<contract>-<wallet>.json` | (vote, nonce, stake) tuple per market | PBKDF2-SHA256 600 000 iters | AES-256-GCM |

Both file formats are version 2. The plaintext header (`version`, `kdfparams`, `cipher`, and the wallet/market/chain/voter triple where applicable) is bound into AES-GCM as `additionalData`, so an attacker who can write the file but doesn't know the passphrase cannot weaken the KDF parameters and brute-force offline — any header tamper invalidates the auth tag and decryption fails. Every save uses a fresh salt + IV; writes are atomic (`write tmp → rename`).

**What this protects against**

- Casual disk read of the encrypted file: AES-GCM with a strong passphrase keeps the secret confidential.
- KDF downgrade by a write-capable attacker (rewriting `iterations` or scrypt `N`): caught by the AAD binding.
- Concurrent reader/writer races (heartbeat reading while `vote commit` writes): atomic rename means the reader either sees the old or new file, never a partial one.

**What this does NOT protect against**

- A passphrase leaked via shell history, environment dumps, or process listings (`TM_VAULT_PASSPHRASE`, `TM_KEYSTORE_PASSPHRASE`).
- Memory inspection while the CLI is running (the passphrase and decrypted secrets are JS strings/`Uint8Array`s; we don't pin or zero them).
- An attacker with code execution on your machine.
- Cross-tool replay: the vault filename leaks `<chainId>-<contract>-<voter>` as metadata. Anyone with read access learns *which* markets you've voted in, even before they crack the encryption.
- A forgotten passphrase. There is no recovery path; lose the passphrase and the staked vote becomes unrevealable. Back up `~/.truthmarket/` plus your passphrases somewhere safe.

**Headless agents** must put the passphrase in env (`TM_KEYSTORE_PASSPHRASE`, `TM_VAULT_PASSPHRASE`). Treat those env vars like the keys themselves — restrict to the agent's process, never log them.

**Planned (not yet shipped)**: optional OS-keychain backend (macOS Keychain / libsecret / Windows Credential Manager) so interactive desktop users can unlock without re-typing a passphrase. Tracked separately because it adds a native dependency.

## Troubleshooting

**`POLICY_INVALID` even with `--ignore-policy`** — `--ignore-policy` skips the *gates* (maxStake, allowJuryCommit, requireSwarmVerification) but the policy file is still loaded and zod-validated first. Fix the file (or move it aside) and rerun.

**`SWARM_HASH_MISMATCH` for every document** — the current verifier only matches deployments whose `ipfsHash` is a raw keccak256. CID/multihash deployments need decoding that is not yet implemented. Either keep `requireSwarmVerification: false` (the default) or pass `--ignore-policy` until multihash support lands.

**Vault entry exists but `vote reveal` reverts with `CommitNotFound`** — happens when `vote commit` saved the nonce locally but the broadcast reverted. Recover with:

```sh
truthmarket vault list                    # confirm the stale entry
rm ~/.truthmarket/vault/<chainId>-<contract>-<wallet>.json
# then retry: truthmarket vote commit ...
```

The save-before-broadcast ordering is intentional — losing the nonce *after* a successful commit would make the stake unrevealable. The trade-off is the rare stale-on-revert case above.

## Tests

```sh
npm test
```

Covers vault round-trip, keystore round-trip, policy validation, config resolution, and the local commit-hash equivalence with the contract's `_commitHash` encoding.
