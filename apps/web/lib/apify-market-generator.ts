export type GeneratorMode = "demo-fast" | "live-mini" | "public-hourly";

export type MarketDefaults = {
  minStake: string;
  jurySize: number;
  minCommits: number;
  minRevealedJurors: number;
};

export type TimingMode = {
  creationCadence: string;
  votingPeriodSeconds: number;
  juryCommitTimeoutSeconds: number;
  revealPeriodSeconds: number;
  marketDefaults: MarketDefaults;
};

export type GeneratorPolicy = {
  enabled?: boolean;
  mode?: GeneratorMode;
  scheduleCron?: string;
  maxMarketsCreatedPerRun?: number;
  maxOpenGeneratedMarkets?: number;
  requireHumanReviewForCreatedMarkets?: boolean;
  allowedSources?: string[];
  allowedSubreddits?: string[];
  blockedSubreddits?: string[];
  keywords?: string[];
  minRedditScore?: number;
  minCommentCount?: number;
  minAmbiguityScore?: number;
  stake?: string;
  marketDefaults?: Partial<MarketDefaults>;
  apify?: {
    actorId?: string;
    input?: Record<string, unknown>;
    maxItems?: number;
    waitForFinishSeconds?: number;
    pollAttempts?: number;
  };
};

export type NormalizedRedditItem = {
  id: string;
  title: string;
  url: string;
  subreddit: string;
  author: string;
  score: number;
  commentCount: number;
  createdAt: string;
  text: string;
  commentsText: string[];
  raw: Record<string, unknown>;
};

export type CandidateScore = {
  total: number;
  virality: number;
  ambiguity: number;
  publicResolvable: number;
  safety: number;
  reasons: string[];
  rejectedReason?: string;
};

export type ClaimRulesDraft = {
  schema: "truthmarket.claimRules.v1";
  title: string;
  description: string;
  yesMeaning: string;
  noMeaning: string;
  resolutionRules: string;
  sourceUrl: string;
  contextSummary: string;
};

export type GeneratedMarketCandidate = {
  id: string;
  source: "reddit";
  sourceUrl: string;
  subreddit: string;
  score: CandidateScore;
  claimRulesDraft: ClaimRulesDraft;
  contextArtifact: {
    schema: "truthmarket.redditContext.v1";
    source: "apify";
    post: Omit<NormalizedRedditItem, "raw" | "commentsText">;
    commentsText: string[];
    scrapedAt: string;
  };
  timing: TimingMode;
  stake: string;
  requiresHumanReview: boolean;
};

export type ApifyRunSummary = {
  id: string;
  status: string;
  defaultDatasetId: string;
};

export const TIMING_MODES: Record<GeneratorMode, TimingMode> = {
  "demo-fast": {
    creationCadence: "manual or every 15 minutes",
    votingPeriodSeconds: 5 * 60,
    juryCommitTimeoutSeconds: 2 * 60,
    revealPeriodSeconds: 5 * 60,
    marketDefaults: {
      minStake: "100000000000000000",
      jurySize: 1,
      minCommits: 7,
      minRevealedJurors: 1,
    },
  },
  "live-mini": {
    creationCadence: "every 60 minutes",
    votingPeriodSeconds: 20 * 60,
    juryCommitTimeoutSeconds: 5 * 60,
    revealPeriodSeconds: 25 * 60,
    marketDefaults: {
      minStake: "100000000000000000",
      jurySize: 1,
      minCommits: 7,
      minRevealedJurors: 1,
    },
  },
  "public-hourly": {
    creationCadence: "every 3 hours",
    votingPeriodSeconds: 60 * 60,
    juryCommitTimeoutSeconds: 10 * 60,
    revealPeriodSeconds: 50 * 60,
    marketDefaults: {
      minStake: "100000000000000000",
      jurySize: 3,
      minCommits: 20,
      minRevealedJurors: 2,
    },
  },
};

