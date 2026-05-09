import { readFile } from "node:fs/promises";
import { type Address, type Hex } from "viem";
import { fetchCandidates } from "../agent/apify.js";
import { hasSeen, loadAgentState, recordSeen, saveAgentState } from "../agent/state.js";
import { buildMarketSpec } from "../agent/spec-builder.js";
import { makePublicClient, makeWalletClient } from "../chain/client.js";
import { writeCreateMarket } from "../chain/registry.js";
import { type ConfigOverrides, type ResolvedConfig, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type OutputContext, emitNdjson, emitResult, promptSecret } from "../io.js";
import {
  type PolicyOverrides,
  assertCreateMarketAllowed,
  loadPolicy,
} from "../policy/policy.js";
import { loadWallet } from "../wallet/loader.js";

const DEFAULT_INTERVAL_SECONDS = 3600;
const DEFAULT_DURATION_SECONDS = 3600;
const DEFAULT_FEE_PERCENT = 5;
const DEFAULT_ENDPOINT =
  process.env.TM_APIFY_ENDPOINT ?? "http://localhost:3000/api/apify/generated-markets";

export interface AgentRunOpts extends ConfigOverrides, PolicyOverrides {
  intervalSeconds?: number;
  durationSeconds?: number;
  feePercent?: number;
  jurySize?: number;
  minCommits?: number;
  minRevealedJurors?: number;
  endpoint?: string;
  /** If set, the spec uses this minStake instead of the candidate's stake hint. */
  minStake?: string;
  /** Run a single iteration and exit. */
  once?: boolean;
  /**
   * Local JSON file with a Reddit-items array. When set, the agent posts these
   * to the web endpoint instead of letting it hit Apify. Useful for offline
   * demos and CI smoke tests where APIFY_TOKEN is not available.
   */
  itemsFile?: string;
}

export interface TickResult {
  status: "created" | "skipped_no_candidate" | "skipped_all_seen" | "skipped_dry_run";
  candidateId?: string;
  permalink?: string;
  marketAddress?: Address;
  marketId?: string;
  txHash?: Hex;
  ipfsHash?: Hex;
  name?: string;
  reason?: string;
}

/** One iteration: fetch candidates, pick the first unseen one, create the market. */
export async function runAgentTick(
  cfg: ResolvedConfig,
  opts: AgentRunOpts,
  emitEvent: (e: Record<string, unknown>) => void,
): Promise<TickResult> {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  let items: unknown[] | undefined;
  if (opts.itemsFile) {
    const raw = await readFile(opts.itemsFile, "utf8");
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new CliError(
          "ITEMS_FILE_INVALID",
          `${opts.itemsFile} must be a JSON array of Reddit items`,
        );
      }
      items = parsed;
    } catch (e) {
      if (e instanceof CliError) throw e;
      throw new CliError(
        "ITEMS_FILE_PARSE",
        `could not parse ${opts.itemsFile}: ${(e as Error).message}`,
      );
    }
  }
  emitEvent({
    ts: new Date().toISOString(),
    event: "tick_start",
    endpoint,
    source: items ? "items_file" : "apify",
    itemsFile: opts.itemsFile,
  });

  const result = await fetchCandidates({ endpoint, items });
  emitEvent({
    ts: new Date().toISOString(),
    event: "candidates_fetched",
    source: result.source,
    count: result.candidates.length,
  });

  if (result.candidates.length === 0) {
    return { status: "skipped_no_candidate", reason: "apify returned no candidates" };
  }

  const state = await loadAgentState(cfg);
  const candidate = result.candidates.find(
    (c) => !hasSeen(state, { permalink: c.sourceUrl, candidateId: c.id }),
  );
  if (!candidate) {
    return {
      status: "skipped_all_seen",
      reason: `all ${result.candidates.length} candidates already in agent-state`,
    };
  }

  const policy = await loadPolicy(cfg);
  assertCreateMarketAllowed(policy, opts);

  const minStake = opts.minStake ? BigInt(opts.minStake) : BigInt(candidate.stake);
  const spec = buildMarketSpec(candidate, {
    durationSeconds: opts.durationSeconds ?? DEFAULT_DURATION_SECONDS,
    minStake,
    protocolFeePercent: opts.feePercent ?? DEFAULT_FEE_PERCENT,
    jurySize: opts.jurySize,
    minCommits: opts.minCommits,
    minRevealedJurors: opts.minRevealedJurors,
  });

  emitEvent({
    ts: new Date().toISOString(),
    event: "spec_built",
    candidateId: candidate.id,
    name: spec.name,
    ipfsHash: spec.ipfsHash,
    ipfsHashIsPlaceholder: true,
  });

  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);
  const created = await writeCreateMarket(walletClient, publicClient, cfg, spec);

  const nextState = recordSeen(state, {
    permalink: candidate.sourceUrl,
    candidateId: candidate.id,
    marketAddress: created.marketAddress,
    txHash: created.txHash,
    ipfsHash: spec.ipfsHash,
    name: spec.name,
  });
  await saveAgentState(cfg, nextState);

  emitEvent({
    ts: new Date().toISOString(),
    event: "market_created",
    candidateId: candidate.id,
    permalink: candidate.sourceUrl,
    marketId: created.marketId.toString(),
    marketAddress: created.marketAddress,
    txHash: created.txHash,
  });

  return {
    status: "created",
    candidateId: candidate.id,
    permalink: candidate.sourceUrl,
    marketAddress: created.marketAddress,
    marketId: created.marketId.toString(),
    txHash: created.txHash,
    ipfsHash: spec.ipfsHash,
    name: spec.name,
  };
}

