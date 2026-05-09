import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
} from "viem";
import { marketRegistryAbi } from "../abi.js";
import type { ResolvedConfig } from "../config.js";

/**
 * Per-market spec passed to MarketRegistry.createMarket. Mirrors the
 * `MarketSpec` struct in `contracts/src/MarketRegistry.sol`.
 */
export interface MarketSpec {
  name: string;
  description: string;
  tags: readonly string[];
  ipfsHash: Hex;
  votingPeriod: bigint;
  adminTimeout: bigint;
  revealPeriod: bigint;
  protocolFeePercent: number;
  minStake: bigint;
  jurySize: number;
  minCommits: number;
  minRevealedJurors: number;
}

export interface RegistryConfig {
  stakeToken: Address;
}

export async function readRegistryConfig(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<RegistryConfig> {
  const stakeToken = await client.readContract({
    address: cfg.registryAddress,
    abi: marketRegistryAbi,
    functionName: "stakeToken",
  });
  return {
    stakeToken: stakeToken as Address,
  };
}

export async function readMarketCount(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<bigint> {
  return (await client.readContract({
    address: cfg.registryAddress,
    abi: marketRegistryAbi,
    functionName: "marketCount",
  })) as bigint;
}

export async function readMarkets(
  client: PublicClient,
  cfg: ResolvedConfig,
  args: { offset: bigint; limit: bigint },
): Promise<readonly Address[]> {
  return (await client.readContract({
    address: cfg.registryAddress,
    abi: marketRegistryAbi,
    functionName: "getMarkets",
    args: [args.offset, args.limit],
  })) as readonly Address[];
}

export interface CreateMarketResult {
  txHash: Hex;
  blockNumber: bigint;
  marketAddress: Address;
  marketId: bigint;
}

/**
 * Calls MarketRegistry.createMarket and resolves the deployed market address
 * by decoding the MarketCreated event from the receipt logs.
 */
export async function writeCreateMarket(
  wallet: WalletClient,
  client: PublicClient,
  cfg: ResolvedConfig,
  spec: MarketSpec,
): Promise<CreateMarketResult> {
  const { request } = await client.simulateContract({
    address: cfg.registryAddress,
    abi: marketRegistryAbi,
    functionName: "createMarket",
    args: [
      {
        name: spec.name,
        description: spec.description,
        tags: spec.tags as readonly string[],
        ipfsHash: spec.ipfsHash,
        votingPeriod: spec.votingPeriod,
        adminTimeout: spec.adminTimeout,
        revealPeriod: spec.revealPeriod,
        protocolFeePercent: spec.protocolFeePercent,
        minStake: spec.minStake,
        jurySize: spec.jurySize,
        minCommits: spec.minCommits,
        minRevealedJurors: spec.minRevealedJurors,
      },
    ],
    account: wallet.account!,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== cfg.registryAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: marketRegistryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "MarketCreated") {
        const args = decoded.args as {
          id: bigint;
          market: Address;
          creator: Address;
        };
        return {
          txHash,
          blockNumber: receipt.blockNumber,
          marketAddress: args.market,
          marketId: args.id,
        };
      }
    } catch {
      // Skip logs from other ABIs.
    }
  }
  throw new Error(
    `createMarket succeeded but no MarketCreated event was emitted (tx=${txHash})`,
  );
}
