-include .env
export

.PHONY: help install update build test test-gas coverage fmt fmt-check snapshot clean anvil deploy-market simulate

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
	@echo "  deploy-market  NETWORK=anvil  - deploy TruthMarket"
	@echo "  simulate        - run lifecycle scenario in-process"
	@echo "  clean           - remove build artifacts"

NETWORK ?= anvil
BROADCAST ?= --broadcast
FORGE ?= $(shell if [ -x "$$HOME/.foundry/bin/forge" ]; then printf "%s" "$$HOME/.foundry/bin/forge"; else command -v forge; fi)

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

simulate:
	$(FORGE) script script/Simulate.s.sol --sig 'lifecycle()' -vv

clean:
	$(FORGE) clean
