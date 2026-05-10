import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
} from "viem";
import { truthMarketRegistryAbi } from "../abi.js";
import type { ResolvedConfig } from "../config.js";

/**
 * Per-market spec passed to `MarketRegistry.createMarket`. The registry only
 * supplies the shared implementation; each clone gets its own stake token and
 * jury committer.
 */
export interface MarketSpec {
  /** Falls back to TM_STAKE_TOKEN when omitted by local agent specs. */
  stakeToken?: Address;
  /** Falls back to TM_JURY_COMMITTER, then wallet address, when omitted. */
  juryCommitter?: Address;
  swarmReference: Hex;
  votingPeriod: bigint;
  adminTimeout: bigint;
  revealPeriod: bigint;
  minStake: bigint;
  /** targetJurySize in InitParams. */
  jurySize: number;
  minCommits: number;
  /** Optional hard cap on commits. 0 = uncapped. */
  maxCommits?: number;
  minRevealedJurors: number;
  /** Optional creator-funded subsidy (token base units). 0 = no bond. */
  creatorBond?: bigint;
}

export interface RegistryOperationalInfo {
  registryVersion?: number;
  implementation?: Address;
  implementationVersion?: number;
}

export async function readTotalMarkets(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<bigint> {
  return (await client.readContract({
    address: cfg.registryAddress,
    abi: truthMarketRegistryAbi,
    functionName: "totalMarkets",
  })) as bigint;
}

export async function readMarketsPaginated(
  client: PublicClient,
  cfg: ResolvedConfig,
  args: { offset: bigint; limit: bigint },
): Promise<readonly Address[]> {
  return (await client.readContract({
    address: cfg.registryAddress,
    abi: truthMarketRegistryAbi,
    functionName: "marketsPaginated",
    args: [args.offset, args.limit],
  })) as readonly Address[];
}

export interface MarketInfo {
  creator: Address;
  registeredAt: bigint;
  index: number;
}

export async function readMarketInfo(
  client: PublicClient,
  cfg: ResolvedConfig,
  market: Address,
): Promise<MarketInfo> {
  const result = (await client.readContract({
    address: cfg.registryAddress,
    abi: truthMarketRegistryAbi,
    functionName: "marketInfo",
    args: [market],
  })) as readonly [Address, bigint, number];
  return { creator: result[0], registeredAt: result[1], index: result[2] };
}

export async function readMarketsByCreator(
  client: PublicClient,
  cfg: ResolvedConfig,
  args: { creator: Address; offset: bigint; limit: bigint },
): Promise<readonly Address[]> {
  return (await client.readContract({
    address: cfg.registryAddress,
    abi: truthMarketRegistryAbi,
    functionName: "marketsByCreatorPaginated",
    args: [args.creator, args.offset, args.limit],
  })) as readonly Address[];
}

export interface CreateMarketResult {
  txHash: Hex;
  blockNumber: bigint;
  marketAddress: Address;
  /** Position in the registry's `markets` array — equals the on-chain `index`. */
  marketId: bigint;
}

export async function readRegistryOperationalInfo(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<RegistryOperationalInfo> {
  const implementation = await client
    .readContract({
      address: cfg.registryAddress,
      abi: truthMarketRegistryAbi,
      functionName: "implementation",
    })
    .catch(() => undefined);
  const [registryVersion, implementationVersion] = await Promise.all([
    client
      .readContract({
        address: cfg.registryAddress,
        abi: truthMarketRegistryAbi,
        functionName: "CONTRACT_VERSION",
      })
      .catch(() => undefined),
    client
      .readContract({
        address: cfg.registryAddress,
        abi: truthMarketRegistryAbi,
        functionName: "implementationVersion",
      })
      .catch(() => undefined),
  ]);
  return {
    registryVersion: registryVersion as number | undefined,
    implementation: implementation as Address | undefined,
    implementationVersion: implementationVersion as number | undefined,
  };
}

/**
 * Create a TruthMarket minimal clone through the registry. The registry clones
 * the implementation, initializes the clone, indexes it, and emits
 * `MarketCreated(id, market, creator)`.
 */
export async function writeCreateMarket(
  wallet: WalletClient,
  client: PublicClient,
  cfg: ResolvedConfig,
  spec: MarketSpec,
): Promise<CreateMarketResult> {
  const account = wallet.account;
  if (!account) throw new Error("wallet has no account configured");

  const stakeToken = spec.stakeToken ?? cfg.operational.stakeToken;
  if (!stakeToken) {
    throw new Error(
      "stakeToken not configured. Put stakeToken in the spec, set TM_STAKE_TOKEN, or pass --stake-token.",
    );
  }
  const juryCommitter = spec.juryCommitter ?? cfg.operational.juryCommitter ?? account.address;

  const marketSpec = {
    stakeToken,
    juryCommitter,
    swarmReference: spec.swarmReference,
    votingPeriod: spec.votingPeriod,
    adminTimeout: spec.adminTimeout,
    revealPeriod: spec.revealPeriod,
    minStake: spec.minStake,
    jurySize: spec.jurySize,
    minCommits: spec.minCommits,
    maxCommits: spec.maxCommits ?? 0,
    minRevealedJurors: spec.minRevealedJurors,
    creatorBond: spec.creatorBond ?? 0n,
  };

  const { request } = await client.simulateContract({
    address: cfg.registryAddress,
    abi: truthMarketRegistryAbi,
    functionName: "createMarket",
    args: [marketSpec],
    account,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });

  let registered: { market: Address; index: bigint } | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== cfg.registryAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: truthMarketRegistryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "MarketCreated") {
        const args = decoded.args as { id: bigint; market: Address; creator: Address };
        return {
          txHash,
          blockNumber: receipt.blockNumber,
          marketAddress: args.market,
          marketId: args.id,
        };
      }
      if (decoded.eventName === "MarketRegistered") {
        const args = decoded.args as { market: Address; creator: Address; index: bigint; registeredAt: bigint };
        registered = { market: args.market, index: args.index };
      }
    } catch {
      // Skip logs from other ABIs.
    }
  }

  if (registered) {
    return {
      txHash,
      blockNumber: receipt.blockNumber,
      marketAddress: registered.market,
      marketId: registered.index,
    };
  }

  throw new Error(
    `MarketRegistry.createMarket succeeded (tx=${txHash}) but no MarketCreated/MarketRegistered event was emitted — verify TM_REGISTRY_ADDRESS points at the clone MarketRegistry.`,
  );
}
