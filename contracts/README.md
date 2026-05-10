<p align="center">
  <img src="../brand-mark.svg" alt="TruthMarket" width="96" />
</p>

# eth2026 / contracts

TruthMarket smart contracts and Foundry tooling.

**Stack**

- [Foundry](https://book.getfoundry.sh/) `1.7.x` — `forge` (build/test), `anvil` (local node), `cast` (RPC), `chisel` (REPL)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/5.x/) `v5.x`
- Solidity `0.8.28`, EVM `cancun`
- `forge-std` for testing cheatcodes / scripting

## Layout

```
contracts/
├── foundry.toml          # solc/optimizer/RPC config
├── remappings.txt        # @openzeppelin/contracts/* → lib/...
├── Makefile              # common commands
├── sim.sh                # scenario runner for script/Simulate.s.sol
├── .env.example          # copy to .env, fill in
├── bin/                  # CLI helpers (bash)
│   ├── setup             # one-shot bootstrap (.env + build)
│   ├── new-key           # generate keypair (--write to save to .env)
│   ├── anvil-up          # start anvil in background
│   ├── anvil-down        # stop background anvil
│   ├── deploy            # deploy market [network]
│   └── sim-anvil         # full lifecycle against fresh anvil
├── src/
│   ├── TruthMarket.sol         # random-jury belief-resolution market implementation
│   ├── MarketRegistry.sol      # EIP-1167 clone factory + discovery index
│   └── TruthMarketRegistry.sol # legacy standalone discovery registry
├── test/
│   ├── MarketRegistry.t.sol
│   ├── TruthMarketLifecycle.t.sol
│   └── MockERC20.sol     # minimal stake-token used by tests + sims (open mint)
├── script/
│   ├── TruthMarketReferenceDeployment.sol # CREATE2 address helper for clone reference
│   ├── TruthMarketReference.s.sol # CREATE2-deploy clone reference implementation
│   ├── MarketRegistry.s.sol   # deploy clone registry, optionally reusing a reference
│   ├── TruthMarket.s.sol      # create a market clone through MarketRegistry
│   ├── Simulate.s.sol         # in-process scenarios (no broadcast)
│   └── SimulateAnvil.s.sol    # broadcast-based phases for bin/sim-anvil
└── lib/
    ├── forge-std/
    └── openzeppelin-contracts/
```

## Prerequisites

Foundry installed (see [foundry.paradigm.xyz](https://foundry.paradigm.xyz)). If `forge` isn't on `PATH`:

```sh
export PATH="$HOME/.foundry/bin:$PATH"
foundryup            # update to latest
```

The `Makefile` and `bin/deploy` prefer `$HOME/.foundry/bin/forge` when it exists.

## Setup

```sh
cd contracts
./bin/setup          # creates .env, runs forge build
forge test -vv
```

`bin/setup` is the one-shot bootstrap: it copies `.env.example → .env` if missing and builds. Equivalent manual steps:

```sh
cp .env.example .env
forge install
forge build
```

## Stake token assumption

Each `TruthMarket` clone expects its `stakeToken` to be a plain, non-rebasing, no-fee ERC20. The contract records the
actual token amount received during `commitVote`, but payout math assumes recorded stake units remain transferable
1:1 for the full market lifecycle. Do not deploy markets with rebasing tokens, fee-on-transfer tokens, or tokens
with other balance-changing transfer mechanics.

## Local emulation (anvil)

`anvil` ships with Foundry. It runs a deterministic local node on `127.0.0.1:8545`, chain id `31337`, with 10 pre-funded accounts.

The first dev account's private key (used by `.env.example`) is:
`0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
(address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`).

### Easy mode — `bin/` scripts

Everything you need lives in `bin/`. They source `.env` automatically, resolve deployed addresses from `broadcast/`, and require zero hand-editing.

```sh
bin/anvil-up                       # start anvil in background (writes .anvil.pid)
bin/deploy reference predict       # print predictable TruthMarket reference implementation
bin/deploy reference sepolia       # CREATE2-deploy TruthMarket reference implementation
bin/deploy registry sepolia        # deploy MarketRegistry; reuses/deploys the deterministic reference unless overridden
bin/deploy market                  # create a TruthMarket clone (provide REGISTRY_ADDRESS + STAKE_TOKEN in .env)
bin/anvil-down                     # stop background anvil
```

Same script works against any configured network: `bin/deploy market sepolia`, etc.

### Local end-to-end simulation

Two modes:

**1. In-process** (`script/Simulate.s.sol` + `sim.sh`) — no anvil, no broadcast. Cheatcodes drive everything in a forge-script EVM. Fast, ephemeral state.

```sh
./sim.sh                           # default: lifecycle (Yes outcome)
./sim.sh lifecycle
./sim.sh invalid-no-jury           # admin missed deadline → full refunds
./sim.sh invalid-too-few-reveals   # non-revealing jurors slashed full stake
./sim.sh tie-invalid               # 2-2 partial reveal → Invalid
./sim.sh random 0xDEADBEEF         # seeded random votes/stakes/reveals
./sim.sh all                       # all scenarios back to back
```

**2. Anvil-backed** (`script/SimulateAnvil.s.sol` + `bin/sim-anvil`) — actually deploys to a fresh anvil node, broadcasts each phase as the matching anvil account, advances chain time between phases via `cast rpc evm_increaseTime`. Anvil keeps running afterwards so you can poke state with `cast`.

```sh
./bin/sim-anvil                    # spins up anvil, runs full lifecycle, prints state
./bin/anvil-down                   # stop anvil when finished
```

Each phase is a separate forge-script sig (`deploy() / commit() / commitJury() / reveal() / resolve()`); the bash driver advances anvil time between them.

### Generating keys

```sh
bin/new-key                        # print new keypair only
bin/new-key --write                # also write PRIVATE_KEY to .env
bin/new-key --mnemonic             # 12-word HD wallet
```

### Manual mode — raw cast

```sh
# deploy (STAKE_TOKEN must be set to a real ERC20 in .env)
make deploy-market  NETWORK=anvil

# read state
cast call <market_addr> "outcome()(uint8)" --rpc-url anvil

# write state
cast send <market_addr> "resolve()" \
  --rpc-url anvil \
  --private-key $PRIVATE_KEY

# inspect chain
cast block-number --rpc-url anvil
cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url anvil
```

### Forking mainnet locally

Replay against real state without spending gas:

```sh
anvil --fork-url $MAINNET_RPC_URL --chain-id 1
# or pin a block:
anvil --fork-url $MAINNET_RPC_URL --fork-block-number 19000000
```

## Common commands

| Command                  | What it does                              |
|--------------------------|-------------------------------------------|
| `make build`             | compile                                   |
| `make test`              | run all tests                             |
| `make test-gas`          | tests + gas report                        |
| `make coverage`          | lcov coverage report                      |
| `make fmt` / `fmt-check` | format / check formatting                 |
| `make snapshot`          | gas snapshot to `.gas-snapshot`           |
| `make anvil`             | local node on `:8545`                     |
| `make setup`             | bootstrap (.env, build)                   |
| `make deploy-market`     | deploy `TruthMarket` (default `NETWORK=anvil`) |
| `make simulate`          | run the lifecycle scenario in-process     |
| `make simulate-anvil`    | run the full lifecycle against a fresh anvil |
| `make clean`             | remove build artifacts                    |

Override the RPC: `make deploy-market NETWORK=sepolia`.

## Deploying to a testnet/mainnet

1. Fill `.env` with `PRIVATE_KEY`, `<NET>_RPC_URL`, and an explorer key.
2. Verify on Etherscan in one shot:

```sh
forge script script/TruthMarket.s.sol:TruthMarketScript \
  --rpc-url sepolia \
  --broadcast \
  --verify \
  -vvvv
```

`broadcast/` will hold the deployment artifacts (addresses, txs, ABIs).

## Testing notes

- Forge tests are written in Solidity and run on a forked EVM. Cheatcodes live on `vm.*` (see `forge-std`).
- Fuzz/invariant runs configured via the `[profile.ci]` profile: `FOUNDRY_PROFILE=ci forge test`.
- `vm.expectRevert(Selector.selector)` for custom errors; `abi.encodeWithSelector(Err.selector, ...args)` for parameterised reverts.

## Updating libs

```sh
forge update                                    # all
forge update lib/openzeppelin-contracts         # one
```

## References

- Foundry book: https://book.getfoundry.sh/
- OpenZeppelin Contracts v5: https://docs.openzeppelin.com/contracts/5.x/
- Solidity 0.8.28 changelog: https://soliditylang.org/blog/
