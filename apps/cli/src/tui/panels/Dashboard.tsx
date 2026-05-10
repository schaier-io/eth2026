import { Box, Text } from "ink";
import React, { useMemo } from "react";
import { OUTCOME_LABELS, PHASE_LABELS } from "../../abi.js";
import { makePublicClient } from "../../chain/client.js";
import { readConfig, readJurorVotes, readRevealStats } from "../../chain/contract.js";
import type { ResolvedConfig } from "../../config.js";
import type { LoadedWallet } from "../../wallet/loader.js";
import { usePoll } from "../hooks/usePoll.js";

export function Dashboard({ cfg, wallet }: { cfg: ResolvedConfig; wallet: LoadedWallet }) {
  const client = useMemo(() => makePublicClient(cfg), [cfg]);

  const { data: stats, error: statsErr } = usePoll(
    () => readRevealStats(client, cfg),
    5000,
  );
  const { data: config, error: configErr } = usePoll(
    () => readConfig(client, cfg),
    30000,
  );
  const { data: jurors } = usePoll(() => readJurorVotes(client, cfg), 10000);

  const err = statsErr ?? configErr;
  if (err) return <Text color="red">error: {err}</Text>;
  if (!stats || !config) return <Text>loading…</Text>;

  const now = Math.floor(Date.now() / 1000);
  const fmtCountdown = (deadline: bigint) => {
    const secs = Number(deadline) - now;
    if (secs <= 0) return "expired";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h${m}m${s}s`;
  };

  const isJuror = jurors?.some(
    (j) => j.juror.toLowerCase() === wallet.account.address.toLowerCase(),
  );

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>{config.swarmReference}</Text>{" "}
        <Text color="gray">phase=</Text>
        <Text color={stats.phase === 0 ? "yellow" : stats.phase === 1 ? "cyan" : "green"}>
          {PHASE_LABELS[stats.phase] ?? stats.phase}
        </Text>{" "}
        <Text color="gray">outcome=</Text>
        <Text>{OUTCOME_LABELS[stats.outcome] ?? stats.outcome}</Text>
      </Text>
      <Text color="gray">claim document lives in verified Swarm storage</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>commits: {stats.commitCount} (revoked {stats.revokedCount}, withdrawn {stats.withdrawnCount})</Text>
        <Text>revealed: yes={stats.revealedYesCount} no={stats.revealedNoCount} total={stats.revealedTotalCount}</Text>
        <Text>jury draw: {stats.juryDrawSize} (revealed {stats.jurorRevealCount}, yes={stats.juryYesCount} no={stats.juryNoCount})</Text>
        <Text>total stake: {stats.totalCommittedStake.toString()} (risked {stats.totalRiskedStake.toString()})</Text>
        <Text>distributable pool: {stats.distributablePool.toString()}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>voting ends:    {fmtCountdown(config.votingDeadline)}</Text>
        <Text>jury commit by: {fmtCountdown(config.juryCommitDeadline)}</Text>
        <Text>reveal ends:    {fmtCountdown(config.revealDeadline)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Jury ({jurors?.length ?? 0})</Text>
        {jurors?.map((j) => (
          <Text key={j.juror} color={j.juror.toLowerCase() === wallet.account.address.toLowerCase() ? "magenta" : undefined}>
            {j.juror.slice(0, 10)}…  revealed={String(j.revealed)}  vote={j.vote}
          </Text>
        ))}
        {isJuror && <Text color="magenta">[wallet is a selected juror]</Text>}
      </Box>
    </Box>
  );
}
