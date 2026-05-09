import {
  type Account,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import type { ResolvedConfig } from "../config.js";

export function makePublicClient(cfg: ResolvedConfig): PublicClient {
  return createPublicClient({
    chain: cfg.chain,
    transport: http(cfg.rpcUrl),
  });
}

export function makeWalletClient(
  cfg: ResolvedConfig,
  account: Account,
): WalletClient {
  return createWalletClient({
    chain: cfg.chain,
    transport: http(cfg.rpcUrl),
    account,
  });
}
