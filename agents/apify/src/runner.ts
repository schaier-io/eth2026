import { readFile } from "node:fs/promises";
import { fetchCandidates, type ApifyCandidate } from "./apify.js";
import { asAgentError, AgentError } from "./errors.js";
import { buildMarketSpec } from "./spec-builder.js";
import {
  hasSeen,
  loadAgentState,
  recordSeen,
  saveAgentState,
  type AgentStateConfig,
} from "./state.js";
import type { Address, CreateMarketResult, Hex, MarketSpec, PublishedClaimDocument } from "./types.js";

export const DEFAULT_INTERVAL_SECONDS = 3600;
export const DEFAULT_DURATION_SECONDS = 3600;
export const DEFAULT_ENDPOINT =
  process.env.TM_APIFY_ENDPOINT ?? "http://localhost:3000/api/apify/generated-markets";

export interface ApifyAgentOptions {
  intervalSeconds?: number;
  durationSeconds?: number;
  jurySize?: number;
  minCommits?: number;
  minRevealedJurors?: number;
  endpoint?: string;
  /** Optional policy override passed to the web generator endpoint. */
  policy?: Record<string, unknown>;
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

export interface ApifyAgentDeps {
  authorizeCreateMarket?: () => Promise<void> | void;
  createMarket: (
    spec: MarketSpec,
    context: { candidate: ApifyCandidate },
  ) => Promise<CreateMarketResult>;
  publishClaimDocument?: (candidate: ApifyCandidate) => Promise<PublishedClaimDocument>;
}

export interface TickResult {
  status: "created" | "skipped_no_candidate" | "skipped_all_seen" | "skipped_dry_run";
  candidateId?: string;
  permalink?: string;
  marketAddress?: Address;
  marketId?: string;
  txHash?: Hex;
  swarmReference?: Hex;
  swarmReferenceIsPlaceholder?: boolean;
  claimDocumentUrl?: string;
  reason?: string;
}

export type AgentEvent = Record<string, unknown>;
export type EmitAgentEvent = (e: AgentEvent) => void;

/** One iteration: fetch candidates, pick the first unseen one, create the market. */
export async function runApifyAgentTick(
  cfg: AgentStateConfig,
  opts: ApifyAgentOptions,
  deps: ApifyAgentDeps,
  emitEvent: EmitAgentEvent,
): Promise<TickResult> {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const items = await loadItemsFile(opts.itemsFile);

  emitEvent({
    ts: new Date().toISOString(),
    event: "tick_start",
    endpoint,
    source: items ? "items_file" : "apify",
    itemsFile: opts.itemsFile,
  });

  const result = await fetchCandidates({ endpoint, items, policy: opts.policy });
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

  await deps.authorizeCreateMarket?.();

  const minStake = opts.minStake ? BigInt(opts.minStake) : BigInt(candidate.stake);
  const publishedClaim = await deps.publishClaimDocument?.(candidate);
  const spec = buildMarketSpec(candidate, {
    durationSeconds: opts.durationSeconds ?? DEFAULT_DURATION_SECONDS,
    minStake,
    jurySize: opts.jurySize,
    minCommits: opts.minCommits,
    minRevealedJurors: opts.minRevealedJurors,
    swarmReference: publishedClaim?.swarmReference,
  });
  const swarmReferenceIsPlaceholder = !publishedClaim;

  emitEvent({
    ts: new Date().toISOString(),
    event: "spec_built",
    candidateId: candidate.id,
    title: candidate.claimRulesDraft.title,
    swarmReference: spec.swarmReference,
    swarmReferenceIsPlaceholder,
    claimDocumentUrl: publishedClaim?.url,
  });

  const created = await deps.createMarket(spec, { candidate });
  const nextState = recordSeen(state, {
    permalink: candidate.sourceUrl,
    candidateId: candidate.id,
    marketAddress: created.marketAddress,
    txHash: created.txHash,
    swarmReference: spec.swarmReference,
    swarmReferenceIsPlaceholder,
    title: candidate.claimRulesDraft.title,
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
    swarmReference: spec.swarmReference,
    swarmReferenceIsPlaceholder,
    claimDocumentUrl: publishedClaim?.url,
  });

  return {
    status: "created",
    candidateId: candidate.id,
    permalink: candidate.sourceUrl,
    marketAddress: created.marketAddress,
    marketId: created.marketId.toString(),
    txHash: created.txHash,
    swarmReference: spec.swarmReference,
    swarmReferenceIsPlaceholder,
    claimDocumentUrl: publishedClaim?.url,
  };
}

export async function runApifyAgentLoop(
  cfg: AgentStateConfig,
  opts: ApifyAgentOptions,
  deps: ApifyAgentDeps,
  emitEvent: EmitAgentEvent,
  isStopped: () => boolean,
): Promise<void> {
  const intervalMs = (opts.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS) * 1000;

  while (!isStopped()) {
    try {
      const result = await runApifyAgentTick(cfg, opts, deps, emitEvent);
      emitEvent({ ts: new Date().toISOString(), event: "tick_result", ...result });
    } catch (e) {
      const err = asAgentError(e);
      emitEvent({
        ts: new Date().toISOString(),
        event: "tick_failed",
        code: err.code,
        message: err.message,
      });
    }
    if (opts.once) break;
    if (isStopped()) break;
    await sleep(intervalMs, isStopped);
  }
}

async function loadItemsFile(itemsFile: string | undefined): Promise<unknown[] | undefined> {
  if (!itemsFile) return undefined;
  const raw = await readFile(itemsFile, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new AgentError(
        "ITEMS_FILE_INVALID",
        `${itemsFile} must be a JSON array of Reddit items`,
      );
    }
    return parsed;
  } catch (e) {
    if (e instanceof AgentError) throw e;
    throw new AgentError(
      "ITEMS_FILE_PARSE",
      `could not parse ${itemsFile}: ${(e as Error).message}`,
    );
  }
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
