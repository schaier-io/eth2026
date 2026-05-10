import { homedir } from "node:os";
import path from "node:path";
import { type Address, type Chain, isAddress } from "viem";
import { baseSepolia, foundry, sepolia } from "viem/chains";

/**
 * Hardcoded TruthMarket contract address.
 *
 * Replace this once a canonical deployment exists. For local development,
 * export TM_CONTRACT_ADDRESS to override (anvil deploys produce a fresh
 * address each run).
 */
export const TRUTHMARKET_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";

/**
 * Hardcoded MarketRegistry contract address.
 *
 * Replace this once a canonical deployment exists. For local development,
 * export TM_REGISTRY_ADDRESS to override.
 */
export const REGISTRY_ADDRESS: Address =
  "0xb654cfE92373eD85B863dE3994E2Af5daf7626Fa";

export const DEFAULT_CHAIN: ChainKey = "sepolia";

export type ChainKey = "foundry" | "baseSepolia" | "sepolia";

export const CHAINS: Record<ChainKey, Chain> = {
  foundry,
  baseSepolia,
  sepolia,
};

export const DEFAULT_RPC: Record<ChainKey, string> = {
  foundry: "http://127.0.0.1:8545",
  baseSepolia: "https://sepolia.base.org",
  sepolia: "https://rpc.sepolia.org",
};

/**
 * Per-clone defaults used by CLI/agent market creation when a JSON spec does
 * not include `stakeToken` or `juryCommitter`. The registry does not bake
 * these globally; each clone stores its own initialized values. Treasury is
 * hardcoded in TruthMarket.sol.
 */
export interface OperationalAddresses {
  stakeToken: Address | undefined;
  juryCommitter: Address | undefined;
}

export interface ResolvedConfig {
  contractAddress: Address;
  registryAddress: Address;
  chain: Chain;
  chainKey: ChainKey;
  rpcUrl: string;
  homeDir: string;
  keystorePath: string;
  vaultDir: string;
  policyPath: string;
  agentStatePath: string;
  operational: OperationalAddresses;
}

export interface ConfigOverrides {
  address?: string;
  registry?: string;
  chain?: string;
  rpc?: string;
  stakeToken?: string;
  juryCommitter?: string;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

let zeroAddressWarned = false;

function warnIfZeroAddress(addr: Address): void {
  if (zeroAddressWarned) return;
  if (addr.toLowerCase() !== ZERO_ADDRESS) return;
  // Skip the warning for programmatic stderr consumers (pipes, --json agents).
  // Humans on a TTY still see the heads-up.
  if (!process.stderr.isTTY) return;
  zeroAddressWarned = true;
  process.stderr.write(
    `warning: TruthMarket contract address is the zero address (placeholder).\n` +
      `         Set TM_CONTRACT_ADDRESS=<deployed-address> or pass --address.\n` +
      `         Reads against the zero address will revert.\n`,
  );
}

export class ConfigError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ConfigError";
  }
}

function parseChainKey(s: string): ChainKey {
  if (s === "foundry" || s === "baseSepolia" || s === "sepolia") return s;
  throw new ConfigError(
    "INVALID_CHAIN",
    `unknown chain '${s}' (expected one of: foundry, baseSepolia, sepolia)`,
  );
}

function chainKeyFromEnv(): ChainKey {
  const explicit = process.env.TM_CHAIN;
  if (explicit) return parseChainKey(explicit);

  switch (process.env.NEXT_PUBLIC_CHAIN_ID) {
    case "31337":
      return "foundry";
    case "84532":
      return "baseSepolia";
    case "11155111":
      return "sepolia";
    default:
      return DEFAULT_CHAIN;
  }
}

export function resolveConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
  const chainKey = overrides.chain ? parseChainKey(overrides.chain) : chainKeyFromEnv();
  const chain = CHAINS[chainKey];

  const rawAddress =
    overrides.address ??
    process.env.TM_CONTRACT_ADDRESS ??
    process.env.NEXT_PUBLIC_TRUTHMARKET_ADDRESS ??
    TRUTHMARKET_ADDRESS;
  if (!isAddress(rawAddress)) {
    throw new ConfigError(
      "INVALID_ADDRESS",
      `contract address '${rawAddress}' is not a valid address`,
    );
  }
  const contractAddress = rawAddress as Address;

  const rawRegistry =
    overrides.registry ??
    process.env.TM_REGISTRY_ADDRESS ??
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
    REGISTRY_ADDRESS;
  if (!isAddress(rawRegistry)) {
    throw new ConfigError(
      "INVALID_ADDRESS",
      `registry address '${rawRegistry}' is not a valid address`,
    );
  }
  const registryAddress = rawRegistry as Address;

  const rpcUrl =
    overrides.rpc ??
    process.env.TM_RPC_URL ??
    (chainKey === "foundry"
      ? process.env.NEXT_PUBLIC_RPC_URL ?? DEFAULT_RPC.foundry
      : chainKey === "baseSepolia"
        ? process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? DEFAULT_RPC.baseSepolia
        : process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? DEFAULT_RPC.sepolia);

  warnIfZeroAddress(contractAddress);

  const operational: OperationalAddresses = {
    stakeToken: parseOptionalAddress(
      "stakeToken",
      overrides.stakeToken ?? process.env.TM_STAKE_TOKEN ?? process.env.NEXT_PUBLIC_STAKE_TOKEN,
    ),
    juryCommitter: parseOptionalAddress(
      "juryCommitter",
      overrides.juryCommitter ?? process.env.TM_JURY_COMMITTER ?? process.env.NEXT_PUBLIC_JURY_COMMITTER,
    ),
  };

  const home = process.env.TM_HOME ?? path.join(homedir(), ".truthmarket");
  return {
    contractAddress,
    registryAddress,
    chain,
    chainKey,
    rpcUrl,
    homeDir: home,
    keystorePath: path.join(home, "keystore.json"),
    vaultDir: path.join(home, "vault"),
    policyPath: process.env.TM_POLICY_FILE ?? path.join(home, "policy.json"),
    agentStatePath: process.env.TM_AGENT_STATE_FILE ?? path.join(home, "agent-state.json"),
    operational,
  };
}

function parseOptionalAddress(label: string, raw: string | undefined): Address | undefined {
  if (!raw || raw.trim() === "") return undefined;
  if (!isAddress(raw)) {
    throw new ConfigError("INVALID_ADDRESS", `${label} address '${raw}' is not a valid address`);
  }
  return raw as Address;
}
