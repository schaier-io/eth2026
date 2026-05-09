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

export const DEFAULT_CHAIN: ChainKey = "baseSepolia";

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

export interface ResolvedConfig {
  contractAddress: Address;
  chain: Chain;
  chainKey: ChainKey;
  rpcUrl: string;
  homeDir: string;
  keystorePath: string;
  vaultDir: string;
  policyPath: string;
}

export interface ConfigOverrides {
  address?: string;
  chain?: string;
  rpc?: string;
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

export function resolveConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
  const chainKey = parseChainKey(
    overrides.chain ?? process.env.TM_CHAIN ?? DEFAULT_CHAIN,
  );
  const chain = CHAINS[chainKey];

  const rawAddress =
    overrides.address ?? process.env.TM_CONTRACT_ADDRESS ?? TRUTHMARKET_ADDRESS;
  if (!isAddress(rawAddress)) {
    throw new ConfigError(
      "INVALID_ADDRESS",
      `contract address '${rawAddress}' is not a valid address`,
    );
  }
  const contractAddress = rawAddress as Address;

  const rpcUrl =
    overrides.rpc ??
    process.env.TM_RPC_URL ??
    (chainKey === "foundry"
      ? process.env.NEXT_PUBLIC_RPC_URL ?? DEFAULT_RPC.foundry
      : chainKey === "baseSepolia"
        ? process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? DEFAULT_RPC.baseSepolia
        : process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? DEFAULT_RPC.sepolia);

  warnIfZeroAddress(contractAddress);

  const home = process.env.TM_HOME ?? path.join(homedir(), ".truthmarket");
  return {
    contractAddress,
    chain,
    chainKey,
    rpcUrl,
    homeDir: home,
    keystorePath: path.join(home, "keystore.json"),
    vaultDir: path.join(home, "vault"),
    policyPath: process.env.TM_POLICY_FILE ?? path.join(home, "policy.json"),
  };
}
