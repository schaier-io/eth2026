export type Address = `0x${string}`;
export type Hex = `0x${string}`;

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

export interface CreateMarketResult {
  txHash: Hex;
  blockNumber: bigint;
  marketAddress: Address;
  marketId: bigint;
}
