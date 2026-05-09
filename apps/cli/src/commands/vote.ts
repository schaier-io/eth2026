import { type Address, type Hex, isAddress, isHex } from "viem";
import { writeRevealVote, writeRevokeStake, writeWithdraw } from "../chain/contract.js";
import { makePublicClient, makeWalletClient } from "../chain/client.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type OutputContext, emitResult, promptSecret } from "../io.js";
import { voteFromString } from "../abi.js";
import { loadPolicy } from "../policy/policy.js";
import { loadVaultEntry } from "../vault/vault.js";
import { loadWallet } from "../wallet/loader.js";
import { commitVoteCore } from "./vote-core.js";

async function getVaultPassphrase(): Promise<string> {
  const env = process.env.TM_VAULT_PASSPHRASE;
  if (env) return env;
  return await promptSecret("Vault passphrase: ");
}

export interface VoteCommitOpts extends ConfigOverrides {
  vote: string;
  stake: string;
  document?: string;
  ignorePolicy?: boolean;
}

export async function cmdVoteCommit(
  ctx: OutputContext,
  opts: VoteCommitOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const vote = voteFromString(opts.vote);
  const stake = BigInt(opts.stake);

  const policy = await loadPolicy(cfg);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const vaultPassphrase = await getVaultPassphrase();
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);

  const result = await commitVoteCore({
    cfg,
    publicClient,
    walletClient,
    account: wallet.account,
    policy,
    ignorePolicy: opts.ignorePolicy,
    vote,
    stake,
    vaultPassphrase,
    documentPath: opts.document,
  });

  emitResult(
    ctx,
    {
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      commitHash: result.commitHash,
      voter: result.voter,
      vote: result.vote,
      stake: result.stake.toString(),
      vaultPath: result.vaultPath,
    },
    () => {
      process.stdout.write(
        `committed vote=${result.vote} stake=${result.stake}\n` +
          `commit hash: ${result.commitHash}\n` +
          `tx:          ${result.txHash} (block ${result.blockNumber})\n` +
          `vault:       ${result.vaultPath}\n`,
      );
    },
  );
}

export async function cmdVoteReveal(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);

  const passphrase = await getVaultPassphrase();
  const entry = await loadVaultEntry(cfg, wallet.account.address, passphrase);
  if (!entry) {
    throw new CliError(
      "VAULT_ENTRY_NOT_FOUND",
      `no vault entry for ${wallet.account.address} on contract ${cfg.contractAddress}`,
    );
  }

  const tx = await writeRevealVote(walletClient, publicClient, cfg, {
    vote: entry.vote,
    nonce: entry.nonce,
  });

  emitResult(
    ctx,
    {
      txHash: tx.txHash,
      blockNumber: tx.blockNumber,
      vote: entry.vote,
      voter: wallet.account.address,
    },
    () => {
      process.stdout.write(
        `revealed vote=${entry.vote}\ntx: ${tx.txHash} (block ${tx.blockNumber})\n`,
      );
    },
  );
}

export interface VoteRevokeOpts extends ConfigOverrides {
  voter: string;
  vote: string;
  nonce: string;
}

export async function cmdVoteRevoke(
  ctx: OutputContext,
  opts: VoteRevokeOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  if (!isAddress(opts.voter)) {
    throw new CliError("INVALID_ADDRESS", `voter '${opts.voter}' is not a valid address`);
  }
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);

  const vote = voteFromString(opts.vote);
  if (!isHex(opts.nonce) || opts.nonce.length !== 66) {
    throw new CliError("INVALID_NONCE", "nonce must be 32-byte hex");
  }
  const tx = await writeRevokeStake(walletClient, publicClient, cfg, {
    voter: opts.voter as Address,
    vote,
    nonce: opts.nonce as Hex,
  });

  emitResult(
    ctx,
    {
      txHash: tx.txHash,
      blockNumber: tx.blockNumber,
      voter: opts.voter,
      claimer: wallet.account.address,
    },
    () => {
      process.stdout.write(
        `revoked stake of ${opts.voter}\ntx: ${tx.txHash} (block ${tx.blockNumber})\n`,
      );
    },
  );
}

export async function cmdWithdraw(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);

  const tx = await writeWithdraw(walletClient, publicClient, cfg);

  emitResult(
    ctx,
    {
      txHash: tx.txHash,
      blockNumber: tx.blockNumber,
      voter: wallet.account.address,
    },
    () => {
      process.stdout.write(`withdrew\ntx: ${tx.txHash} (block ${tx.blockNumber})\n`);
    },
  );
}
