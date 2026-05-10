import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { type Address, isAddress } from "viem";
import { makePublicClient, makeWalletClient } from "../chain/client.js";
import { readBalance, readSymbol, writeTransfer } from "../chain/erc20.js";
import { readStakeToken } from "../chain/contract.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type OutputContext, emitResult, promptSecret } from "../io.js";
import { DEFAULT_POLICY, type Policy, savePolicy } from "../policy/policy.js";
import { atomicWriteFile } from "../util/atomic.js";
import { loadWallet } from "../wallet/loader.js";

/**
 * Local-development "mock chain" workflow built on top of forge + anvil.
 *
 * `truthmarket dev up`
 *   1. Spawns `anvil --accounts 12 --silent` detached, polls until RPC is up.
 *   2. Runs `forge script script/SimulateAnvil.s.sol --sig "deploy()"
 *      --broadcast --rpc-url http://127.0.0.1:8545` from the contracts dir,
 *      which deploys MockERC20 + TruthMarket at deterministic addresses.
 *   3. Writes the resolved values into `.env` (without overwriting unrelated
 *      keys) so subsequent `truthmarket *` commands work out of the box.
 *
 * `truthmarket dev down` kills the anvil process recorded in the PID file.
 * `truthmarket dev status` reports running state and the values from .env.
 */

const ANVIL_RPC = "http://127.0.0.1:8545";
const DETERMINISTIC_DEPLOYER_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const SIM_ADDR_FILE = ".sim-anvil.json";

interface SimAddresses {
  token: Address;
  market: Address;
  registry: Address;
  implementation: Address;
}

function pidPath(homeDir: string): string {
  return path.join(homeDir, "dev-anvil.pid");
}

function readPid(file: string): number | null {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8").trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means the process exists but we can't signal it; ESRCH means gone.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function probeRpc(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function waitForRpc(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeRpc(url)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new CliError(
    "ANVIL_TIMEOUT",
    `anvil RPC at ${url} did not come up within ${timeoutMs}ms`,
  );
}

function findContractsDir(start: string, override?: string): string {
  if (override) {
    if (!existsSync(path.join(override, "foundry.toml"))) {
      throw new CliError(
        "CONTRACTS_DIR_INVALID",
        `--contracts-dir ${override}: no foundry.toml found`,
      );
    }
    return override;
  }
  let dir = path.resolve(start);
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "contracts", "foundry.toml"))) {
      return path.join(dir, "contracts");
    }
    if (existsSync(path.join(dir, "foundry.toml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new CliError(
    "CONTRACTS_DIR_NOT_FOUND",
    "could not locate contracts/ directory; pass --contracts-dir <path>",
  );
}

function commandExists(cmd: string): boolean {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    stdio: "ignore",
  });
  return which.status === 0;
}

