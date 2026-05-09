import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { foundry } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { ResolvedConfig } from "../src/config.js";
import { type HeartbeatEvent, startHeartbeat } from "../src/heartbeat/watcher.js";
import { DEFAULT_POLICY, type Policy } from "../src/policy/policy.js";

const ACCOUNT = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

function tempCfg(): ResolvedConfig {
  const home = mkdtempSync(path.join(tmpdir(), "tm-cli-hb-"));
  return {
    contractAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    chain: foundry,
    chainKey: "foundry",
    rpcUrl: "http://127.0.0.1:8545",
    homeDir: home,
    keystorePath: path.join(home, "keystore.json"),
    vaultDir: path.join(home, "vault"),
    policyPath: path.join(home, "policy.json"),
  };
}

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function makePublicClient(opts: {
  phase?: number;
  revealDeadline?: bigint;
  juryCommitDeadline?: bigint;
  throwOnce?: boolean;
}) {
  let throwsLeft = opts.throwOnce ? 1 : 0;
  return {
    readContract: vi.fn(async (args: { functionName: string }) => {
      if (throwsLeft > 0 && args.functionName === "revealDeadline") {
        throwsLeft--;
        throw new Error("simulated rpc failure");
      }
      switch (args.functionName) {
        case "revealDeadline":
          return opts.revealDeadline ?? 0n;
        case "juryCommitDeadline":
          return opts.juryCommitDeadline ?? 0n;
        case "commits":
          return [ZERO_BYTES32, 0n, 0n, 0, 0, false, false, false];
        default:
          throw new Error(`unmocked readContract: ${args.functionName}`);
      }
    }),
    // readRevealStats() goes through readContract too; we shortcut by
    // providing the expected struct via a separate call shape:
  } as never;
}

// readRevealStats() in the real watcher calls readContract with
// functionName: "getRevealStats". The watcher reads `stats.phase` as a number.
// We need to handle that in the mock too.
function makePublicClientFull(opts: {
  phase: number;
  outcome?: number;
  revealDeadline?: number;
  juryCommitDeadline?: number;
  commitHash?: `0x${string}`;
  throwOnReadStats?: boolean;
}) {
  let pollCount = 0;
  return {
    readContract: vi.fn(async (args: { functionName: string }) => {
      switch (args.functionName) {
        case "getRevealStats": {
          pollCount++;
          if (opts.throwOnReadStats && pollCount === 1) {
            throw new Error("simulated rpc failure");
          }
          // Return a minimal stats struct shaped like the contract.
          return {
            phase: opts.phase,
            outcome: opts.outcome ?? 0,
            commitCount: 0,
            revokedCount: 0,
            withdrawnCount: 0,
            revealedYesCount: 0,
            revealedNoCount: 0,
            revealedTotalCount: 0,
            juryDrawSize: 0,
            juryYesCount: 0,
            juryNoCount: 0,
            jurorRevealCount: 0,
            totalCommittedStake: 0n,
            totalRiskedStake: 0n,
            revealedYesStake: 0n,
            revealedNoStake: 0n,
            revealedYesRisked: 0n,
            revealedNoRisked: 0n,
            jurorYesStake: 0n,
            jurorNoStake: 0n,
            jurorYesRisked: 0n,
            jurorNoRisked: 0n,
            distributablePool: 0n,
            revokedSlashAccrued: 0n,
            treasuryAccrued: 0n,
            creatorAccrued: 0n,
          };
        }
        case "revealDeadline":
          return BigInt(opts.revealDeadline ?? 0);
        case "juryCommitDeadline":
          return BigInt(opts.juryCommitDeadline ?? 0);
        case "commits":
          return [
            opts.commitHash ?? ZERO_BYTES32,
            0n,
            0n,
            0,
            0,
            false,
            false,
            false,
          ];
        default:
          throw new Error(`unmocked readContract: ${args.functionName}`);
      }
    }),
    simulateContract: vi.fn(async (args: unknown) => ({ request: args })),
    waitForTransactionReceipt: vi.fn(async () => ({ blockNumber: 1n })),
  } as never;
}

