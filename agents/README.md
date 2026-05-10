<p align="center">
  <img src="../brand-mark.svg" alt="TruthMarket" width="96" />
</p>

# TruthMarket Agents

Root-level agents live here so they can evolve independently from the CLI.

- `apify/` owns the Apify-powered market-creation runtime.

The CLI may expose thin command adapters for agents, but agent business logic should stay in this directory.

CLI build/test scripts rebuild the agent packages they depend on before compiling the CLI.
