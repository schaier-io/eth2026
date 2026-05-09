import type { Address } from "viem";
import { OUTCOME_LABELS, PHASE_LABELS, phaseLabel, outcomeLabel } from "../abi.js";
import { makePublicClient } from "../chain/client.js";
import {
  readConfig,
  readJurorVotes,
  readOutcome,
  readPhase,
  readRevealStats,
} from "../chain/contract.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { type OutputContext, emitNdjson, emitResult, promptSecret } from "../io.js";
import { loadWallet } from "../wallet/loader.js";

export async function cmdMarketInfo(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const [config, phase, outcome] = await Promise.all([
    readConfig(client, cfg),
    readPhase(client, cfg),
    readOutcome(client, cfg),
  ]);
  const data = {
    address: cfg.contractAddress,
    chain: cfg.chainKey,
    chainId: cfg.chain.id,
    name: config.name,
    description: config.description,
    tags: config.tags,
    phase,
    phaseLabel: phaseLabel(phase),
    outcome,
    outcomeLabel: outcomeLabel(outcome),
    stakeToken: config.stakeToken,
    treasury: config.treasury,
    admin: config.admin,
    juryCommitter: config.juryCommitter,
    creator: config.creator,
    minStake: config.minStake,
    jurySize: config.jurySize,
    minCommits: config.minCommits,
    minRevealedJurors: config.minRevealedJurors,
    riskPercent: config.riskPercent,
    protocolFeePercent: config.protocolFeePercent,
    ipfsHashHex: config.ipfsHash,
    deadlines: {
      voting: Number(config.votingDeadline),
      juryCommit: Number(config.juryCommitDeadline),
      reveal: Number(config.revealDeadline),
    },
  };
  emitResult(ctx, data, () => {
    process.stdout.write(
      `address:      ${cfg.contractAddress} (${cfg.chainKey})\n` +
        `name:         ${config.name}\n` +
        `description:  ${config.description}\n` +
        `tags:         ${config.tags.join(", ") || "(none)"}\n` +
        `phase:        ${phaseLabel(phase)} (${phase})\n` +
        `outcome:      ${outcomeLabel(outcome)} (${outcome})\n` +
        `stake token:  ${config.stakeToken}\n` +
        `min stake:    ${config.minStake}\n` +
        `jury size:    ${config.jurySize} (min reveal ${config.minRevealedJurors}, min commits ${config.minCommits})\n` +
        `risk percent: ${config.riskPercent}\n` +
        `voting ends:  ${new Date(Number(config.votingDeadline) * 1000).toISOString()}\n` +
        `jury cutoff:  ${new Date(Number(config.juryCommitDeadline) * 1000).toISOString()}\n` +
        `reveal ends:  ${new Date(Number(config.revealDeadline) * 1000).toISOString()}\n` +
        `ipfs hash:    ${config.ipfsHash}\n`,
    );
  });
}

export async function cmdMarketPhase(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const phase = await readPhase(client, cfg);
  emitResult(ctx, { phase, phaseLabel: phaseLabel(phase) }, () => {
    process.stdout.write(`${phaseLabel(phase)} (${phase})\n`);
  });
}

export async function cmdMarketStats(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const stats = await readRevealStats(client, cfg);
  emitResult(ctx, stats, () => {
    process.stdout.write(
      `phase:                ${PHASE_LABELS[stats.phase] ?? stats.phase}\n` +
        `outcome:              ${OUTCOME_LABELS[stats.outcome] ?? stats.outcome}\n` +
        `commits:              ${stats.commitCount} (revoked ${stats.revokedCount}, withdrawn ${stats.withdrawnCount})\n` +
        `revealed yes/no:      ${stats.revealedYesCount} / ${stats.revealedNoCount}\n` +
        `jury draw size:       ${stats.juryDrawSize}\n` +
        `jurors revealed:      ${stats.jurorRevealCount} (yes ${stats.juryYesCount}, no ${stats.juryNoCount})\n` +
        `total committed:      ${stats.totalCommittedStake}\n` +
        `total risked:         ${stats.totalRiskedStake}\n` +
        `distributable pool:   ${stats.distributablePool}\n` +
        `treasury accrued:     ${stats.treasuryAccrued}\n` +
        `creator accrued:      ${stats.creatorAccrued}\n` +
        `revoked slash:        ${stats.revokedSlashAccrued}\n`,
    );
  });
}

export async function cmdMarketJury(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const jurors = await readJurorVotes(client, cfg);
  let walletAddress: Address | null = null;
  try {
    const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
    walletAddress = wallet.account.address;
  } catch {
    // wallet optional for this read
  }
  const lower = walletAddress?.toLowerCase();
  const me = jurors.find((j) => j.juror.toLowerCase() === lower) ?? null;

  emitResult(
    ctx,
    {
      jurors: jurors.map((j) => ({
        juror: j.juror,
        revealed: j.revealed,
        vote: j.vote,
        stake: j.stake,
        riskedStake: j.riskedStake,
      })),
      wallet: walletAddress
        ? {
            address: walletAddress,
            isSelected: !!me,
            hasRevealed: me?.revealed ?? false,
            vote: me?.vote ?? 0,
          }
        : null,
    },
    () => {
      process.stdout.write(`jury (${jurors.length}):\n`);
      for (const j of jurors) {
        process.stdout.write(
          `  ${j.juror}  revealed=${j.revealed} vote=${j.vote} stake=${j.stake}\n`,
        );
      }
      if (walletAddress) {
        process.stdout.write(
          `wallet ${walletAddress}: ${
            me ? `selected (revealed=${me.revealed}, vote=${me.vote})` : "not selected"
          }\n`,
        );
      }
    },
  );
}

export async function cmdMarketWatch(
  ctx: OutputContext,
  opts: ConfigOverrides & { intervalSeconds?: number },
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const interval = (opts.intervalSeconds ?? 10) * 1000;

  let lastPhase: number | null = null;
  let lastOutcome: number | null = null;
  let stopped = false;
  const onSig = () => {
    stopped = true;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  while (!stopped) {
    const phase = await readPhase(client, cfg);
    const outcome = await readOutcome(client, cfg);
    if (phase !== lastPhase || outcome !== lastOutcome) {
      const evt = {
        ts: new Date().toISOString(),
        event: "snapshot",
        phase,
        phaseLabel: phaseLabel(phase),
        outcome,
        outcomeLabel: outcomeLabel(outcome),
      };
      if (ctx.json) emitNdjson(evt);
      else
        process.stdout.write(
          `[${evt.ts}] phase=${evt.phaseLabel}(${phase}) outcome=${evt.outcomeLabel}(${outcome})\n`,
        );
      lastPhase = phase;
      lastOutcome = outcome;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

