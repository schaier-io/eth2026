# eth2026 / contracts

Ethereum smart-contract boilerplate.

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
├── .env.example          # copy to .env, fill in
├── bin/                  # CLI helpers (bash)
│   ├── new-key           # generate keypair (--write to save to .env)
│   ├── anvil-up          # start anvil in background
│   ├── anvil-down        # stop background anvil
│   ├── deploy            # deploy {counter|token} [network]
│   └── counter           # {read|inc|inc-by N|set N} [network]
├── src/
│   ├── Counter.sol       # minimal example w/ events + custom errors
│   └── ExampleToken.sol  # ERC20 + Burnable + Permit + Ownable cap
├── test/
│   ├── Counter.t.sol
│   └── ExampleToken.t.sol
├── script/
│   ├── Counter.s.sol
│   └── ExampleToken.s.sol
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
bin/deploy counter                 # deploy Counter to anvil
bin/counter read                   # → 0
bin/counter inc                    # → 1
bin/counter inc-by 5               # → 6
bin/counter set 100                # → 100
bin/deploy token                   # deploy ExampleToken
bin/anvil-down                     # stop background anvil
```

Same scripts work against any configured network: `bin/deploy counter sepolia`, `bin/counter read sepolia`, etc.

### Generating keys

```sh
bin/new-key                        # print new keypair only
bin/new-key --write                # also write PRIVATE_KEY to .env
bin/new-key --mnemonic             # 12-word HD wallet
```

### Manual mode — raw cast

```sh
# deploy
make deploy-counter NETWORK=anvil
make deploy-token   NETWORK=anvil

# read state
cast call <counter_addr> "number()(uint256)" --rpc-url anvil

# write state
cast send <counter_addr> "increment()" \
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
| `make deploy-counter`    | deploy `Counter` (default `NETWORK=anvil`)|
| `make deploy-token`      | deploy `ExampleToken`                     |
| `make clean`             | remove build artifacts                    |

Override the RPC: `make deploy-counter NETWORK=sepolia`.

## Deploying to a testnet/mainnet

1. Fill `.env` with `PRIVATE_KEY`, `<NET>_RPC_URL`, and an explorer key.
2. Verify on Etherscan in one shot:

```sh
forge script script/Counter.s.sol:CounterScript \
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
