import { NextResponse } from "next/server";
import {
  buildApifyInput,
  generateMarketCandidates,
  runApifyRedditScrape,
  type GeneratorPolicy,
} from "../../../../lib/apify-market-generator";

export const runtime = "nodejs";

type GenerateRequest = {
  policy?: GeneratorPolicy;
  items?: unknown[];
  actorId?: string;
  apifyInput?: Record<string, unknown>;
  waitForFinishSeconds?: number;
  pollAttempts?: number;
};

function errorResponse(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "apify-generated-markets",
    action: "POST JSON to draft Apify-powered Reddit belief markets",
    requiredEnvForLiveApify: ["APIFY_TOKEN", "APIFY_REDDIT_ACTOR_ID"],
    accepts: {
      policy: "Generator policy overrides",
      items: "Optional raw Reddit items for dry-run generation without Apify",
      actorId: "Optional Apify Actor override",
      apifyInput: "Optional Apify Actor input override",
    },
  });
}

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return errorResponse(400, "invalid_json");
  }

  const policy = body.policy ?? {};
  const requestItems = Array.isArray(body.items) ? body.items : undefined;

  if (requestItems) {
    const generated = generateMarketCandidates(requestItems, policy);
    return NextResponse.json({
      ok: true,
      action: "draft_from_supplied_reddit_items",
      source: "request_items",
      createdMarketCount: generated.candidates.length,
      skippedReason: generated.candidates.length === 0 ? "no_candidate_passed_policy" : undefined,
      ...generated,
    });
  }

  const token = process.env.APIFY_TOKEN;
  const actorId = body.actorId ?? policy.apify?.actorId ?? process.env.APIFY_REDDIT_ACTOR_ID;

  if (!token) {
    return errorResponse(400, "missing_apify_token", {
      requiredEnv: "APIFY_TOKEN",
      hint: "Set APIFY_TOKEN or pass dry-run Reddit items in the request body.",
    });
  }

  if (!actorId) {
    return errorResponse(400, "missing_apify_actor", {
      requiredEnv: "APIFY_REDDIT_ACTOR_ID",
      hint: "Set APIFY_REDDIT_ACTOR_ID or pass actorId in the request body.",
    });
  }

  try {
    const input = body.apifyInput ?? buildApifyInput(policy);
    const { run, items } = await runApifyRedditScrape({
      token,
      actorId,
      input,
      waitForFinishSeconds: body.waitForFinishSeconds ?? policy.apify?.waitForFinishSeconds,
      pollAttempts: body.pollAttempts ?? policy.apify?.pollAttempts,
    });
    const generated = generateMarketCandidates(items, policy);

    return NextResponse.json({
      ok: true,
      action: "draft_from_apify_reddit",
      source: "apify",
      apifyRunId: run.id,
      datasetId: run.defaultDatasetId,
      runStatus: run.status,
      input,
      itemCount: items.length,
      createdMarketCount: generated.candidates.length,
      skippedReason: generated.candidates.length === 0 ? "no_candidate_passed_policy" : undefined,
      ...generated,
    });
  } catch (error) {
    return errorResponse(502, "apify_generation_failed", {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
