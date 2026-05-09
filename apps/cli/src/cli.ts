#!/usr/bin/env node
import { Command } from "commander";
import { loadDotenv } from "./util/dotenv.js";

// Auto-apply a .env file from cwd (or any ancestor up to 5 levels). Explicit
// shell exports always win — we only fill missing keys. Everything else
// downstream just reads process.env.
loadDotenv();
import {
  cmdDevDown,
  cmdDevStatus,
  cmdDevUp,
} from "./commands/dev.js";
import {
  cmdErc20Allowance,
  cmdErc20Approve,
} from "./commands/erc20.js";
import {
  cmdHeartbeatStart,
  cmdHeartbeatStatus,
} from "./commands/heartbeat.js";
import {
  cmdJuryCommit,
  cmdJuryStatus,
} from "./commands/jury.js";
import {
  cmdMarketInfo,
  cmdMarketJury,
  cmdMarketPhase,
  cmdMarketStats,
  cmdMarketWatch,
} from "./commands/market.js";
import {
  cmdPolicySet,
  cmdPolicyShow,
} from "./commands/policy.js";
import {
  cmdSwarmShowHash,
  cmdSwarmVerify,
} from "./commands/swarm.js";
import { cmdTui } from "./commands/tui.js";
import {
  cmdVaultExport,
  cmdVaultImport,
  cmdVaultList,
  cmdVaultShow,
} from "./commands/vault.js";
import {
  cmdVoteCommit,
  cmdVoteReveal,
  cmdVoteRevoke,
  cmdWithdraw,
} from "./commands/vote.js";
import {
  cmdWalletBalance,
  cmdWalletExport,
  cmdWalletInit,
  cmdWalletShow,
} from "./commands/wallet.js";
import { asCliError } from "./errors.js";
import { type OutputContext, emitError } from "./io.js";

const program = new Command();
program
  .name("truthmarket")
  .description("TruthMarket agent CLI — interact with the random-jury belief-resolution market.")
  .version("0.1.0")
  .showHelpAfterError();

/** Add the global flags every non-streaming subcommand honors. */
function shared(cmd: Command): Command {
  return cmd
    .option("--chain <key>", "chain key: foundry | baseSepolia | sepolia")
    .option("--rpc <url>", "RPC URL override")
    .option("--address <addr>", "TruthMarket contract address override")
    .option("--json", "machine-readable JSON output (single envelope; NDJSON for streaming commands)", false)
    .option("--yes", "skip confirmation prompts (use with --json for unattended runs)", false);
}

function ctx(opts: { json?: boolean; yes?: boolean }): OutputContext {
  return { json: !!opts.json, yes: !!opts.yes };
}

async function run(fn: () => Promise<void>, c: OutputContext): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const err = asCliError(e);
    emitError(c, err);
  }
}

// -------- wallet --------
const wallet = program.command("wallet").description("manage local agent wallet");
shared(wallet.command("init")
  .description("create or replace the encrypted keystore"))
  .option("--private-key <hex>", "import an existing private key (else generate)")
  .option("--passphrase <pw>", "passphrase (else prompt or TM_KEYSTORE_PASSPHRASE)")
  .option("--force", "overwrite an existing keystore", false)
  .action(async (opts) => run(() => cmdWalletInit(ctx(opts), opts), ctx(opts)));

shared(wallet.command("show").description("print active wallet address"))
  .action(async (opts) => run(() => cmdWalletShow(ctx(opts), opts), ctx(opts)));

shared(wallet.command("balance").description("print ETH + stake-token balances"))
  .action(async (opts) => run(() => cmdWalletBalance(ctx(opts), opts), ctx(opts)));

shared(wallet.command("export").description("decrypt and print the private key (--unsafe required)"))
  .option("--unsafe", "explicit confirmation that you understand this prints the raw key", false)
  .action(async (opts) => run(() => cmdWalletExport(ctx(opts), opts), ctx(opts)));

// -------- market --------
const market = program.command("market").description("read market state");
shared(market.command("info").description("full config snapshot"))
  .action(async (opts) => run(() => cmdMarketInfo(ctx(opts), opts), ctx(opts)));

shared(market.command("phase").description("current phase enum"))
  .action(async (opts) => run(() => cmdMarketPhase(ctx(opts), opts), ctx(opts)));

shared(market.command("stats").description("reveal-phase aggregates"))
  .action(async (opts) => run(() => cmdMarketStats(ctx(opts), opts), ctx(opts)));

shared(market.command("jury").description("jury list + active wallet's selection status"))
  .action(async (opts) => run(() => cmdMarketJury(ctx(opts), opts), ctx(opts)));

shared(market.command("watch").description("long-running phase/outcome tail (NDJSON when --json)"))
  .option("--interval-seconds <n>", "poll interval", (v) => Number(v), 10)
  .action(async (opts) => run(() => cmdMarketWatch(ctx(opts), opts), ctx(opts)));

// -------- vote --------
const vote = program.command("vote").description("commit-reveal flows");
shared(vote.command("commit").description("commit a hidden vote with stake"))
  .requiredOption("--vote <yes|no>", "vote (1=yes, 2=no)")
  .requiredOption("--stake <amount>", "stake in token base units")
  .option("--document <path>", "local copy of the swarm rules document for verification (required when policy.requireSwarmVerification)")
  .option("--swarm-gateway <url>", "Swarm gateway for claim/rules verification (else TM_SWARM_GATEWAY_URL or package default)")
  .option("--ignore-policy", "skip local policy gates (maxStake, requireSwarmVerification)", false)
  .action(async (opts) => run(() => cmdVoteCommit(ctx(opts), opts), ctx(opts)));