function mergeEnvFile(target: string, updates: Record<string, string>): void {
  const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      out.push(line);
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (key in updates) {
      out.push(`${key}=${updates[key]}`);
      seen.add(key);
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  // Drop trailing blank lines, ensure exactly one terminator.
  while (out.length && out[out.length - 1]?.trim() === "") out.pop();
  return void atomicWriteFile(target, out.join("\n") + "\n", 0o600);
}

function readSimAddresses(contractsDir: string): SimAddresses {
  const file = path.join(contractsDir, SIM_ADDR_FILE);
  if (!existsSync(file)) {
    throw new CliError(
      "DEV_DEPLOY_ADDRESSES_MISSING",
      `${file} not found; run dev up without --skip-deploy first`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new CliError("DEV_DEPLOY_ADDRESSES_INVALID", `${file} is not valid JSON: ${(e as Error).message}`);
  }
  const obj = parsed as Partial<Record<keyof SimAddresses, string>>;
  for (const key of ["token", "market", "registry", "implementation"] as const) {
    if (!obj[key] || !isAddress(obj[key])) {
      throw new CliError("DEV_DEPLOY_ADDRESSES_INVALID", `${file}: ${key} is missing or not an address`);
    }
  }
  return obj as SimAddresses;
}

export interface DevUpOpts {
  contractsDir?: string;
  envOut?: string;
  rpcPort?: number;
  skipDeploy?: boolean;
  accounts?: number;
}

export async function cmdDevUp(
  ctx: OutputContext,
  opts: DevUpOpts,
): Promise<void> {
  const cfg = resolveConfig({});
  const port = opts.rpcPort ?? 8545;
  const rpc = `http://127.0.0.1:${port}`;
  const accounts = opts.accounts ?? 12;
  const envOut = path.resolve(opts.envOut ?? ".env");

  if (!commandExists("anvil")) {
    throw new CliError(
      "ANVIL_NOT_FOUND",
      "anvil is not on PATH. Install Foundry: https://book.getfoundry.sh/getting-started/installation",
    );
  }
  if (!opts.skipDeploy && !commandExists("forge")) {
    throw new CliError(
      "FORGE_NOT_FOUND",
      "forge is not on PATH. Install Foundry: https://book.getfoundry.sh/getting-started/installation",
    );
  }

  const pidFile = pidPath(cfg.homeDir);
  const existingPid = readPid(pidFile);
  if (existingPid && processIsRunning(existingPid) && (await probeRpc(rpc))) {
    // Reuse the existing anvil; deploy and rewrite .env.
  } else {
    if (existingPid) {
      // Stale PID file — clean up.
      try {
        unlinkSync(pidFile);
      } catch {
        // ignore
      }
    }
    if (await probeRpc(rpc)) {
      throw new CliError(
        "PORT_IN_USE",
        `something is already listening on ${rpc} but it isn't a TruthMarket-managed anvil. Stop it or pass --rpc-port.`,
      );
    }
    mkdirSync(cfg.homeDir, { recursive: true });
    const child = spawn(
      "anvil",
      [
        "--accounts",
        String(accounts),
        "--port",
        String(port),
        "--host",
        "127.0.0.1",
        "--silent",
      ],
      {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      },
    );
    child.unref();
    if (!child.pid) {
      throw new CliError("ANVIL_SPAWN_FAILED", "could not spawn anvil");
    }
    await atomicWriteFile(pidFile, String(child.pid) + "\n", 0o600);
    await waitForRpc(rpc, 10_000);
  }

  const contractsDir = findContractsDir(process.cwd(), opts.contractsDir);
  if (!opts.skipDeploy) {
    const r = spawnSync(
      "forge",
      [
        "script",
        "script/SimulateAnvil.s.sol",
        "--sig",
        "deploy()",
        "--rpc-url",
        rpc,
        "--broadcast",
      ],
      { cwd: contractsDir, stdio: "inherit" },
    );
    if (r.status !== 0) {
      throw new CliError(
        "FORGE_DEPLOY_FAILED",
        `forge script exited with ${r.status}`,
      );
    }
  }
  const sim = readSimAddresses(contractsDir);

  mergeEnvFile(envOut, {
    TM_CHAIN: "foundry",
    TM_RPC_URL: rpc,
    TM_CONTRACT_ADDRESS: sim.market,
    TM_REGISTRY_ADDRESS: sim.registry,
    TM_STAKE_TOKEN: sim.token,
    TM_DISCOVERY_REGISTRY_ADDRESS: sim.registry,
    NEXT_PUBLIC_TRUTHMARKET_ADDRESS: sim.market,
    NEXT_PUBLIC_REGISTRY_ADDRESS: sim.registry,
    NEXT_PUBLIC_STAKE_TOKEN: sim.token,
    NEXT_PUBLIC_RPC_URL: rpc,
    PRIVATE_KEY: DETERMINISTIC_DEPLOYER_PK,
  });

  emitResult(
    ctx,
    {
      anvilPid: readPid(pidFile),
      rpc,
      contractAddress: sim.market,
      registryAddress: sim.registry,
      implementationAddress: sim.implementation,
      stakeToken: sim.token,
      privateKey: DETERMINISTIC_DEPLOYER_PK,
      envFile: envOut,
    },
    () => {
      process.stdout.write(
        `anvil up at ${rpc} (pid ${readPid(pidFile)})\n` +
          `seed market:    ${sim.market}\n` +
          `registry:       ${sim.registry}\n` +
          `implementation: ${sim.implementation}\n` +
          `stake token:    ${sim.token}\n` +
          `wrote env:   ${envOut}\n` +
          `next: truthmarket registry info\n`,
      );
    },
  );
}

export async function cmdDevDown(
  ctx: OutputContext,
  _opts: Record<string, unknown>,
): Promise<void> {
  const cfg = resolveConfig({});
  const pidFile = pidPath(cfg.homeDir);
  const pid = readPid(pidFile);
  if (!pid) {
    emitResult(ctx, { stopped: false, reason: "no PID file" }, () => {
      process.stdout.write("no managed anvil to stop\n");
    });
    return;
  }
  let stopped = false;
  try {
    process.kill(pid, "SIGTERM");
    stopped = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") {
      stopped = false;
    } else {
      throw e;
    }
  }
  try {
    unlinkSync(pidFile);
  } catch {
    // ignore
  }
  emitResult(ctx, { stopped, pid }, () => {
    process.stdout.write(stopped ? `stopped pid ${pid}\n` : `pid ${pid} was already gone\n`);
  });
}

export interface DevSeedAgentOpts extends ConfigOverrides {
  /** Override the maxStake written to the policy file (token base units). */
  maxStake?: string;
}

/**
 * Local-dev shortcut: write a permissive policy so `truthmarket agent run`
 * and `truthmarket registry create-market` work end-to-end against anvil
 * without flipping flags by hand. Uses defaultPolicy with allowCreateMarkets,
 * allowJuryCommit, and a generous maxStake. Idempotent.
 */
export async function cmdDevSeedAgent(
  ctx: OutputContext,
  opts: DevSeedAgentOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const policy: Policy = {
    ...DEFAULT_POLICY,
    allowCreateMarkets: true,
    allowJuryCommit: true,
    autoReveal: true,
    autoWithdraw: true,
    requireSwarmVerification: false,
    maxStake: opts.maxStake ?? "1000000000000000000000",
  };
  const written = await savePolicy(cfg, policy);

  emitResult(
    ctx,
    {
      policyFile: written,
      policy,
      registryAddress: cfg.registryAddress,
      agentStatePath: cfg.agentStatePath,
    },
    () => {
      process.stdout.write(
        `wrote policy: ${written}\n` +
          `  allowCreateMarkets: true\n` +
          `  allowJuryCommit:    true\n` +
          `  maxStake:           ${policy.maxStake}\n` +
          `next:\n` +
          `  1. start the web app: (cd apps/web && npm run dev) — needed by 'agent tick'\n` +
          `  2. truthmarket agent tick   # fetches Apify candidates and creates one market\n` +
          `     (or: truthmarket agent tick --items-file <sample-items.json> for offline runs)\n` +
          `\n` +
          `for vote/reveal/withdraw to run non-interactively:\n` +
          `  export TM_VAULT_PASSPHRASE=demo  # any value; required to encrypt local nonces\n`,
      );
    },
  );
}

export interface DevFundOpts extends ConfigOverrides {
  to?: string;
  tokens?: string;
  eth?: string;
}

/**
 * Local-dev shortcut: send MockERC20 + ETH from the deployer wallet to a
 * recipient address. Useful for friend wallets joining the live demo who
 * connected MetaMask but have no stake token or anvil-issued ETH.
 *
 * The stake token is read from the seed TruthMarket (same token across
 * registry-deployed markets), and the deployer wallet is taken from
 * PRIVATE_KEY env (set by `dev up`).
 */
export async function cmdDevFund(
  ctx: OutputContext,
  opts: DevFundOpts,
): Promise<void> {
  if (!opts.to) {
    throw new CliError("DEV_FUND_TO_REQUIRED", "missing --to <addr>");
  }
  if (!isAddress(opts.to)) {
    throw new CliError("DEV_FUND_TO_INVALID", `--to '${opts.to}' is not a valid address`);
  }
  const recipient = opts.to as Address;
  const tokenAmount = parseAmount(opts.tokens, "1000000000000000000000", "tokens");
  const ethAmount = parseAmount(opts.eth, "1000000000000000000", "eth");

  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);

  const stakeToken = await readStakeToken(publicClient, cfg);
  const symbol = await readSymbol(publicClient, stakeToken);

  let tokenTx: { txHash: string; blockNumber: bigint } | null = null;
  if (tokenAmount > 0n) {
    tokenTx = await writeTransfer(walletClient, publicClient, stakeToken, recipient, tokenAmount);
  }

  let ethTx: string | null = null;
  if (ethAmount > 0n) {
    ethTx = await walletClient.sendTransaction({
      account: wallet.account,
      to: recipient,
      value: ethAmount,
      chain: cfg.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: ethTx as `0x${string}` });
  }

  const tokenBalance = await readBalance(publicClient, stakeToken, recipient);
  const ethBalance = await publicClient.getBalance({ address: recipient });

  emitResult(
    ctx,
    {
      recipient,
      stakeToken,
      symbol,
      tokensSent: tokenAmount,
      ethSent: ethAmount,
      tokenTxHash: tokenTx?.txHash ?? null,
      ethTxHash: ethTx,
      recipientTokenBalance: tokenBalance,
      recipientEthBalance: ethBalance,
    },
    () => {
      process.stdout.write(
        `funded ${recipient}\n` +
          `  tokens:  ${tokenAmount} ${symbol} (tx ${tokenTx?.txHash ?? "skipped"})\n` +
          `  eth:     ${ethAmount} wei (tx ${ethTx ?? "skipped"})\n` +
          `  recipient now holds ${tokenBalance} ${symbol} and ${ethBalance} wei\n`,
      );
    },
  );
}

function parseAmount(raw: string | undefined, fallback: string, label: string): bigint {
  const value = raw ?? fallback;
  if (value === "0") return 0n;
  try {
    return BigInt(value);
  } catch {
    throw new CliError(
      "DEV_FUND_INVALID_AMOUNT",
      `--${label} '${value}' is not a valid integer (use base units, e.g. 1000000000000000000 for 1 ether)`,
    );
  }
}

export async function cmdDevStatus(
  ctx: OutputContext,
  _opts: Record<string, unknown>,
): Promise<void> {
  const cfg = resolveConfig({});
  const pidFile = pidPath(cfg.homeDir);
  const pid = readPid(pidFile);
  const running = pid !== null && processIsRunning(pid);
  const rpcUp = running ? await probeRpc(ANVIL_RPC) : false;
  emitResult(
    ctx,
    { running, pid, rpcUp, rpc: ANVIL_RPC, pidFile },
    () => {
      process.stdout.write(
        `running: ${running}\npid: ${pid ?? "(none)"}\nrpc: ${ANVIL_RPC} (up=${rpcUp})\n`,
      );
    },
  );
}