export const DEFAULT_GENERATOR_POLICY: Required<Omit<GeneratorPolicy, "apify" | "marketDefaults">> & {
  marketDefaults: MarketDefaults;
} = {
  enabled: true,
  mode: "live-mini",
  scheduleCron: "0 * * * *",
  maxMarketsCreatedPerRun: 1,
  maxOpenGeneratedMarkets: 3,
  requireHumanReviewForCreatedMarkets: false,
  allowedSources: ["reddit"],
  allowedSubreddits: ["AskReddit", "NoStupidQuestions", "OutOfTheLoop", "technology"],
  blockedSubreddits: ["medical", "legaladvice"],
  keywords: ["real", "fake", "scam", "true", "AI", "proof", "rumor"],
  minRedditScore: 100,
  minCommentCount: 25,
  minAmbiguityScore: 0.65,
  stake: "100000000000000000",
  marketDefaults: TIMING_MODES["live-mini"].marketDefaults,
};

const AMBIGUITY_TERMS = [
  "real",
  "fake",
  "true",
  "false",
  "scam",
  "legit",
  "authentic",
  "proof",
  "rumor",
  "hoax",
  "ai",
  "bot",
  "credible",
  "confirmed",
  "is this",
  "did this",
];

const REJECT_TERMS = [
  "address",
  "phone number",
  "ssn",
  "social security",
  "medical diagnosis",
  "legal advice",
  "suicide",
  "dox",
  "doxx",
  "revenge",
  "hack into",
  "credit card",
];

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function trimText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function normalizeSubreddit(value: string) {
  return value.replace(/^r\//i, "").trim();
}

function collectCommentText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((comment) => {
      const item = asRecord(comment);
      return firstString(item.text, item.body, item.comment, item.markdown, item.content);
    })
    .filter(Boolean)
    .slice(0, 25);
}

