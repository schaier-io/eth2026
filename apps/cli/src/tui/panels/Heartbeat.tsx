import { Box, Text, useInput } from "ink";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { makePublicClient, makeWalletClient } from "../../chain/client.js";
import type { ResolvedConfig } from "../../config.js";
import {
  type HeartbeatEvent,
  type HeartbeatHandle,
  startHeartbeat,
} from "../../heartbeat/watcher.js";
import { type Policy, loadPolicy } from "../../policy/policy.js";
import type { LoadedWallet } from "../../wallet/loader.js";

const MAX_LINES = 20;

export function HeartbeatPanel({
  cfg,
  wallet,
  vaultPassphrase,
}: {
  cfg: ResolvedConfig;
  wallet: LoadedWallet;
  vaultPassphrase: string;
}) {
  const [events, setEvents] = useState<HeartbeatEvent[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [running, setRunning] = useState(false);
  const handleRef = useRef<HeartbeatHandle | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const publicClient = useMemo(() => makePublicClient(cfg), [cfg]);
  const walletClient = useMemo(
    () => makeWalletClient(cfg, wallet.account),
    [cfg, wallet.account],
  );

  useEffect(() => {
    loadPolicy(cfg).then(setPolicy).catch(() => setPolicy(null));
  }, [cfg]);

  useInput((input) => {
    if (input === "s" && !running && policy) {
      const ac = new AbortController();
      acRef.current = ac;
      const handle = startHeartbeat(
        publicClient,
        walletClient,
        cfg,
        wallet.account,
        { policy, vaultPassphrase, signal: ac.signal },
        (e) => setEvents((prev) => [...prev, e].slice(-MAX_LINES)),
      );
      handleRef.current = handle;
      setRunning(true);
      handle.done.then(() => setRunning(false));
    }
    if (input === "x" && running) {
      acRef.current?.abort();
      setRunning(false);
    }
  });

  if (!policy) {
    return (
      <Box flexDirection="column">
        <Text color="red">no policy loaded; run 'truthmarket policy set --file path' first.</Text>
        <Text color="gray">
          Default policy file: {cfg.policyPath}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Heartbeat — {running ? "RUNNING" : "stopped"}</Text>
      <Text color="gray">
        autoReveal={String(policy.autoReveal)} buffer={policy.revealBufferMinutes}m autoWithdraw={String(policy.autoWithdraw)} poll={policy.pollIntervalSeconds}s
      </Text>
      <Text color="gray">s=start  x=stop  esc=back</Text>
      <Box marginTop={1} flexDirection="column">
        {events.map((e, i) => (
          <Text key={i} color={e.event === "error" ? "red" : e.event === "tick" ? "gray" : undefined}>
            [{e.ts.slice(11, 19)}] {e.event} {summarize(e)}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function summarize(e: HeartbeatEvent): string {
  switch (e.event) {
    case "tick":
      return `phase=${e.phaseLabel} reveal=${e.secondsToReveal}s end=${e.secondsToRevealEnd}s`;
    case "phase-change":
      return `${e.from}→${e.to} (${e.phaseLabel})`;
    case "reveal-scheduled":
      return `at ${e.revealAt}`;
    case "reveal-sent":
      return `tx=${e.txHash} vote=${e.vote}`;
    case "reveal-skipped":
      return e.reason;
    case "withdraw-sent":
      return `tx=${e.txHash}`;
    case "withdraw-skipped":
      return e.reason;
    case "stop":
      return e.reason;
    case "error":
      return `[${e.code}] ${e.message}`;
  }
}
