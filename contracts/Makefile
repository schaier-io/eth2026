-include .env
export

.PHONY: help install update build test test-gas coverage fmt fmt-check snapshot clean anvil deploy-counter deploy-token verify-counter

help:
	@echo "Targets:"
	@echo "  install         - install/update git submodule libs"
	@echo "  update          - bump libs to latest tags"
	@echo "  build           - compile contracts"
	@echo "  test            - run all forge tests"
	@echo "  test-gas        - run tests with gas report"
	@echo "  coverage        - generate coverage report (lcov.info)"
	@echo "  fmt / fmt-check - format / check formatting"
	@echo "  snapshot        - generate gas snapshots"
	@echo "  anvil           - start local anvil node on :8545 (foreground)"
	@echo "  anvil-up        - start anvil in background (bin/anvil-up)"
	@echo "  anvil-down      - stop background anvil (bin/anvil-down)"
	@echo "  new-key         - generate fresh keypair (bin/new-key)"
	@echo "  new-key-write   - generate keypair AND write to .env"
	@echo "  deploy-counter NETWORK=anvil  - deploy Counter"
	@echo "  deploy-token   NETWORK=anvil  - deploy ExampleToken"
	@echo "  clean           - remove build artifacts"

NETWORK ?= anvil
BROADCAST ?= --broadcast

install:
	forge install

update:
	forge update

build:
	forge build

test:
	forge test -vv

test-gas:
	forge test --gas-report

coverage:
	forge coverage --report lcov

fmt:
	forge fmt

fmt-check:
	forge fmt --check

snapshot:
	forge snapshot

anvil:
	anvil --host 0.0.0.0 --chain-id 31337

anvil-up:
	./bin/anvil-up

anvil-down:
	./bin/anvil-down

new-key:
	./bin/new-key

new-key-write:
	./bin/new-key --write

deploy-counter:
	forge script script/Counter.s.sol:CounterScript --rpc-url $(NETWORK) $(BROADCAST) -vvvv

deploy-token:
	forge script script/ExampleToken.s.sol:ExampleTokenScript --rpc-url $(NETWORK) $(BROADCAST) -vvvv

clean:
	forge clean
