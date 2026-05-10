-include .env
export

.PHONY: help setup install update build test test-gas coverage fmt fmt-check snapshot clean anvil anvil-up anvil-down predict-reference deploy-market deploy-reference deploy-registry simulate simulate-anvil new-key new-key-write

help:
	@echo "Targets:"
	@echo "  setup           - one-shot bootstrap (creates .env, builds)"
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
	@echo "  deploy-market   NETWORK=anvil  - create TruthMarket clone"
	@echo "  predict-reference          - print deterministic TruthMarket reference address"
	@echo "  deploy-reference NETWORK=sepolia - CREATE2-deploy TruthMarket reference implementation"
	@echo "  deploy-registry NETWORK=anvil  - deploy MarketRegistry"
	@echo "  simulate        - run lifecycle scenario in-process (no anvil)"
	@echo "  simulate-anvil  - run full lifecycle against fresh anvil (bin/sim-anvil)"
	@echo "  clean           - remove build artifacts"

NETWORK ?= anvil
BROADCAST ?= --broadcast
FORGE ?= $(shell if [ -x "$$HOME/.foundry/bin/forge" ]; then printf "%s" "$$HOME/.foundry/bin/forge"; else command -v forge; fi)

setup:
	./bin/setup

install:
	$(FORGE) install

update:
	$(FORGE) update

build:
	$(FORGE) build

test:
	$(FORGE) test -vv

test-gas:
	$(FORGE) test --gas-report

coverage:
	$(FORGE) coverage --report lcov

fmt:
	$(FORGE) fmt

fmt-check:
	$(FORGE) fmt --check

snapshot:
	$(FORGE) snapshot

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

deploy-market:
	$(FORGE) script script/TruthMarket.s.sol:TruthMarketScript --rpc-url $(NETWORK) $(BROADCAST) -vvvv

deploy-reference:
	$(FORGE) script script/TruthMarketReference.s.sol:TruthMarketReferenceScript --rpc-url $(NETWORK) $(BROADCAST) -vvvv

predict-reference:
	$(FORGE) script script/TruthMarketReference.s.sol:TruthMarketReferenceScript --sig 'predict()'

deploy-registry:
	$(FORGE) script script/MarketRegistry.s.sol:MarketRegistryScript --rpc-url $(NETWORK) $(BROADCAST) -vvvv

simulate:
	$(FORGE) script script/Simulate.s.sol --sig 'lifecycle()' -vv

simulate-anvil:
	./bin/sim-anvil

clean:
	$(FORGE) clean
