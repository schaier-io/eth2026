import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { truthMarketAbi } from "../abi.js";
import type { ResolvedConfig } from "../config.js";

export interface MarketConfig {
  stakeToken: Address;
  treasury: Address;
  admin: Address;
  juryCommitter: Address;
  creator: Address;
  name: string;
  description: string;
  tags: readonly string[];
  ipfsHash: Hex;
  votingDeadline: bigint;
  juryCommitDeadline: bigint;
  revealDeadline: bigint;
  protocolFeePercent: number;
  minStake: bigint;
  jurySize: number;
  minCommits: number;
  minRevealedJurors: number;
  maxJurySize: number;
  maxJuryPercentage: bigint;
  maxTags: bigint;
  maxNameBytes: bigint;
  maxDescriptionBytes: bigint;
  maxTagBytes: bigint;
  maxIpfsHashBytes: bigint;
  riskPercent: number;
  maxProtocolFeePercent: number;
}

export interface RevealStats {
  phase: number;
  outcome: number;
  commitCount: number;
  revokedCount: number;
  withdrawnCount: number;
  revealedYesCount: number;
  revealedNoCount: number;
  revealedTotalCount: number;
  juryDrawSize: number;
  juryYesCount: number;
  juryNoCount: number;
  jurorRevealCount: number;
  totalCommittedStake: bigint;
  totalRiskedStake: bigint;
  revealedYesStake: bigint;
  revealedNoStake: bigint;
  revealedYesRisked: bigint;
  revealedNoRisked: bigint;
  jurorYesStake: bigint;
  jurorNoStake: bigint;
  jurorYesRisked: bigint;
  jurorNoRisked: bigint;
  distributablePool: bigint;
  revokedSlashAccrued: bigint;
  treasuryAccrued: bigint;
  creatorAccrued: bigint;
}

export interface CommitRecord {
  hash: Hex;
  stake: bigint;
  riskedStake: bigint;
  committerIndex: number;
  revealedVote: number;
  revealed: boolean;
  withdrawn: boolean;
  revoked: boolean;
}

export interface JurorVote {
  juror: Address;
  revealed: boolean;
  vote: number;
  stake: bigint;
  riskedStake: bigint;
}

export function readConfig(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<MarketConfig> {
  return client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "getConfig",
  }) as Promise<MarketConfig>;
}

export function readRevealStats(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<RevealStats> {
  return client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "getRevealStats",
  }) as Promise<RevealStats>;
}

export function readJury(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<readonly Address[]> {
  return client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "getJury",
  }) as Promise<readonly Address[]>;
}

export function readJurorVotes(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<readonly JurorVote[]> {
  return client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "getJurorVotes",
  }) as Promise<readonly JurorVote[]>;
}

export async function readCommit(
  client: PublicClient,
  cfg: ResolvedConfig,
  voter: Address,
): Promise<CommitRecord> {
  const tuple = (await client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "commits",
    args: [voter],
  })) as readonly [Hex, bigint, bigint, number, number, boolean, boolean, boolean];
  return {
    hash: tuple[0],
    stake: tuple[1],
    riskedStake: tuple[2],
    committerIndex: tuple[3],
    revealedVote: tuple[4],
    revealed: tuple[5],
    withdrawn: tuple[6],
    revoked: tuple[7],
  };
}

export async function readPhase(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<number> {
  return Number(
    await client.readContract({
      address: cfg.contractAddress,
      abi: truthMarketAbi,
      functionName: "phase",
    }),
  );
}

export async function readOutcome(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<number> {
  return Number(
    await client.readContract({
      address: cfg.contractAddress,
      abi: truthMarketAbi,
      functionName: "outcome",
    }),
  );
}

export async function readStakeToken(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<Address> {
  return (await client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "stakeToken",
  })) as Address;
}

/**
 * Compute the commit hash locally (matches contract `_commitHash`):
 *   keccak256(abi.encode(uint8 vote, bytes32 nonce, address voter, uint256 chainid, address contract))
 *
 * Verified against on-chain `commitHashOf` in test/commit-hash.test.ts.
 */
export function computeCommitHash(args: {
  vote: 1 | 2;
  nonce: Hex;
  voter: Address;
  chainId: number | bigint;
  contract: Address;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
      ],
      [args.vote, args.nonce, args.voter, BigInt(args.chainId), args.contract],
    ),
  );
}

export async function writeCommitVote(
  wallet: WalletClient,
  client: PublicClient,
  cfg: ResolvedConfig,
  args: { commitHash: Hex; stake: bigint },
): Promise<{ txHash: Hex; blockNumber: bigint }> {
  const { request } = await client.simulateContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "commitVote",
    args: [args.commitHash, args.stake],
    account: wallet.account!,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, blockNumber: receipt.blockNumber };
}

export async function writeRevealVote(
  wallet: WalletClient,
  client: PublicClient,
  cfg: ResolvedConfig,
  args: { vote: 1 | 2; nonce: Hex },
): Promise<{ txHash: Hex; blockNumber: bigint }> {
  const { request } = await client.simulateContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "revealVote",
    args: [args.vote, args.nonce],
    account: wallet.account!,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, blockNumber: receipt.blockNumber };
}

export async function writeRevokeStake(
  wallet: WalletClient,
  client: PublicClient,
  cfg: ResolvedConfig,
  args: { voter: Address; vote: 1 | 2; nonce: Hex },
): Promise<{ txHash: Hex; blockNumber: bigint }> {
  const { request } = await client.simulateContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "revokeStake",
    args: [args.voter, args.vote, args.nonce],
    account: wallet.account!,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, blockNumber: receipt.blockNumber };
}

export async function writeWithdraw(
  wallet: WalletClient,
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<{ txHash: Hex; blockNumber: bigint }> {
  const { request } = await client.simulateContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "withdraw",
    account: wallet.account!,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, blockNumber: receipt.blockNumber };
}

export async function writeCommitJury(
  wallet: WalletClient,
  client: PublicClient,
  cfg: ResolvedConfig,
  args: { randomness: bigint; auditHash: Hex },
): Promise<{ txHash: Hex; blockNumber: bigint }> {
  const { request } = await client.simulateContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "commitJury",
    args: [args.randomness, args.auditHash],
    account: wallet.account!,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, blockNumber: receipt.blockNumber };
}

export async function writeResolve(
  wallet: WalletClient,
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<{ txHash: Hex; blockNumber: bigint }> {
  const { request } = await client.simulateContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "resolve",
    account: wallet.account!,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, blockNumber: receipt.blockNumber };
}
