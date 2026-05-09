import type { Account, PublicClient, WalletClient } from "viem";
import { phaseLabel, truthMarketAbi } from "../abi.js";
import {
  readCommit,
  readRevealStats,
  writeRevealVote,
  writeWithdraw,
} from "../chain/contract.js";
import type { ResolvedConfig } from "../config.js";
import type { Policy } from "../policy/policy.js";
import { loadVaultEntry } from "../vault/vault.js";

export type HeartbeatEvent =
  | { ts: string; event: "tick"; phase: number; phaseLabel: string; secondsToReveal: number; secondsToRevealEnd: number }
  | { ts: string; event: "phase-change"; from: number; to: number; phaseLabel: string }
  | { ts: string; event: "reveal-scheduled"; revealAt: string }
  | { ts: string; event: "reveal-sent"; txHash: string; vote: number }
  | { ts: string; event: "reveal-skipped"; reason: string }
  | { ts: string; event: "withdraw-sent"; txHash: string }
  | { ts: string; event: "withdraw-skipped"; reason: string }
  | { ts: string; event: "stop"; reason: string }
  | { ts: string; event: "error"; code: string; message: string };

export interface HeartbeatOptions {
  policy: Policy;
  vaultPassphrase: string;
  signal?: AbortSignal;
}

export interface HeartbeatHandle {
  stop(): void;
  done: Promise<void>;
}

/**
 * Foreground heartbeat. Caller is responsible for backgrounding (tmux,
 * systemd, etc.). Emits events to the supplied async iterator consumer; we
 * keep the API simple by taking an `onEvent` callback so commands can either
 * print to stdout (NDJSON) or pipe to ink.
 *
 * Loop:
 *   - poll phase + reveal stats every policy.pollIntervalSeconds
 *   - if phase moved Voting → Reveal and we have a vault entry, schedule
 *     reveal (revealBufferMinutes before deadline, or immediately if past)
 *   - if phase Resolved and policy.autoWithdraw, withdraw once
 */
export function startHeartbeat(
  publicClient: PublicClient,
  walletClient: WalletClient,
  cfg: ResolvedConfig,
  account: Account,
  opts: HeartbeatOptions,
  onEvent: (e: HeartbeatEvent) => void,
): HeartbeatHandle {
  let stopped = false;
  let lastPhase: number | null = null;
  let revealAttempted = false;
  let withdrawAttempted = false;
  let resolveTimer: NodeJS.Timeout | null = null;
  // Stored so stop() can wake the in-flight sleep instead of waiting for the
  // next setTimeout to fire (which doesn't, after we clearTimeout).
  let wakeSleep: (() => void) | null = null;

  const stop = (reason: string) => {
    if (stopped) return;
    stopped = true;
    if (resolveTimer) clearTimeout(resolveTimer);
    const wake = wakeSleep;
    wakeSleep = null;
    onEvent({ ts: new Date().toISOString(), event: "stop", reason });
    if (wake) wake();
  };

  opts.signal?.addEventListener("abort", () => stop("aborted"));

  const done = (async () => {
    while (!stopped) {
      try {
        const stats = await readRevealStats(publicClient, cfg);
        const phase = stats.phase;
        const now = Math.floor(Date.now() / 1000);
        const revealDeadline = Number(
          (await publicClient.readContract({
            address: cfg.contractAddress,
            abi: truthMarketAbi,
            functionName: "revealDeadline",
          })) as bigint,
        );
        const juryCommitDeadline = Number(
          (await publicClient.readContract({
            address: cfg.contractAddress,
            abi: truthMarketAbi,
            functionName: "juryCommitDeadline",
          })) as bigint,
        );

        const ts = new Date().toISOString();

        if (lastPhase !== null && lastPhase !== phase) {
          onEvent({
            ts,
            event: "phase-change",
            from: lastPhase,
            to: phase,
            phaseLabel: phaseLabel(phase),
          });
        }
        lastPhase = phase;

        onEvent({
          ts,
          event: "tick",
          phase,
          phaseLabel: phaseLabel(phase),
          secondsToReveal: Math.max(0, juryCommitDeadline - now),
          secondsToRevealEnd: Math.max(0, revealDeadline - now),
        });

        // Auto-reveal during reveal phase.
        if (
          phase === 1 &&
          opts.policy.autoReveal &&
          !revealAttempted
        ) {
          const commit = await readCommit(publicClient, cfg, account.address);
          if (
            commit.hash !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
            !commit.revealed &&
            !commit.revoked
          ) {
            const bufferSecs = opts.policy.revealBufferMinutes * 60;
            const revealAt = revealDeadline - bufferSecs;
            if (now >= revealAt || now >= revealDeadline - 60) {
              try {
                const entry = await loadVaultEntry(
                  cfg,
                  account.address,
                  opts.vaultPassphrase,
                );
                if (!entry) {
                  onEvent({
                    ts: new Date().toISOString(),
                    event: "reveal-skipped",
                    reason: "no vault entry for this wallet",
                  });
                  revealAttempted = true;
                } else {
                  const r = await writeRevealVote(
                    walletClient,
                    publicClient,
                    cfg,
                    { vote: entry.vote, nonce: entry.nonce },
                  );
                  onEvent({
                    ts: new Date().toISOString(),
                    event: "reveal-sent",
                    txHash: r.txHash,
                    vote: entry.vote,
                  });
                  revealAttempted = true;
                }
              } catch (e) {
                onEvent({
                  ts: new Date().toISOString(),
                  event: "error",
                  code: "REVEAL_FAILED",
                  message: (e as Error).message,
                });
                revealAttempted = true; // do not loop on the same error
              }
            } else {
              onEvent({
                ts: new Date().toISOString(),
                event: "reveal-scheduled",
                revealAt: new Date(revealAt * 1000).toISOString(),
              });
            }
          } else if (commit.revealed) {
            revealAttempted = true;
          }
        }

        // Auto-withdraw post-resolution.
        if (
          phase === 2 &&
          opts.policy.autoWithdraw &&
          !withdrawAttempted
        ) {
          const commit = await readCommit(publicClient, cfg, account.address);
          if (
            commit.hash !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
            !commit.withdrawn &&
            !commit.revoked
          ) {
            try {
              const r = await writeWithdraw(walletClient, publicClient, cfg);
              onEvent({
                ts: new Date().toISOString(),
                event: "withdraw-sent",
                txHash: r.txHash,
              });
            } catch (e) {
              onEvent({
                ts: new Date().toISOString(),
                event: "error",
                code: "WITHDRAW_FAILED",
                message: (e as Error).message,
              });
            }
            withdrawAttempted = true;
          } else {
            withdrawAttempted = true;
          }
        }

        if (phase === 2 && (withdrawAttempted || !opts.policy.autoWithdraw)) {
          stop("market resolved");
          break;
        }
      } catch (e) {
        onEvent({
          ts: new Date().toISOString(),
          event: "error",
          code: "POLL_FAILED",
          message: (e as Error).message,
        });
      }

      // sleep with abort support — stop() can wake us via wakeSleep so we
      // don't have to wait out the polling interval after an abort.
      await new Promise<void>((resolve) => {
        if (stopped) return resolve();
        wakeSleep = resolve;
        resolveTimer = setTimeout(() => {
          wakeSleep = null;
          resolve();
        }, opts.policy.pollIntervalSeconds * 1000);
      });
    }
  })();

  return { stop: () => stop("manual"), done };
}

