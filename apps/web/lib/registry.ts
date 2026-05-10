import { isAddress, parseAbi, type Address, type Hex } from "viem";

const configuredRegistry = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;

export const registryAddress =
  configuredRegistry && isAddress(configuredRegistry) ? (configuredRegistry as Address) : undefined;

/**
 * MarketRegistry — minimal-clone factory plus append-only discovery index.
 * Mirrors the ABI in
 * apps/cli/src/abi.ts; kept structural here so the web app stays a standalone
 * Next.js project (no cross-app type imports).
 */
export const truthMarketRegistryAbi = parseAbi([
  "function CONTRACT_ID() view returns (bytes32)",
  "function CONTRACT_VERSION() view returns (uint16)",
  "function implementation() view returns (address)",
  "function implementationVersion() view returns (uint16)",
  "function totalMarkets() view returns (uint256)",
  "function marketCount() view returns (uint256)",
  "function markets(uint256) view returns (address)",
  "function isRegistered(address market) view returns (bool)",
  "function marketInfo(address market) view returns (address creator, uint64 registeredAt, uint32 index)",
  "function countByCreator(address creator) view returns (uint256)",
  "function marketsPaginated(uint256 offset, uint256 limit) view returns (address[])",
  "function marketsByCreatorPaginated(address creator, uint256 offset, uint256 limit) view returns (address[])",
  "function getMarkets(uint256 offset, uint256 limit) view returns (address[])",
  "function createMarket((address stakeToken, address juryCommitter, bytes swarmReference, uint64 votingPeriod, uint64 adminTimeout, uint64 revealPeriod, uint96 minStake, uint32 jurySize, uint32 minCommits, uint32 maxCommits, uint32 minRevealedJurors, uint96 creatorBond) spec) returns (address)",
  "function register(address creator)",
  "event MarketCreated(uint256 indexed id, address indexed market, address indexed creator)",
  "event MarketRegistered(address indexed market, address indexed creator, uint256 indexed index, uint64 registeredAt)",
]);

/**
 * Per-market spec sent to `MarketRegistry.createMarket`. Treasury and protocol
 * fee % are hardcoded in TruthMarket; stake token and jury committer are
 * initialized per clone.
 * Display metadata lives in Swarm KV. The clone stores only `swarmReference`;
 * `creator` defaults to the connected wallet.
 */
export interface MarketSpec {
  stakeToken: Address;
  juryCommitter: Address;
  swarmReference: Hex;
  votingPeriod: bigint;
  adminTimeout: bigint;
  revealPeriod: bigint;
  minStake: bigint;
  /** Max jury draw size: targetJurySize in InitParams. */
  jurySize: number;
  minCommits: number;
  /** Optional hard cap on commits; 0 disables. */
  maxCommits?: number;
  minRevealedJurors: number;
  creatorBond?: bigint;
}
