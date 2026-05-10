import "server-only";
import { createPublicClient, http, isAddress, type Address, type Chain, type PublicClient } from "viem";
import { baseSepolia, foundry, sepolia } from "viem/chains";
import { registryAddress as configuredRegistry } from "../registry";

type ChainEntry = { chain: Chain; rpcUrl: string | undefined };

function chainEntry(chainId: number): ChainEntry {
  switch (chainId) {
    case foundry.id:
      return { chain: foundry, rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545" };
    case baseSepolia.id:
      return { chain: baseSepolia, rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL };
    case sepolia.id:
      return { chain: sepolia, rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL };
    default:
      throw new Error(`Unsupported NEXT_PUBLIC_CHAIN_ID=${chainId}. Expected 31337, 84532, or 11155111.`);
  }
}

const clientCache = new Map<number, PublicClient>();

export function getChainId(): number {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (!raw) return foundry.id;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid NEXT_PUBLIC_CHAIN_ID=${raw}.`);
  }
  return parsed;
}

export function getChain(): Chain {
  return chainEntry(getChainId()).chain;
}

export function getPublicClient(): PublicClient {
  const chainId = getChainId();
  const cached = clientCache.get(chainId);
  if (cached) return cached;

  const entry = chainEntry(chainId);
  const overrideRpc = process.env.RPC_URL;
  const rpcUrl = overrideRpc || entry.rpcUrl;
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for chain ${chainId}. Set RPC_URL or the matching NEXT_PUBLIC_*_RPC_URL.`);
  }
  const client = createPublicClient({
    chain: entry.chain,
    transport: http(rpcUrl, { batch: true }),
  }) as PublicClient;
  clientCache.set(chainId, client);
  return client;
}

export function getRegistryAddress(): Address | undefined {
  return configuredRegistry;
}

export function requireRegistryAddress(): Address {
  if (!configuredRegistry) {
    throw new Error("NEXT_PUBLIC_REGISTRY_ADDRESS is not configured.");
  }
  return configuredRegistry;
}

export function explorerUrl(): string | undefined {
  const chain = getChain();
  return chain.blockExplorers?.default?.url;
}

export function explorerAddressUrl(addr: Address): string | undefined {
  const base = explorerUrl();
  if (!base) return undefined;
  if (!isAddress(addr)) return undefined;
  return `${base.replace(/\/$/, "")}/address/${addr}`;
}