function includesAny(haystack: string, needles: string[]) {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function policyWithDefaults(policy: GeneratorPolicy = {}) {
  const mode = policy.mode ?? DEFAULT_GENERATOR_POLICY.mode;
  const timing = TIMING_MODES[mode] ?? TIMING_MODES["live-mini"];
  return {
    ...DEFAULT_GENERATOR_POLICY,
    ...policy,
    mode,
    allowedSources: policy.allowedSources ?? DEFAULT_GENERATOR_POLICY.allowedSources,
    allowedSubreddits: policy.allowedSubreddits ?? DEFAULT_GENERATOR_POLICY.allowedSubreddits,
    blockedSubreddits: policy.blockedSubreddits ?? DEFAULT_GENERATOR_POLICY.blockedSubreddits,
    keywords: policy.keywords ?? DEFAULT_GENERATOR_POLICY.keywords,
    marketDefaults: {
      ...timing.marketDefaults,
      ...policy.marketDefaults,
    },
  };
}

export function timingForPolicy(policy: GeneratorPolicy = {}): TimingMode {
  const withDefaults = policyWithDefaults(policy);
  const timing = TIMING_MODES[withDefaults.mode] ?? TIMING_MODES["live-mini"];
  return {
    ...timing,
    marketDefaults: {
      ...timing.marketDefaults,
      ...withDefaults.marketDefaults,
    },
  };
}

export function buildApifyInput(policy: GeneratorPolicy = {}) {
  const withDefaults = policyWithDefaults(policy);
  if (policy.apify?.input) return policy.apify.input;

  return {
    urls: withDefaults.allowedSubreddits.map((subreddit) => `https://www.reddit.com/r/${normalizeSubreddit(subreddit)}/hot/`),
    sort: "hot",
    maxPostsPerSource: policy.apify?.maxItems ?? 20,
    includeComments: true,
    maxCommentsPerPost: 50,
    commentDepth: 2,
    filterKeywords: withDefaults.keywords,
  };
}

export function normalizeRedditItem(value: unknown, index: number): NormalizedRedditItem {
  const item = asRecord(value);
  const commentsText = collectCommentText(item.comments ?? item.commentsData ?? item.replies);
  const title = firstString(item.title, item.postTitle, item.question, item.name, item.text, item.body);
  const url = firstString(item.url, item.postUrl, item.permalink, item.link, item.sourceUrl);
  const subreddit = normalizeSubreddit(firstString(item.subreddit, item.subredditName, item.communityName));
  const score = firstNumber(item.score, item.upvotes, item.upVotes, item.ups, item.points);
  const commentCount = firstNumber(
    item.numComments,
    item.commentCount,
    item.commentsCount,
    item.numberOfComments,
    commentsText.length,
  );
  const id = firstString(item.id, item.postId, item.fullName, url, `reddit-item-${index}`);

  return {
    id,
    title: trimText(title || "Untitled Reddit discussion", 180),
    url,
    subreddit,
    author: firstString(item.author, item.username, item.user),
    score,
    commentCount,
    createdAt: firstString(item.createdAt, item.createdUtc, item.date, item.timestamp),
    text: trimText(firstString(item.selftext, item.body, item.text, item.description), 2000),
    commentsText,
    raw: item,
  };
}

export function scoreRedditItem(item: NormalizedRedditItem, policy: GeneratorPolicy = {}): CandidateScore {
  const withDefaults = policyWithDefaults(policy);
  const content = `${item.title}\n${item.text}\n${item.commentsText.join("\n")}`;
  const reasons: string[] = [];

  if (!withDefaults.allowedSources.includes("reddit")) {
    return { total: 0, virality: 0, ambiguity: 0, publicResolvable: 0, safety: 0, reasons, rejectedReason: "source_not_allowed" };
  }

  if (item.subreddit && withDefaults.blockedSubreddits.map((s) => s.toLowerCase()).includes(item.subreddit.toLowerCase())) {
    return { total: 0, virality: 0, ambiguity: 0, publicResolvable: 0, safety: 0, reasons, rejectedReason: "subreddit_blocked" };
  }

  const allowed = withDefaults.allowedSubreddits;
  if (allowed.length > 0 && item.subreddit && !allowed.map((s) => s.toLowerCase()).includes(item.subreddit.toLowerCase())) {
    return { total: 0, virality: 0, ambiguity: 0, publicResolvable: 0, safety: 0, reasons, rejectedReason: "subreddit_not_allowed" };
  }

  if (includesAny(content, REJECT_TERMS)) {
    return { total: 0, virality: 0, ambiguity: 0, publicResolvable: 0, safety: 0, reasons, rejectedReason: "safety_rejected" };
  }

  const termHits = AMBIGUITY_TERMS.filter((term) => content.toLowerCase().includes(term)).length;
  const keywordHits = withDefaults.keywords.filter((term) => content.toLowerCase().includes(term.toLowerCase())).length;
  const questionBoost = item.title.includes("?") ? 0.18 : 0;
  const disagreementBoost = includesAny(content, ["i disagree", "not true", "source?", "proof?", "fake", "real"]) ? 0.2 : 0;
  const ambiguity = clamp(termHits / 8 + keywordHits / 10 + questionBoost + disagreementBoost);

  const virality = clamp(Math.log10(Math.max(1, item.score + 1)) / 4 + Math.log10(Math.max(1, item.commentCount + 1)) / 4);
  const publicResolvable = item.url ? 1 : 0.55;
  const safety = 1;
  const total = clamp(0.42 * ambiguity + 0.33 * virality + 0.2 * publicResolvable + 0.05 * safety);

  if (item.score >= withDefaults.minRedditScore) reasons.push("reddit_score_threshold_met");
  if (item.commentCount >= withDefaults.minCommentCount) reasons.push("comment_threshold_met");
  if (ambiguity >= withDefaults.minAmbiguityScore) reasons.push("ambiguity_threshold_met");
  if (questionBoost > 0) reasons.push("question_title");
  if (disagreementBoost > 0) reasons.push("comment_disagreement_signals");

  if (item.score < withDefaults.minRedditScore) return { total, virality, ambiguity, publicResolvable, safety, reasons, rejectedReason: "score_too_low" };
  if (item.commentCount < withDefaults.minCommentCount) return { total, virality, ambiguity, publicResolvable, safety, reasons, rejectedReason: "comments_too_low" };
  if (ambiguity < withDefaults.minAmbiguityScore) return { total, virality, ambiguity, publicResolvable, safety, reasons, rejectedReason: "ambiguity_too_low" };

  return { total, virality, ambiguity, publicResolvable, safety, reasons };
}

export function buildClaimRulesDraft(item: NormalizedRedditItem): ClaimRulesDraft {
  const titleSubject = trimText(item.title.replace(/[?.!]+$/g, ""), 72);
  const title = trimText(`Do selected jurors believe this Reddit question is credible: ${titleSubject}?`, 120);
  const source = item.url || "the linked Reddit context";

  return {
    schema: "truthmarket.claimRules.v1",
    title,
    description: "A YES/NO belief-resolution market generated from public Reddit context. The market resolves by selected staked juror belief under these rules.",
    yesMeaning: "YES means selected jurors believe the Reddit question or claim is likely credible under the linked public signals.",
    noMeaning: "NO means selected jurors do not believe the Reddit question or claim is likely credible under the linked public signals.",
    resolutionRules: `Jurors may use only public context available from ${source}, public links included there, and the separate public context artifact. Apify collected context but does not decide the outcome.`,
    sourceUrl: source,
    contextSummary: trimText(item.text || item.title, 500),
  };
}

export function generateMarketCandidates(items: unknown[], policy: GeneratorPolicy = {}) {
  const withDefaults = policyWithDefaults(policy);
  const timing = timingForPolicy(withDefaults);
  const now = new Date().toISOString();
  const normalized = items.map(normalizeRedditItem);
  const rejected: Array<{ id: string; title: string; reason: string; score: CandidateScore }> = [];
  const candidates: GeneratedMarketCandidate[] = [];

  for (const item of normalized) {
    const score = scoreRedditItem(item, withDefaults);
    if (score.rejectedReason) {
      rejected.push({ id: item.id, title: item.title, reason: score.rejectedReason, score });
      continue;
    }

    candidates.push({
      id: item.id,
      source: "reddit",
      sourceUrl: item.url,
      subreddit: item.subreddit,
      score,
      claimRulesDraft: buildClaimRulesDraft(item),
      contextArtifact: {
        schema: "truthmarket.redditContext.v1",
        source: "apify",
        post: {
          id: item.id,
          title: item.title,
          url: item.url,
          subreddit: item.subreddit,
          author: item.author,
          score: item.score,
          commentCount: item.commentCount,
          createdAt: item.createdAt,
          text: item.text,
        },
        commentsText: item.commentsText,
        scrapedAt: now,
      },
      timing,
      stake: withDefaults.stake,
      requiresHumanReview: withDefaults.requireHumanReviewForCreatedMarkets,
    });
  }

  candidates.sort((a, b) => b.score.total - a.score.total);

  return {
    schema: "truthmarket.generatedRedditMarkets.v1",
    generatedAt: now,
    mode: withDefaults.mode,
    timing,
    createdMarketLimit: withDefaults.maxMarketsCreatedPerRun,
    candidates: candidates.slice(0, withDefaults.maxMarketsCreatedPerRun),
    rejected,
  };
}

async function readApifyJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message = asRecord(body).message || asRecord(asRecord(body).error).message || response.statusText;
    throw new Error(`Apify request failed (${response.status}): ${String(message)}`);
  }

  return body as T;
}