function makeWalletClient() {
  return {
    account: ACCOUNT,
    writeContract: vi.fn(async () =>
      "0xc0ffee0000000000000000000000000000000000000000000000000000000000",
    ),
  } as never;
}

function policy(overrides: Partial<Policy> = {}): Policy {
  // pollIntervalSeconds=5 is the schema minimum; the type accepts smaller.
  // Use 1 to keep tests fast.
  return { ...DEFAULT_POLICY, pollIntervalSeconds: 1, ...overrides };
}

describe("startHeartbeat", () => {
  it("aborts cleanly when its AbortSignal fires", async () => {
    const cfg = tempCfg();
    const events: HeartbeatEvent[] = [];
    const ac = new AbortController();

    const handle = startHeartbeat(
      makePublicClientFull({ phase: 0, revealDeadline: 9_999_999_999, juryCommitDeadline: 9_999_999_999 }),
      makeWalletClient(),
      cfg,
      ACCOUNT,
      { policy: policy(), vaultPassphrase: "p", signal: ac.signal },
      (e) => events.push(e),
    );
    // Let the first iteration run, then abort.
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await handle.done;

    const stop = events.find((e) => e.event === "stop");
    expect(stop).toBeDefined();
    expect((stop as { reason: string }).reason).toBe("aborted");
    expect(events.some((e) => e.event === "tick")).toBe(true);
  });

  it("emits POLL_FAILED when readRevealStats throws, then continues", async () => {
    const cfg = tempCfg();
    const events: HeartbeatEvent[] = [];
    const ac = new AbortController();

    const handle = startHeartbeat(
      makePublicClientFull({
        phase: 0,
        revealDeadline: 9_999_999_999,
        juryCommitDeadline: 9_999_999_999,
        throwOnReadStats: true,
      }),
      makeWalletClient(),
      cfg,
      ACCOUNT,
      { policy: policy(), vaultPassphrase: "p", signal: ac.signal },
      (e) => events.push(e),
    );

    // Wait long enough for at least one error tick + one healthy tick.
    await new Promise((r) => setTimeout(r, 1500));
    ac.abort();
    await handle.done;

    const errorEvent = events.find(
      (e) => e.event === "error" && (e as { code: string }).code === "POLL_FAILED",
    );
    expect(errorEvent).toBeDefined();
    // After the throw, subsequent polls should produce normal ticks.
    expect(events.some((e) => e.event === "tick")).toBe(true);
  }, 5000);

  it("immediately stops when phase is already Resolved and autoWithdraw=false", async () => {
    const cfg = tempCfg();
    const events: HeartbeatEvent[] = [];
    const ac = new AbortController();

    const handle = startHeartbeat(
      makePublicClientFull({ phase: 2, outcome: 1, revealDeadline: 0, juryCommitDeadline: 0 }),
      makeWalletClient(),
      cfg,
      ACCOUNT,
      {
        policy: policy({ autoWithdraw: false }),
        vaultPassphrase: "p",
        signal: ac.signal,
      },
      (e) => events.push(e),
    );
    await handle.done;

    const stop = events.find((e) => e.event === "stop");
    expect(stop).toBeDefined();
    expect((stop as { reason: string }).reason).toBe("market resolved");
  });

  it("manual stop() resolves done with stop event", async () => {
    const cfg = tempCfg();
    const events: HeartbeatEvent[] = [];

    const handle = startHeartbeat(
      makePublicClientFull({ phase: 0, revealDeadline: 9_999_999_999, juryCommitDeadline: 9_999_999_999 }),
      makeWalletClient(),
      cfg,
      ACCOUNT,
      { policy: policy(), vaultPassphrase: "p" },
      (e) => events.push(e),
    );
    await new Promise((r) => setTimeout(r, 50));
    handle.stop();
    await handle.done;

    const stop = events.find((e) => e.event === "stop");
    expect(stop).toBeDefined();
    expect((stop as { reason: string }).reason).toBe("manual");
  });
});

// Make a single export so vitest doesn't complain about unused imports.
export const _heartbeatHelper = makePublicClient;
