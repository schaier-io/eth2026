import {
  type Account,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  computeCommitHash,
  readCommit,
  readStakeToken,
  writeCommitVote,
} from "../chain/contract.js";
import { readAllowance } from "../chain/erc20.js";
import type { ResolvedConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type Policy, assertCommitAllowed } from "../policy/policy.js";
import { verifyOnchainClaimRulesDocument, type ClaimRulesVerificationOptions } from "../swarm/verify.js";
import { generateNonce, saveVaultEntry } from "../vault/vault.js";

export interface CommitVoteCoreInput {
  cfg: ResolvedConfig;
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
  policy: Policy;
  ignorePolicy?: boolean;
  vote: 1 | 2;
  stake: bigint;
  vaultPassphrase: string;
  documentPath?: string;
  swarmVerification?: ClaimRulesVerificationOptions;
}

export interface CommitVoteCoreResult {
  txHash: Hex;
  blockNumber: bigint;
  commitHash: Hex;
  voter: `0x${string}`;
  vote: 1 | 2;
  stake: bigint;
  vaultPath: string;
}

/**
 * Single source of truth for the commit-reveal commit step. Shared by the
 * non-interactive `vote commit` subcommand and the TUI VoteFlow panel so the
 * policy gate, allowance check, swarm verification, and vault save sequence
 * cannot diverge between surfaces.
 *
 * Sequence (any of these may throw a CliError; nothing on chain happens until
 * the broadcast at step 7):
 *   1. assertCommitAllowed (maxStake gate)
 *   2. swarm verification (when policy.requireSwarmVerification + !ignorePolicy)
 *   3. ERC20 allowance pre-check
 *   4. existing-commit pre-check
 *   5. generate nonce, compute commit hash locally
 *   6. save vault entry (placeholder tx hash) — never lose a nonce after
 *      a successful broadcast
 *   7. broadcast commitVote
 *   8. update vault entry with the real tx hash
 */
export async function commitVoteCore(
  input: CommitVoteCoreInput,
): Promise<CommitVoteCoreResult> {
  const {
    cfg,
    publicClient,
    walletClient,
    account,
    policy,
    ignorePolicy,
    vote,
    stake,
    vaultPassphrase,
    documentPath,
    swarmVerification,
  } = input;

  if (stake <= 0n) {
    throw new CliError(
      "INVALID_STAKE",
      "stake must be a positive integer (token base units)",
    );
  }

  assertCommitAllowed(policy, stake, { ignorePolicy });

  if (policy.requireSwarmVerification && !ignorePolicy) {
    if (!documentPath) {
      throw new CliError(
        "POLICY_SWARM_VERIFICATION_REQUIRED",
        "policy.requireSwarmVerification is true; supply a local copy of the rules document, or pass --ignore-policy",
      );
    }
    const verify = await verifyOnchainClaimRulesDocument(publicClient, cfg, documentPath, swarmVerification);
    if (!verify.match) {
      const referenceDetail = verify.swarmReference ? ` and verified Swarm reference ${verify.swarmReference}` : "";
      throw new CliError(
        "SWARM_HASH_MISMATCH",
        `local document ${documentPath} (${verify.computed}) does not match on-chain claimRulesHash ${verify.expected}${referenceDetail}`,
      );
    }
  }

  const stakeToken = await readStakeToken(publicClient, cfg);
  const allowance = await readAllowance(
    publicClient,
    stakeToken,
    account.address,
    cfg.contractAddress,
  );
  if (allowance < stake) {
    throw new CliError(
      "INSUFFICIENT_ALLOWANCE",
      `stake token allowance ${allowance} < stake ${stake}; run 'truthmarket erc20 approve' first`,
    );
  }

  const existing = await readCommit(publicClient, cfg, account.address);
  if (
    existing.hash !==
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    throw new CliError(
      "ALREADY_COMMITTED",
      `wallet ${account.address} already has a commit on this market`,
    );
  }

  const nonce = generateNonce();
  const commitHash = computeCommitHash({
    vote,
    nonce,
    voter: account.address,
    chainId: cfg.chain.id,
    contract: cfg.contractAddress,
  });

  const tempEntry = {
    market: cfg.contractAddress,
    chainId: cfg.chain.id,
    voter: account.address,
    vote,
    nonce,
    stake: stake.toString(),
    commitTxHash: ("0x" + "00".repeat(32)) as Hex,
    createdAt: new Date().toISOString(),
  };
  const vaultPath = await saveVaultEntry(cfg, vaultPassphrase, tempEntry);

  const tx = await writeCommitVote(walletClient, publicClient, cfg, {
    commitHash,
    stake,
  });

  await saveVaultEntry(cfg, vaultPassphrase, {
    ...tempEntry,
    commitTxHash: tx.txHash,
  });

  return {
    txHash: tx.txHash,
    blockNumber: tx.blockNumber,
    commitHash,
    voter: account.address,
    vote,
    stake,
    vaultPath,
  };
}
