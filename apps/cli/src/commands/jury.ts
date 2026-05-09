import { type Hex, isHex } from "viem";
import { truthMarketAbi } from "../abi.js";
import { makePublicClient, makeWalletClient } from "../chain/client.js";
import {
  readJurorVotes,
  writeCommitJury,
} from "../chain/contract.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type OutputContext, emitResult, promptSecret } from "../io.js";
import { assertJuryCommitAllowed, loadPolicy } from "../policy/policy.js";
import { loadWallet } from "../wallet/loader.js";

export async function cmdJuryStatus(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const client = makePublicClient(cfg);
  const jurors = await readJurorVotes(client, cfg);
  const lower = wallet.account.address.toLowerCase();
  const me = jurors.find((j) => j.juror.toLowerCase() === lower) ?? null;
  const revealDeadline = Number(
    (await client.readContract({
      address: cfg.contractAddress,
      abi: truthMarketAbi,
      functionName: "revealDeadline",
    })) as bigint,
  );
  emitResult(
    ctx,
    {
      address: wallet.account.address,
      isSelected: !!me,
      hasRevealed: me?.revealed ?? false,
      vote: me?.vote ?? 0,
      stake: me?.stake ?? 0n,
      riskedStake: me?.riskedStake ?? 0n,
      revealDeadline,
    },
    () => {
      process.stdout.write(
        `wallet:        ${wallet.account.address}\n` +
          `selected:      ${!!me}\n` +
          `has revealed:  ${me?.revealed ?? false}\n` +
          `reveal ends:   ${new Date(revealDeadline * 1000).toISOString()}\n`,
      );
    },
  );
}

export interface JuryCommitOpts extends ConfigOverrides {
  randomness: string;
  auditHash: string;
  ignorePolicy?: boolean;
}

export async function cmdJuryCommit(
  ctx: OutputContext,
  opts: JuryCommitOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const policy = await loadPolicy(cfg);
  assertJuryCommitAllowed(policy, { ignorePolicy: opts.ignorePolicy });
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);

  let randomness: bigint;
  try {
    randomness = BigInt(opts.randomness);
  } catch {
    throw new CliError("INVALID_RANDOMNESS", "randomness must be a uint256 (decimal or 0x-hex)");
  }
  if (!isHex(opts.auditHash) || opts.auditHash.length !== 66) {
    throw new CliError("INVALID_AUDIT_HASH", "auditHash must be 32-byte hex");
  }
  const tx = await writeCommitJury(walletClient, publicClient, cfg, {
    randomness,
    auditHash: opts.auditHash as Hex,
  });
  emitResult(
    ctx,
    { txHash: tx.txHash, blockNumber: tx.blockNumber },
    () => {
      process.stdout.write(`commitJury tx: ${tx.txHash} (block ${tx.blockNumber})\n`);
    },
  );
}
