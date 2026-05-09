import { CliError } from "../errors.js";

/**
 * Shape of one entry in the `candidates` array returned by
 * `POST /api/apify/generated-markets`. Mirrors `GeneratedMarketCandidate`
 * in `apps/web/lib/apify-market-generator.ts`; kept structural here to avoid
 * a cross-app type import.
 */
export interface ApifyCandidate {
  id: string;
  source: "reddit";
  sourceUrl: string;
  subreddit: string;
  score: { virality: number; ambiguity: number; resolvability: number; safety: number; total: number };
  claimRulesDraft: {
    schema: "truthmarket.claimRules.v1";
    title: string;
    description: string;
    yesMeaning: string;
    noMeaning: string;
    resolutionRules: string;
    sourceUrl: string;
    contextSummary: string;
  };
  contextArtifact: unknown;
  timing: { mode: string; votingMinutes: number; revealMinutes: number; jurySize: number };
  stake: string;
  requiresHumanReview: boolean;
}

export interface ApifyGenerateResult {
  ok: true;
  source: "request_items" | "apify";
  candidates: ApifyCandidate[];
  rejected?: unknown[];
  apifyRunId?: string;
}

export interface FetchCandidatesOpts {
  endpoint: string;
  policy?: Record<string, unknown>;
  items?: unknown[];
  signal?: AbortSignal;
}

/**
 * POST the web app's apify-generated-markets endpoint and return the parsed
 * candidates array. Throws CliError on transport, status, or shape errors.
 */
export async function fetchCandidates(opts: FetchCandidatesOpts): Promise<ApifyGenerateResult> {
  const body: Record<string, unknown> = {};
  if (opts.policy) body.policy = opts.policy;
  if (opts.items) body.items = opts.items;

  let res: Response;
  try {
    res = await fetch(opts.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    throw new CliError(
      "APIFY_FETCH_FAILED",
      `could not reach apify endpoint at ${opts.endpoint}: ${(e as Error).message}`,
    );
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new CliError(
      "APIFY_BAD_RESPONSE",
      `apify endpoint returned non-JSON (status ${res.status})`,
    );
  }

  if (!res.ok || (payload as { ok?: boolean }).ok !== true) {
    const errMsg =
      (payload as { error?: string }).error ?? `status ${res.status} ${res.statusText}`;
    throw new CliError("APIFY_GENERATION_FAILED", `apify endpoint error: ${errMsg}`);
  }

  const result = payload as ApifyGenerateResult;
  if (!Array.isArray(result.candidates)) {
    throw new CliError("APIFY_BAD_RESPONSE", "apify response missing 'candidates' array");
  }
  return result;
}
