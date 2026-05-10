import "server-only";

import type { GeneratedMarketCandidate } from "../apify-market-generator";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.1-chat";

export type CuratedCandidate = GeneratedMarketCandidate & {
  curation?: {
    rationale: string;
    confidence: number;
    riskNotes: string[];
  };
};

export interface CurationResult {
  usedLlm: boolean;
  model?: string;
  candidates: CuratedCandidate[];
  error?: string;
}

interface CuratorChoice {
  id: string;
  title?: string;
  yesMeaning?: string;
  noMeaning?: string;
  resolutionRules?: string;
  contextSummary?: string;
  rationale?: string;
  confidence?: number;
  riskNotes?: string[];
}

interface CuratorResponse {
  choices?: CuratorChoice[];
}

export async function curateWithOpenRouter(
  candidates: GeneratedMarketCandidate[],
  options: { maxOptions?: number } = {},
): Promise<CurationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  const maxOptions = options.maxOptions ?? 5;

  if (!apiKey || candidates.length === 0) {
    return {
      usedLlm: false,
      model,
      candidates: candidates.slice(0, maxOptions),
      error: !apiKey ? "OPENROUTER_API_KEY is not configured." : undefined,
    };
  }

  try {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://truthmarket.local",
        "X-Title": "TruthMarket",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You curate candidate markets for TruthMarket, a random-jury belief-resolution protocol. You do not decide truth or outcomes. Pick markets where selected jurors can reasonably resolve YES/NO from public context. Reject unsafe, private-evidence, medical/legal, harassment, doxxing, and vague opinion markets. Return only valid JSON.",
          },
          {
            role: "user",
            content: JSON.stringify({
              instruction:
                "Rank the best 3 to 5 market candidates. Use only candidate ids provided. Improve the market title and YES/NO rules, but do not invent facts. Return { choices: [...] } where each choice has id, title, yesMeaning, noMeaning, resolutionRules, contextSummary, rationale, confidence, riskNotes.",
              candidates: candidates.slice(0, 8).map((candidate) => ({
                id: candidate.id,
                subreddit: candidate.subreddit,
                sourceUrl: candidate.sourceUrl,
                score: candidate.score,
                title: candidate.contextArtifact.post.title,
                text: candidate.contextArtifact.post.text,
                commentsText: candidate.contextArtifact.commentsText.slice(0, 8),
                draft: candidate.claimRulesDraft,
              })),
            }),
          },
        ],
      }),
    });

    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(readOpenRouterError(body) ?? `OpenRouter request failed (${response.status}).`);
    }

    const content = readAssistantContent(body);
    if (!content) throw new Error("OpenRouter response did not include message content.");

    const parsed = JSON.parse(content) as CuratorResponse;
    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const curated: CuratedCandidate[] = [];

    for (const choice of choices) {
      const candidate = candidateById.get(String(choice.id));
      if (!candidate) continue;
      curated.push(applyChoice(candidate, choice));
      if (curated.length >= maxOptions) break;
    }

    return {
      usedLlm: true,
      model,
      candidates: curated.length > 0 ? curated : candidates.slice(0, maxOptions),
      error: curated.length === 0 ? "OpenRouter returned no matching candidate ids." : undefined,
    };
  } catch (err) {
    return {
      usedLlm: false,
      model,
      candidates: candidates.slice(0, maxOptions),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function applyChoice(candidate: GeneratedMarketCandidate, choice: CuratorChoice): CuratedCandidate {
  const draft = candidate.claimRulesDraft;
  return {
    ...candidate,
    claimRulesDraft: {
      ...draft,
      title: clean(choice.title, draft.title, 120),
      yesMeaning: clean(choice.yesMeaning, draft.yesMeaning, 500),
      noMeaning: clean(choice.noMeaning, draft.noMeaning, 500),
      resolutionRules: clean(choice.resolutionRules, draft.resolutionRules, 900),
      contextSummary: clean(choice.contextSummary, draft.contextSummary, 700),
    },
    curation: {
      rationale: clean(choice.rationale, "Strong public-context market candidate.", 500),
      confidence: clampConfidence(choice.confidence),
      riskNotes: Array.isArray(choice.riskNotes)
        ? choice.riskNotes.map((note) => clean(note, "", 160)).filter(Boolean).slice(0, 4)
        : [],
    },
  };
}

function clean(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}...` : normalized;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function readAssistantContent(body: unknown): string | null {
  const choices = asRecord(body).choices;
  const choice = asRecord(Array.isArray(choices) ? choices[0] : undefined);
  const content = asRecord(choice.message).content;
  return typeof content === "string" ? content : null;
}

function readOpenRouterError(body: unknown): string | null {
  const error = asRecord(asRecord(body).error);
  const message = error.message;
  return typeof message === "string" ? message : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