shared(vote.command("reveal").description("reveal an existing commit using local vault"))
  .action(async (opts) => run(() => cmdVoteReveal(ctx(opts), opts), ctx(opts)));

shared(vote.command("revoke").description("slash another voter using their leaked nonce"))
  .requiredOption("--voter <addr>", "voter being revoked")
  .requiredOption("--vote <yes|no>", "their committed vote")
  .requiredOption("--nonce <hex>", "their leaked nonce (32-byte hex)")
  .action(async (opts) => run(() => cmdVoteRevoke(ctx(opts), opts), ctx(opts)));

// -------- withdraw --------
shared(program.command("withdraw").description("withdraw post-resolution payout"))
  .action(async (opts) => run(() => cmdWithdraw(ctx(opts), opts), ctx(opts)));

// -------- vault --------
const vault = program.command("vault").description("manage local nonce vault");
shared(vault.command("list").description("list vault entries"))
  .action(async (opts) => run(() => cmdVaultList(ctx(opts), opts), ctx(opts)));

shared(vault.command("show").description("decrypt and print one entry"))
  .option("--voter <addr>", "voter address (defaults to active wallet)")
  .action(async (opts) => run(() => cmdVaultShow(ctx(opts), opts), ctx(opts)));

shared(vault.command("export").description("export an entry's encrypted blob"))
  .option("--voter <addr>")
  .option("--output <path>", "write blob to file instead of stdout")
  .action(async (opts) => run(() => cmdVaultExport(ctx(opts), opts), ctx(opts)));

shared(vault.command("import").description("import an encrypted blob from file"))
  .requiredOption("--file <path>", "path to a previously exported blob")
  .action(async (opts) => run(() => cmdVaultImport(ctx(opts), opts), ctx(opts)));

// -------- erc20 --------
const erc20 = program.command("erc20").description("stake-token helpers");
shared(erc20.command("approve").description("approve stake token for the contract"))
  .option("--amount <n>", "amount in base units (default: max)")
  .action(async (opts) => run(() => cmdErc20Approve(ctx(opts), opts), ctx(opts)));

shared(erc20.command("allowance").description("show allowance"))
  .action(async (opts) => run(() => cmdErc20Allowance(ctx(opts), opts), ctx(opts)));

// -------- jury --------
const jury = program.command("jury").description("jury operations");
shared(jury.command("status").description("am I a juror? have I revealed?"))
  .action(async (opts) => run(() => cmdJuryStatus(ctx(opts), opts), ctx(opts)));

shared(jury.command("commit").description("fetch latest SpaceComputer beacon and commit jury (juryCommitter only)"))
  .option("--ignore-policy", "skip the policy.allowJuryCommit gate", false)
  .action(async (opts) => run(() => cmdJuryCommit(ctx(opts), opts), ctx(opts)));

// -------- swarm --------
const swarm = program.command("swarm").description("swarm document verification");
shared(swarm.command("show-hash").description("print on-chain claim/rules reference fields"))
  .action(async (opts) => run(() => cmdSwarmShowHash(ctx(opts), opts), ctx(opts)));

shared(swarm.command("verify").description("verify a local document against the on-chain Swarm reference and claimRulesHash"))
  .requiredOption("--document <path>", "path to local document")
  .option("--gateway <url>", "Swarm gateway for verification (else TM_SWARM_GATEWAY_URL or package default)")
  .action(async (opts) => run(() => cmdSwarmVerify(ctx(opts), opts), ctx(opts)));

// -------- policy --------
const policy = program.command("policy").description("agent policy file");
shared(policy.command("show").description("print active policy"))
  .action(async (opts) => run(() => cmdPolicyShow(ctx(opts), opts), ctx(opts)));

shared(policy.command("set").description("write policy from file"))
  .requiredOption("--file <path>")
  .action(async (opts) => run(() => cmdPolicySet(ctx(opts), opts), ctx(opts)));

// -------- heartbeat --------
const heartbeat = program.command("heartbeat").description("agent heartbeat watcher (foreground)");
shared(heartbeat.command("start").description("start watcher (foreground; NDJSON when --json)"))
  .action(async (opts) => run(() => cmdHeartbeatStart(ctx(opts), opts), ctx(opts)));

shared(heartbeat.command("status").description("show static heartbeat config"))
  .action(async (opts) => run(() => cmdHeartbeatStatus(ctx(opts), opts), ctx(opts)));

// -------- dev --------
const dev = program.command("dev").description("local-development helpers (anvil + forge mock chain)");
shared(dev.command("up").description("spawn anvil, run forge SimulateAnvil deploy(), write .env"))
  .option("--contracts-dir <path>", "path to the contracts/ root (auto-detected if omitted)")
  .option("--env-out <path>", "where to write the .env file", ".env")
  .option("--rpc-port <n>", "anvil RPC port", (v) => Number(v), 8545)
  .option("--accounts <n>", "anvil --accounts", (v) => Number(v), 12)
  .option("--skip-deploy", "spawn anvil only, do not run the deploy script", false)
  .action(async (opts) => run(() => cmdDevUp(ctx(opts), opts), ctx(opts)));

shared(dev.command("down").description("kill the managed anvil process"))
  .action(async (opts) => run(() => cmdDevDown(ctx(opts), opts), ctx(opts)));

shared(dev.command("status").description("report whether managed anvil is running"))
  .action(async (opts) => run(() => cmdDevStatus(ctx(opts), opts), ctx(opts)));

// -------- tui --------
shared(program.command("tui").description("launch the interactive TUI"))
  .action(async (opts) => run(() => cmdTui(opts), ctx(opts)));

program.parseAsync(process.argv).catch((e) => {
  const err = asCliError(e);
  emitError({ json: false, yes: false }, err);
});
