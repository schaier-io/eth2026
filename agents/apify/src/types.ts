export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/**
 * Per-market spec passed to `MarketRegistry.createMarket`. The registry
 * supplies the shared implementation; stakeToken and juryCommitter are
 * per-clone fields. The agent usually omits them and lets the host CLI fill
 * them from env, but host workflows may set them per market.
 */
export interface MarketSpec {
  stakeToken?: Address;
  juryCommitter?: Address;
  swarmReference: Hex;
  votingPeriod: bigint;
  adminTimeout: bigint;
  revealPeriod: bigint;
  minStake: bigint;
  /** Max jury draw size: targetJurySize in InitParams. */
  jurySize: number;
  minCommits: number;
  /** Optional hard cap on commits. 0 = uncapped. */
  maxCommits?: number;
  minRevealedJurors: number;
  /** Optional creator-funded subsidy (token base units). 0 = no bond. */
  creatorBond?: bigint;
}

export interface CreateMarketResult {
  txHash: Hex;
  blockNumber: bigint;
  marketAddress: Address;
  /** Position in the registry's `markets` array — equals the on-chain `index`. */
  marketId: bigint;
}

export interface PublishedClaimDocument {
  swarmReference: Hex;
  reference?: string;
  url?: string;
}
