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
│   ├── new-key           # generate keypair (--write to save to .env)
│   ├── anvil-up          # start anvil in background
│   ├── anvil-down        # stop background anvil
│   └── deploy            # deploy {token|market} [network]
├── src/
│   ├── TruthMarket.sol   # random-jury belief-resolution market
│   └── ExampleToken.sol  # ERC20 stake-token fixture (Burnable+Permit+Ownable cap)
├── test/
│   ├── TruthMarketLifecycle.t.sol
│   └── ExampleToken.t.sol
├── script/
│   ├── TruthMarket.s.sol # production deploy
│   ├── ExampleToken.s.sol# stake-token deploy (test/sim setups)
│   └── Simulate.s.sol    # local end-to-end scenarios (no broadcast)
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
cp .env.example .env
forge install        # pulls submodules (already done if you cloned)
forge build
forge test -vv
```

## Local emulation (anvil)

`anvil` ships with Foundry. It runs a deterministic local node on `127.0.0.1:8545`, chain id `31337`, with 10 pre-funded accounts.

The first dev account's private key (used by `.env.example`) is:
`0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
(address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`).

### Easy mode — `bin/` scripts

Everything you need lives in `bin/`. They source `.env` automatically, resolve deployed addresses from `broadcast/`, and require zero hand-editing.

```sh
bin/anvil-up                       # start anvil in background (writes .anvil.pid)
bin/deploy token                   # deploy ExampleToken to anvil
bin/deploy market                  # deploy TruthMarket to anvil
bin/anvil-down                     # stop background anvil
```

Same scripts work against any configured network: `bin/deploy market sepolia`, etc.

### Local end-to-end simulation

`script/Simulate.s.sol` runs full market scenarios in-process — no anvil, no broadcast. Use the `sim.sh` runner or call `forge script` directly:

```sh
./sim.sh                           # default: lifecycle (Yes outcome)
./sim.sh lifecycle
./sim.sh invalid-no-jury           # admin missed deadline → full refunds
./sim.sh invalid-too-few-reveals   # non-revealing jurors slashed full stake
./sim.sh tie-invalid               # 2-2 partial reveal → Invalid
./sim.sh random 0xDEADBEEF         # seeded random votes/stakes/reveals
./sim.sh all                       # all scenarios back to back
```

### Generating keys

```sh
bin/new-key                        # print new keypair only
bin/new-key --write                # also write PRIVATE_KEY to .env
bin/new-key --mnemonic             # 12-word HD wallet
```

### Manual mode — raw cast

```sh
# deploy
make deploy-token   NETWORK=anvil
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
| `make deploy-token`      | deploy `ExampleToken` (default `NETWORK=anvil`) |
| `make deploy-market`     | deploy `TruthMarket`                      |
| `make simulate`          | run the lifecycle scenario in-process     |
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
