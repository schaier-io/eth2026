import { truthMarketAbi } from "../abi.js";
import { makePublicClient, makeWalletClient } from "../chain/client.js";
import {
  readJurorVotes,
  writeCommitJury,
} from "../chain/contract.js";
import { assertConfiguredMarketIntegrity } from "../chain/market-integrity.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { type OutputContext, emitResult, promptSecret } from "../io.js";
import { assertJuryCommitAllowed, loadPolicy } from "../policy/policy.js";
import {
  SPACE_COMPUTER_BEACON_URL,
  fetchLatestSpaceComputerBeacon,
} from "../spacecomputer/beacon.js";
import { loadWallet } from "../wallet/loader.js";

export async function cmdJuryStatus(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const client = makePublicClient(cfg);
  await assertConfiguredMarketIntegrity(client, cfg);
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
  await assertConfiguredMarketIntegrity(publicClient, cfg);
  const beacon = await fetchLatestSpaceComputerBeacon();

  const tx = await writeCommitJury(walletClient, publicClient, cfg, {
    randomness: beacon.randomness,
    metadata: beacon.metadata,
    auditHash: beacon.auditHash,
  });
  emitResult(
    ctx,
    {
      txHash: tx.txHash,
      blockNumber: tx.blockNumber,
      beaconUrl: SPACE_COMPUTER_BEACON_URL,
      randomness: beacon.randomness,
      randomnessHex: beacon.randomnessHex,
      randomnessIpfsAddress: beacon.ipfsAddressText,
      randomnessSequence: beacon.metadata.sequence,
      randomnessTimestamp: beacon.metadata.timestamp,
      randomnessIndex: beacon.metadata.valueIndex,
      auditHash: beacon.auditHash,
      previous: beacon.previous,
    },
    () => {
      process.stdout.write(
        `commitJury tx: ${tx.txHash} (block ${tx.blockNumber})\n` +
          `beacon URL: ${SPACE_COMPUTER_BEACON_URL}\n` +
          `randomness IPFS: ${beacon.ipfsAddressText}\n` +
          `beacon sequence: ${beacon.metadata.sequence}\n` +
          `beacon timestamp: ${beacon.metadata.timestamp}\n` +
          `cTRNG index: ${beacon.metadata.valueIndex}\n` +
          `audit hash: ${beacon.auditHash}\n`,
      );
    },
  );
}
