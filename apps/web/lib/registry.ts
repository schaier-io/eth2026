import { isAddress, parseAbi, type Address } from "viem";

const configuredRegistry = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;

export const registryAddress =
  configuredRegistry && isAddress(configuredRegistry) ? (configuredRegistry as Address) : undefined;

/**
 * Mirrors `MarketRegistry` ABI in apps/cli/src/abi.ts. Kept structural here
 * so the web app stays a standalone Next.js project (no cross-app type imports).
 */
export const marketRegistryAbi = parseAbi([
  "function stakeToken() view returns (address)",
  "function companyTreasury() view returns (address)",
  "function admin() view returns (address)",
  "function juryCommitter() view returns (address)",
  "function markets(uint256) view returns (address)",
  "function marketCount() view returns (uint256)",
  "function getMarkets(uint256 offset, uint256 limit) view returns (address[])",
  "event MarketCreated(uint256 indexed id, address indexed market, address indexed creator, string name, bytes ipfsHash)",
]);