export async function cmdAgentTick(
  ctx: OutputContext,
  opts: AgentRunOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const result = await runAgentTick(cfg, opts, () => {
    /* discard tick events for one-shot */
  });
  emitResult(ctx, result, () => {
    if (result.status === "created") {
      process.stdout.write(
        `created market #${result.marketId}\n` +
          `  address:   ${result.marketAddress}\n` +
          `  candidate: ${result.candidateId} (${result.permalink})\n` +
          `  tx:        ${result.txHash}\n` +
          `  name:      ${result.name}\n`,
      );
    } else {
      process.stdout.write(`skipped: ${result.status} (${result.reason ?? "no reason"})\n`);
    }
  });
}

export async function cmdAgentRun(
  ctx: OutputContext,
  opts: AgentRunOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const intervalMs = (opts.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS) * 1000;

  let stopped = false;
  const onSig = () => {
    stopped = true;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  const emit = (e: Record<string, unknown>) => {
    if (ctx.json) emitNdjson(e);
    else process.stdout.write(`[${e.ts}] ${e.event} ${JSON.stringify(redactNoise(e))}\n`);
  };

  while (!stopped) {
    try {
      const result = await runAgentTick(cfg, opts, emit);
      emit({ ts: new Date().toISOString(), event: "tick_result", ...result });
    } catch (e) {
      const err = e instanceof CliError ? e : new CliError("AGENT_TICK_FAILED", (e as Error).message);
      emit({ ts: new Date().toISOString(), event: "tick_failed", code: err.code, message: err.message });
    }
    if (opts.once) break;
    if (stopped) break;
    await sleep(intervalMs, () => stopped);
  }
}

function redactNoise(e: Record<string, unknown>): Record<string, unknown> {
  const { ts, event, ...rest } = e;
  void ts;
  void event;
  return rest;
}

async function sleep(ms: number, isStopped: () => boolean): Promise<void> {
  // Wake every second so SIGINT exits the loop within a second of arrival.
  const tick = 1000;
  let waited = 0;
  while (waited < ms) {
    if (isStopped()) return;
    const slice = Math.min(tick, ms - waited);
    await new Promise((r) => setTimeout(r, slice));
    waited += slice;
  }
}