function unwrapApifyData<T>(value: unknown): T {
  const body = asRecord(value);
  return (body.data ?? body) as T;
}

export async function runApifyRedditScrape(options: {
  token: string;
  actorId: string;
  input: Record<string, unknown>;
  waitForFinishSeconds?: number;
  pollAttempts?: number;
}) {
  const actorId = encodeURIComponent(options.actorId);
  const waitForFinishSeconds = options.waitForFinishSeconds ?? 30;
  const runResponse = await readApifyJson<unknown>(
    `https://api.apify.com/v2/acts/${actorId}/runs?waitForFinish=${waitForFinishSeconds}`,
    options.token,
    {
      method: "POST",
      body: JSON.stringify(options.input),
    },
  );

  let run = unwrapApifyData<ApifyRunSummary>(runResponse);
  const pollAttempts = options.pollAttempts ?? 6;

  for (let attempt = 0; attempt < pollAttempts && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); attempt++) {
    const pollResponse = await readApifyJson<unknown>(
      `https://api.apify.com/v2/actor-runs/${encodeURIComponent(run.id)}?waitForFinish=${waitForFinishSeconds}`,
      options.token,
    );
    run = unwrapApifyData<ApifyRunSummary>(pollResponse);
  }

  if (run.status !== "SUCCEEDED") {
    throw new Error(`Apify run did not succeed: ${run.status}`);
  }

  const items = await fetchApifyDatasetItems(options.token, run.defaultDatasetId);
  return { run, items };
}

export async function fetchApifyDatasetItems(token: string, datasetId: string) {
  return readApifyJson<unknown[]>(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?format=json&clean=1`,
    token,
  );
}
