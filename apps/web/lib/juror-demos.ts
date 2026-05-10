export type JurorDemoCode = {
  title: string;
  source: string;
  line: number;
  language: string;
  snippet: string;
};

export type JurorPackageLink = {
  name: string;
  url: string;
  install: string;
  description: string;
};

export type JurorScriptLink = {
  label: string;
  source: string;
  line: number;
  command: string;
  description: string;
};

export type JurorDemoCallToAction = {
  headline: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

export type JurorDemoCriterion = {
  label: string;
  detail: string;
};

export type JurorDemo = {
  slug: string;
  title: string;
  shortTitle: string;
  track: string;
  sponsor: string;
  status: string;
  summary: string;
  /** One-line lede for the "why this fits" presentation slide. */
  fitTagline: string;
  /** Long-form fit narrative used in judging tab and as slide 1 lede. */
  fit: string;
  /** Short, punchy bullets used as the presentation slide-1 takeaways. */
  pitchHighlights: string[];
  implemented: string[];
  demoFlow: string[];
  criteria: JurorDemoCriterion[];
  code: JurorDemoCode[];
  cta: JurorDemoCallToAction;
  limits?: string[];
};

export const jurorDemos: JurorDemo[] = [
  {
    slug: "future-society",
    title: "Future Society — Markets for contested beliefs",
    shortTitle: "Future Society",
    track: "Future Society — Social impact",
    sponsor: "Ethereum public goods",
    status: "Random-jury belief resolution shipped",
    summary:
      "AI claims, DAO accountability, public promises — TruthMarket settles the messy outcomes a single moderator should not own. Locked rules, private commits, random jurors, real stake.",
    fitTagline: "A market layer for contested beliefs.",
    fit:
      "Polymarket shows what people believe. TruthMarket gives communities a process for resolving disputed claims under posted rules. Models, agents, DAOs, and creators are making claims at a scale no single resolver can audit. TruthMarket turns those questions into markets where the crowd commits, a random jury reveals, and risked stake makes accountability real.",
    pitchHighlights: [
      "Stake shows conviction. Random jurors decide.",
      "AI claims · DAO promises · creator milestones · public bets",
      "Locked rules → private commit → random jury → reveal",
      "Privacy-respecting, transparent, no central moderator",
    ],
    implemented: [
      "Immutable claim/rules document published to Swarm before any stake enters the market.",
      "Classic commit-reveal keeps every vote hidden during the voting phase — operator cannot reveal for users.",
      "SpaceComputer cTRNG draws the resolving jury only after commits are locked.",
      "One juror = one count-based vote, independent of stake size.",
      "UI and CLI cover Swarm verification, jury status, reveal, settlement, and pull-pattern payouts.",
    ],
    demoFlow: [
      "Lock claim & rules on Swarm",
      "Voters stake and commit privately",
      "Voting closes, cTRNG draws jury",
      "Jurors reveal under locked rules",
      "Winners pull stake plus slashed pool",
    ],
    criteria: [
      {
        label: "Fairness",
        detail:
          "Jurors are drawn after commits close, so participants cannot know the resolving jury while votes are being committed.",
      },
      {
        label: "Privacy-respecting",
        detail:
          "Votes are committed as hashes and revealed only by the voter. The operator cannot reveal votes for users.",
      },
      {
        label: "Transparent governance",
        detail:
          "Claim rules, selected jurors, randomness evidence, reveal counts, slashing, and withdrawals are all on-chain and inspectable.",
      },
      {
        label: "Inclusive participation",
        detail:
          "Stake controls exposure and reward weight, but voting power on the jury is one juror equals one vote.",
      },
      {
        label: "Ethical impact",
        detail:
          "TruthMarket reframes resolution as community process, not centralized authority — useful for AI accountability, DAO promises, and disputed public claims.",
      },
    ],
    code: [
      {
        title: "Private vote commitment",
        source: "contracts/src/TruthMarket.sol",
        line: 1166,
        language: "solidity",
        snippet: `function _commitHash(uint8 vote, bytes32 nonce, address voter)
    internal
    view
    returns (bytes32)
{
    return keccak256(
        abi.encode(vote, nonce, voter, block.chainid, address(this))
    );
}`,
      },
      {
        title: "Random jury draw",
        source: "contracts/src/TruthMarket.sol",
        line: 1023,
        language: "solidity",
        snippet: `function _drawJury(uint256 seed) internal {
    uint256 n = _activeCommitters.length;
    uint256 k = _juryDrawSize(n);
    if (k == 0) return;

    uint256[] memory selected = new uint256[](k);
    uint256 selectedLen;
    for (uint256 j = n - k; j < n; j++) {
        uint256 candidate = _uniformRandom(seed, j, j + 1);
        bool seen;
        for (uint256 s = 0; s < selectedLen; s++) {
            if (selected[s] == candidate) seen = true;
        }
        uint256 chosen = seen ? j : candidate;
        selected[selectedLen++] = chosen;
        address juror = _activeCommitters[chosen];
        _jury.push(juror);
        _isJuror[juror] = true;
    }
}`,
      },
    ],
    cta: {
      headline: "Polymarket shows belief. TruthMarket resolves it with random juries.",
      body: "Walk a juror from a disputed social claim to locked rules, private commits, jury draw, and settlement.",
      primaryLabel: "Open a live market",
      primaryHref: "/",
      secondaryLabel: "Read the protocol context",
      secondaryHref: "https://github.com/schaier-io/eth2026/blob/main/CONTEXT.md",
    },
  },
  {
    slug: "swarm-verified-fetch",
    title: "Bounty 1: Verified Fetch — Trust No Gateway",
    shortTitle: "Swarm Verified Fetch",
    track: "Swarm Bounty 1",
    sponsor: "Swarm",
    status: "Package shipped on npm + wired into TruthMarket",
    summary:
      "@truth-market/swarm-verified-fetch — pull Swarm data through any gateway and prove it locally. The same trust check Bee does internally, packaged for any TS/JS app.",
    fitTagline: "Download from anywhere. Verify locally. Trust the hash.",
    fit:
      "Running a full Bee node is not realistic for browsers, mobile apps, or lightweight agents — and trusting random gateways is not good enough when bytes control real markets. TruthMarket stores claim/rules on Swarm, and Verified Fetch proves the rules a user sees are the rules the contract referenced — before the stake button enables.",
    pitchHighlights: [
      "Download from anywhere, verify locally, trust the hash",
      "CAC + BMT, multi-chunk trees, manifests, SOC/feed updates",
      "Browser + Node, fetch-shaped API, no wallets to read",
      "TruthMarket: gateway can't quietly change the rules",
    ],
    implemented: [
      "Fetches immutable Swarm data through gateway lists with retries, timeouts, racing, and failover.",
      "Verifies CAC chunks and reconstructs multi-chunk byte trees the same way Bee would.",
      "Resolves verified Mantaray manifest paths from already-verified manifest bytes.",
      "Verifies SOC/feed updates: owner, topic, sequence index, and target reference.",
      "Stream mode for large files, progress callbacks, abort signals, and typed verification proofs.",
      "Manual verification helpers for app-side checks beyond the high-level API.",
      "Tests cover corrupted chunks, bad manifests, feed tampering, and MITM-style gateway attacks.",
    ],
    demoFlow: [
      "Open a market with Swarm-stored rules",
      "Fetch claim bytes via gateway",
      "Recompute Swarm hash client-side",
      "Reveal rules · enable stake on match",
    ],
    criteria: [
      {
        label: "Correctness",
        detail:
          "CAC/BMT chunk verification, multi-chunk tree reconstruction, manifests, and SOC/feed updates are all implemented and unit-tested.",
      },
      {
        label: "API design",
        detail:
          "verifiedFetch(input, options) mirrors the standard Fetch API. Response modes, typed metadata, and verification proofs are first-class returns.",
      },
      {
        label: "Browser support",
        detail:
          "TypeScript, fetch-based, no Node-only assumptions in the core path. Works in dApp frontends without polyfills.",
      },
      {
        label: "Resilience",
        detail:
          "Gateway racing/failover, abort signals, timeouts, and verification errors are explicit outcomes — not silent fallbacks.",
      },
      {
        label: "Tests",
        detail:
          "Unit and e2e-style tests cover corrupt bytes, gateway failures, manifest paths, feed verification, and tampering attempts.",
      },
    ],
    code: [
      {
        title: "Fetch-like public API",
        source: "packages/swarm-verified-fetch/src/fetch.ts",
        line: 476,
        language: "ts",
        snippet: `export async function verifiedFetch(
  input: VerifiedFetchInput,
  options: VerifiedFetchOptions = {}
): Promise<VerifiedSwarmResponse> {
  if (isFeedUrl(input)) {
    return verifiedFetchFeed(input, options);
  }

  return verifiedFetchInternal(input, options);
}`,
      },
      {
        title: "SOC / feed update verification",
        source: "packages/swarm-verified-fetch/src/soc.ts",
        line: 177,
        language: "ts",
        snippet: `export function verifyFeedUpdate(
  reference: string,
  bytes: Uint8Array,
  options: VerifyFeedUpdateOptions
): FeedUpdateVerificationResult {
  const ownerBytes = normalizeFixedBytes(options.owner, 20, "feed owner");
  const topicBytes = normalizeFeedTopic(options.topic);
  const indexBytes = feedIndexBytes(options.index);
  const expectedReference = feedUpdateReference(ownerBytes, topicBytes, indexBytes);

  if (normalizeReference(reference) !== expectedReference) {
    throw new SwarmVerificationError("Feed update reference mismatch.");
  }

  return verifySingleOwnerChunk(expectedReference, bytes, {
    expectedIdentifier: feedIdentifier(topicBytes, indexBytes),
    expectedOwner: ownerBytes,
  });
}`,
      },
    ],
    cta: {
      headline: "Prove the rules users see are the rules they stake on.",
      body: "Install the package, point it at a market's claim reference, watch it fail loud on tampered bytes.",
      primaryLabel: "Open npm package",
      primaryHref: "https://www.npmjs.com/package/@truth-market/swarm-verified-fetch",
      secondaryLabel: "Read package docs",
      secondaryHref:
        "https://github.com/schaier-io/eth2026/tree/main/packages/swarm-verified-fetch#readme",
    },
  },
  {
    slug: "swarm-kv",
    title: "Bounty 2: A Simple Key-Value Store on Swarm",
    shortTitle: "Swarm KV",
    track: "Swarm Bounty 2",
    sponsor: "Swarm",
    status: "Package shipped on npm + wired into TruthMarket",
    summary:
      "@truth-market/swarm-kv — a familiar get / put / list / delete on Swarm. No feeds, topics, SOCs, or manifests in the developer's face.",
    fitTagline: "Decentralized storage that feels like localStorage.",
    fit:
      "Most developers do not want to think about feeds, topics, manifests, SOCs, and postage just to save app data. Swarm KV wraps those primitives into a familiar interface so dApps can store profiles, indexes, agent memory, and read models without falling back to a centralized DB. TruthMarket uses it for discovery indexes and read models around the protocol — never for rules, outcomes, votes, or payouts.",
    pitchHighlights: [
      "get / put / list / delete · like localStorage, persistent",
      "Feeds, topics, SOCs hidden behind one promise-first API",
      "Verified reads via @truth-market/swarm-verified-fetch",
      "Strings, JSON, bytes, large values, optional encryption",
    ],
    implemented: [
      "Supports strings, JSON, bytes, ArrayBuffer, and Blob-like values.",
      "Provides put, get, getJson, getString, getBytes, list, delete, has, and async entries iteration.",
      "Verifies every read through @truth-market/swarm-verified-fetch before decoding values.",
      "Maintains an immutable index document with revisions, tombstones, topics, and previous references.",
      "Postage batch reuse, large payload limits, optional encrypted private mode, and feed pointers.",
      "Serialized writes with an ifIndexReference optimistic guard for safer concurrent updates.",
      "Tests cover fake Bee, live Bee, public testnet, deletion, concurrency, and large multi-chunk values.",
    ],
    demoFlow: [
      "put a creator's market index",
      "Publish updated immutable index reference",
      "get · async iterate via verified Swarm bytes",
      "Delete with indexed tombstones",
    ],
    criteria: [
      {
        label: "Developer experience",
        detail:
          "App-facing surface is get, put, list, delete, entries — not feeds, topics, SOCs, or manifests. Usable in 5 minutes.",
      },
      {
        label: "API design",
        detail:
          "Promise-first, typed value modes (string/json/bytes), and async iteration mirror the patterns devs already know.",
      },
      {
        label: "Completeness",
        detail:
          "Listing, deletion, tombstones, iteration, JSON, strings, bytes, and an optional private/encrypted mode are all included.",
      },
      {
        label: "Edge cases",
        detail:
          "Missing keys return null. Payload sizes are checked. Writes are serialized with an ifIndexReference optimistic guard for concurrent updates.",
      },
      {
        label: "Examples",
        detail:
          "README and tests show working local Bee, fake Bee, and public-testnet usage paths end to end.",
      },
    ],
    code: [
      {
        title: "Application-facing API",
        source: "packages/swarm-kv/src/index.ts",
        line: 568,
        language: "ts",
        snippet: `await store.put("settings", { theme: "dark" });
const settings = await store.getJson("settings");

for await (const entry of store.entries()) {
  console.log(entry.key, entry.reference);
}`,
      },
      {
        title: "Verified read path",
        source: "packages/swarm-kv/src/index.ts",
        line: 844,
        language: "ts",
        snippet: `const verified = await this.fetchVerifiedBytes(reference, context);
const encrypted = entry?.encrypted ?? isEncryptedPayload(verified.bytes);
const plaintext = encrypted
  ? await this.decryptBytes(key, verified.bytes, context)
  : verified.bytes;
const value = decodeValue<TValue>(plaintext, kind);

return {
  key,
  reference,
  value,
  verification: {
    verified: verified.verification.verified,
    algorithm: "swarm-cac-tree",
    chunksVerified: verified.chunksVerified
  }
};`,
      },
    ],
    cta: {
      headline: "Decentralized storage that feels like localStorage.",
      body: "Lead with get/put/list/delete, then show that every read is verified Swarm under the hood.",
      primaryLabel: "Open npm package",
      primaryHref: "https://www.npmjs.com/package/@truth-market/swarm-kv",
      secondaryLabel: "Read package docs",
      secondaryHref: "https://github.com/schaier-io/eth2026/tree/main/packages/swarm-kv#readme",
    },
  },
  {
    slug: "space-powered-security",
    title: "Create Secure Apps with Space-Powered Tech",
    shortTitle: "Space Security",
    track: "Space-Powered Security APIs",
    sponsor: "SpaceComputer",
    status: "cTRNG in the critical path",
    summary:
      "SpaceComputer cTRNG selects the jurors who decide every market. Game theory only works if the draw cannot be predicted, bribed, copied, or front-run.",
    fitTagline: "Randomness as the fairness engine.",
    fit:
      "If jurors were known early, voters could bribe, copy, or coordinate. If the operator picked them, the protocol collapses into trusted moderation. cTRNG sits in the critical path — it arrives only after commits lock, the contract draws the jury deterministically, and the evidence (value, hash, beacon metadata, audit hash) is stored on-chain so the draw is replayable.",
    pitchHighlights: [
      "cTRNG decides the jury, on-chain, after commits lock",
      "Critical path: no draw, no resolution",
      "Stops bribery, copying, operator picks, front-runs",
      "Replay evidence stored: value · hash · beacon · audit",
    ],
    implemented: [
      "Contract accepts SpaceComputer cTRNG randomness only after voting closes.",
      "Posted randomness transitions the market into Reveal and draws jurors on-chain in one tx.",
      "Randomness evidence (value, hash, beacon metadata, audit hash) is stored and exposed via getters.",
      "CLI fetches the public SpaceComputer IPFS/IPNS beacon and submits commitJury.",
      "Frontend surfaces selected jurors and randomness evidence as the resolution moment.",
      "Modulo-bias-resistant draw: rejection sampling under keccak256 keeps every committer equally likely.",
    ],
    demoFlow: [
      "Voters commit hidden positions with stake",
      "Voting closes; jurors still unknown",
      "CLI fetches cTRNG, posts the evidence",
      "Contract deterministically picks the jury",
      "Selected jurors reveal and resolve",
    ],
    criteria: [
      {
        label: "Working prototype",
        detail:
          "Local and Sepolia demos cover commit, jury formation, reveal, resolution, and pull-pattern withdrawal end to end.",
      },
      {
        label: "Meaningful use of the stack",
        detail:
          "cTRNG decides selected jurors, jurors decide the outcome, and the outcome controls settlement. It is structural, not a cosmetic API call.",
      },
      {
        label: "Impact & creativity",
        detail:
          "Randomness assigns temporary judgment power for disputed claims rather than powering a lottery, drop, or NFT trait.",
      },
      {
        label: "Code & clarity",
        detail:
          "Contract exposes replay evidence, modulo-bias-resistant draw, and the docs record the trusted-committer hackathon limitation explicitly.",
      },
    ],
    code: [
      {
        title: "cTRNG enters the critical path",
        source: "contracts/src/TruthMarket.sol",
        line: 641,
        language: "solidity",
        snippet: `function commitJury(
    uint256 _randomness,
    RandomnessMetadata calldata metadata,
    bytes32 auditHash
) external onlyJuryCommitter {
    if (phase != Phase.Voting) revert WrongPhase();
    if (block.timestamp < votingDeadline) revert DeadlineNotPassed();
    if (randomness != 0) revert JuryAlreadyFulfilled();

    randomness = _randomness;
    randomnessHash = _hashRandomness(_randomness);
    randomnessIpfsAddress = metadata.ipfsAddress;
    randomnessSequence = metadata.sequence;
    randomnessTimestamp = metadata.timestamp;
    randomnessIndex = metadata.valueIndex;
    juryAuditHash = auditHash;
    phase = Phase.Reveal;

    _drawJury(_randomness);
}`,
      },
      {
        title: "Modulo-bias-resistant draw",
        source: "contracts/src/TruthMarket.sol",
        line: 1063,
        language: "solidity",
        snippet: `function _uniformRandom(uint256 seed, uint256 domain, uint256 upper)
    internal
    pure
    returns (uint256)
{
    uint256 threshold;
    unchecked {
        threshold = (0 - upper) % upper;
    }

    uint256 attempt;
    while (true) {
        uint256 x = uint256(keccak256(abi.encode(seed, domain, attempt)));
        if (x >= threshold) return x % upper;
        attempt++;
    }
}`,
      },
    ],
    cta: {
      headline: "Randomness is the fairness engine of TruthMarket.",
      body: "Walk a juror from locked commits to cTRNG arrival to a deterministic, replayable draw.",
      primaryLabel: "Open a live market",
      primaryHref: "/",
      secondaryLabel: "Open SpaceComputer ADR",
      secondaryHref:
        "https://github.com/schaier-io/eth2026/blob/main/docs/adr/0005-spacecomputer-first-sponsor-strategy.md",
    },
    limits: [
      "Hackathon scope trusts the jury committer to post the fetched cTRNG value. The draw is replayable on-chain, but the cTRNG proof itself is not yet verified on-chain — that's the next step as SpaceComputer rolls out space-signed verifiable randomness.",
    ],
  },
  {
    slug: "apify-x402",
    title: "Apify x X402 — Attention into markets",
    shortTitle: "Apify x X402",
    track: "Apify x X402 bounty",
    sponsor: "Apify",
    status: "Apify discovery loop shipped · X402 adapter pending",
    summary:
      "Agents pay Apify via X402 to find viral, unresolved questions on the web, then create TruthMarket markets around them. The internet argues; the protocol settles.",
    fitTagline: "Attention → data → markets → credibility.",
    fit:
      "Most prediction markets depend on humans manually finding good questions — that does not scale. Our agent watches Reddit and other public sources for posts that are viral, ambiguous, prediction-worthy, and safe to settle. It pays Apify through X402, scores candidates, drafts a YES/NO claim, and creates a market. Apify is the discovery engine, X402 is the payment rail, TruthMarket is the resolution layer.",
    pitchHighlights: [
      "Apify finds what the internet argues about",
      "X402 = small, automated, agent-native payments",
      "Score: virality · ambiguity · resolvability · safety",
      "Agent drafts claim. Random jury resolves outcome.",
    ],
    implemented: [
      "Next.js API route calls Apify, fetches Reddit dataset items, and drafts market candidates.",
      "Reusable agent package runs ticks, dedupes seen Reddit permalinks, and creates markets through a host adapter.",
      "Generator scores virality, ambiguity, public resolvability, and safety before drafting rules.",
      "Generated claim/rules copy is explicit: Apify collected context but does not decide outcome.",
      "Offline dry-run mode accepts supplied Reddit items for judge demos without live Apify credentials.",
      "JSON event emission throughout the tick (candidates_fetched, market_created) for agent observability.",
    ],
    demoFlow: [
      "Agent pays Apify via X402",
      "Score & dedupe candidates",
      "Draft YES/NO claim, publish to Swarm",
      "Create market via MarketRegistry",
      "Humans + agents stake, jury resolves",
    ],
    criteria: [
      {
        label: "Relevant use case",
        detail:
          "The agent turns real-time public disputes into markets humans and agents can price and resolve. That is exactly the Web3 + Apify thesis.",
      },
      {
        label: "Functionality & payment demo",
        detail:
          "The Apify discovery loop is fully implemented and demoable. The X402 wrapper is the remaining bounty-specific adapter before the candidate fetch.",
      },
      {
        label: "Creativity",
        detail:
          "Apify becomes the front door for an agentic market economy — not a backend scrape, but the source of new markets at scale.",
      },
    ],
    code: [
      {
        title: "Apify-backed market generation route",
        source: "apps/web/app/api/apify/generated-markets/route.ts",
        line: 81,
        language: "ts",
        snippet: `const { run, items } = await runApifyRedditScrape({
  token,
  actorId,
  input,
  waitForFinishSeconds: body.waitForFinishSeconds,
  pollAttempts: body.pollAttempts,
});
const generated = generateMarketCandidates(items, policy);

return NextResponse.json({
  ok: true,
  action: "draft_from_apify_reddit",
  source: "apify",
  apifyRunId: run.id,
  itemCount: items.length,
  ...generated,
});`,
      },
      {
        title: "Agent tick creates one unseen market",
        source: "agents/apify/src/runner.ts",
        line: 81,
        language: "ts",
        snippet: `const result = await fetchCandidates({ endpoint, items });
const state = await loadAgentState(cfg);
const candidate = result.candidates.find(
  (c) => !hasSeen(state, { permalink: c.sourceUrl, candidateId: c.id })
);

await deps.authorizeCreateMarket?.();
const publishedClaim = await deps.publishClaimDocument?.(candidate);
const spec = buildMarketSpec(candidate, {
  durationSeconds: opts.durationSeconds ?? DEFAULT_DURATION_SECONDS,
  minStake,
  swarmReference: publishedClaim?.swarmReference,
});

const created = await deps.createMarket(spec, { candidate });`,
      },
    ],
    cta: {
      headline: "Apify finds. X402 pays. TruthMarket settles.",
      body: "Agents scan, score, and create markets — humans and agents resolve them through random juries.",
      primaryLabel: "Open Apify agent plan",
      primaryHref:
        "https://github.com/schaier-io/eth2026/blob/main/docs/apify-reddit-agent-market-plan.md",
      secondaryLabel: "Open agent code",
      secondaryHref: "https://github.com/schaier-io/eth2026/tree/main/agents/apify",
    },
    limits: [
      "Apify discovery + agent market creation are implemented end-to-end. A live X402 payment adapter sits in front of the candidate fetch and is the remaining piece for a full payment demo.",
    ],
  },
  {
    slug: "agentic-venture",
    title: "Best Agentic Venture — TruthMarket x Umia",
    shortTitle: "Agentic Venture",
    track: "Best Agentic Venture",
    sponsor: "Umia",
    status: "Venture story + agent loop shipped",
    summary:
      "Polymarket for the AI age: agents find the questions, humans and agents price belief, random juries resolve uncertainty, Umia turns the whole thing into a community-owned venture.",
    fitTagline: "Polymarket for the AI age — community-owned via Umia.",
    fit:
      "Agents are about to flood the internet with claims. The real question is no longer just who posted, but who deserves to be believed under a shared process. TruthMarket is the credibility layer: agents find and scale the questions, humans and agents stake on the answers, random juries resolve disputed beliefs. Umia's CCA + token structure carries that same democratic mechanism into the venture itself, instead of behind a company wall.",
    pitchHighlights: [
      "Credibility layer for the agent economy",
      "Revenue: fees · agent tools · reputation · settlement",
      "Token: stake · fees · reveals · reputation · governance",
      "Umia CCA = community-owned from day one",
    ],
    implemented: [
      "MarketRegistry creates many isolated markets from one verified implementation.",
      "Agents create markets from Apify candidates through a reusable tick loop with dedupe and JSON events.",
      "Agent policy, local reveal vaults, heartbeat monitoring, auto-reveal, and auto-withdraw documented and partly implemented.",
      "Contract supports protocol fees, creator accrual, treasury withdrawals, and stake-based upside.",
      "Docs include a token path focused on staking, fees, reputation, and community ownership.",
      "Web app for humans, CLI + agent package for machines — same on-chain mechanism for both.",
    ],
    demoFlow: [
      "Agent finds an unresolved claim",
      "Agent drafts rules, creates market",
      "Humans + agents stake under same rules",
      "Random jurors resolve outcome",
      "Resolved history → reputation surface",
    ],
    criteria: [
      {
        label: "Long-term viability",
        detail:
          "Revenue paths are concrete: market fees, agent tooling, reputation analytics, premium discovery, and settlement infrastructure for credibility markets.",
      },
      {
        label: "Token consideration",
        detail:
          "The token is tied to stake, fees, reveal incentives, and reputation — not decorative governance. Aligns with Umia's CCA crowdfunding model.",
      },
      {
        label: "Agentic execution scaling",
        detail:
          "Agents are creators, voters, jurors, and monitors — using the same commit-reveal protocol as humans. The CLI and agent package expose machine-friendly JSON workflows.",
      },
      {
        label: "UX audience",
        detail:
          "The web app serves humans; the CLI and agent package serve machines. Both share the same on-chain mechanism — no branch in trust.",
      },
    ],
    code: [
      {
        title: "Agent market-creation workflow",
        source: "agents/apify/src/runner.ts",
        line: 81,
        language: "ts",
        snippet: `emitEvent({ event: "candidates_fetched", count: result.candidates.length });

const candidate = result.candidates.find(
  (c) => !hasSeen(state, { permalink: c.sourceUrl, candidateId: c.id })
);
if (!candidate) return { status: "skipped_all_seen" };

await deps.authorizeCreateMarket?.();
const publishedClaim = await deps.publishClaimDocument?.(candidate);
const spec = buildMarketSpec(candidate, { durationSeconds, minStake, swarmReference });
const created = await deps.createMarket(spec, { candidate });
await saveAgentState(cfg, recordSeen(state, { marketAddress: created.marketAddress }));`,
      },
      {
        title: "Clone-ready market spec",
        source: "agents/apify/src/spec-builder.ts",
        line: 88,
        language: "ts",
        snippet: `return {
  swarmReference,
  votingPeriod: voting,
  adminTimeout: juryCommit,
  revealPeriod: reveal,
  minStake: opts.minStake,
  jurySize,
  minCommits,
  minRevealedJurors,
};`,
      },
    ],
    cta: {
      headline: "Polymarket for the AI age — owned by the community.",
      body: "Working agent loops today; protocol fees, agent tools, reputation analytics as the venture path.",
      primaryLabel: "Open the CLI bootstrap",
      primaryHref: "https://github.com/schaier-io/eth2026/blob/main/apps/cli/skills.sh#L1",
      secondaryLabel: "Open task board",
      secondaryHref: "https://github.com/schaier-io/eth2026/blob/main/tasks.md",
    },
  },
  {
    slug: "sourcify",
    title: "Sourcify — Verified contract infrastructure for market factories",
    shortTitle: "Sourcify",
    track: "Sourcify Bounty",
    sponsor: "Sourcify",
    status: "Verification layer shipped",
    summary:
      "One MarketRegistry creates many lightweight market clones. Sourcify proves every clone runs the canonical TruthMarket code — same checks in the web app and the CLI.",
    fitTagline: "Swarm verifies the rules. Sourcify verifies the code.",
    fit:
      "TruthMarket splits the architecture: one MarketRegistry as the entry point, many EIP-1167 clones, one per market. That gives isolation, smaller per-market storage, and clean scaling — but users need to know which clones are real. Sourcify lookup + runtime bytecode comparison answers that before anyone stakes: canonical, verified fork, unverified, or unknown.",
    pitchHighlights: [
      "Registry + EIP-1167 clones — proven canonical",
      "Sourcify match + runtime bytecode compare",
      "States: verified · clone-checked · unknown · mismatch",
      "Same checks in the web app and the CLI",
    ],
    implemented: [
      "Frontend looks up Sourcify matches for the registry implementation address.",
      "App checks each market's EIP-1167 runtime bytecode against the registry implementation.",
      "Market cards and detail pages show Sourcify/clone verification badges.",
      "CLI has matching market-integrity checks and refuses to operate on mismatched markets.",
      "Unknown, unavailable, clone-checked, verified, and mismatch states are modeled explicitly.",
      "Combined with Swarm verified rules, the trust flow is end-to-end: code verified + rules verified before stake.",
    ],
    demoFlow: [
      "Load markets from MarketRegistry",
      "Read the implementation address",
      "Lookup Sourcify match for the implementation",
      "Match clone runtime bytecode to expected",
      "Show verified · clone-checked · unknown · mismatch",
    ],
    criteria: [
      {
        label: "Use of Sourcify data",
        detail:
          "Sourcify verified-source status is combined with EIP-1167 runtime bytecode verification and registry discovery — not a surface API call.",
      },
      {
        label: "Impact & usefulness",
        detail:
          "Users distinguish canonical registry markets from verified forks, unknown contracts, or outright mismatches before staking real funds.",
      },
      {
        label: "Technical execution",
        detail:
          "Same verification concept exists in both the web app and CLI, with typed status results that drive UI and CLI decisions.",
      },
      {
        label: "Novelty",
        detail:
          "Sourcify becomes a trust layer for scalable market factories rather than a passive contract-explorer link.",
      },
    ],
    code: [
      {
        title: "Implementation Sourcify lookup",
        source: "apps/web/lib/server/sourcify.ts",
        line: 24,
        language: "ts",
        snippet: `export async function lookupSourcifyMatch(chainId: number, address: Address) {
  const checksum = getAddress(address);
  const url = SOURCIFY_SERVER_URL + "/v2/contract/" + chainId + "/" + checksum;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(SOURCIFY_TIMEOUT_MS),
    next: { revalidate: 5 * 60 },
  });

  if (res.status === 404) {
    return { url: sourcifyRepoUrl(chainId, checksum), address: checksum, ok: true };
  }

  const body = await res.json();
  return { match: normalizeSourcifyMatch(body.match), address: checksum, ok: true };
}`,
      },
      {
        title: "Clone plus Sourcify status",
        source: "apps/web/lib/server/sourcify.ts",
        line: 81,
        language: "ts",
        snippet: `const cloneMatches = cloneRuntimeMatchesImplementation(code, opts.implementation);
const implementationSourcify = opts.implementation
  ? await lookupSourcifyMatch(opts.chainId, opts.implementation)
  : undefined;

if (cloneMatches === true && implementationSourcify?.match === "exact_match") {
  return {
    status: "verified",
    label: "Sourcify verified",
    cloneMatches,
    implementation: opts.implementation,
  };
}`,
      },
    ],
    cta: {
      headline: "One verified registry. Many markets, all checked.",
      body: "Show the full trust flow: Swarm verifies the immutable rules, Sourcify verifies the market implementation.",
      primaryLabel: "Open live markets",
      primaryHref: "/",
      secondaryLabel: "Open Sourcify verifier",
      secondaryHref:
        "https://github.com/schaier-io/eth2026/blob/main/apps/web/lib/server/sourcify.ts#L24",
    },
  },
];

const GITHUB_SOURCE_ROOT = "https://github.com/schaier-io/eth2026/blob/main";
const PUBLIC_TRUTH_MARKET_ROOT = "https://www.truth-market.xyz";

export const jurorPackageLinks: JurorPackageLink[] = [
  {
    name: "@truth-market/swarm-verified-fetch",
    url: "https://www.npmjs.com/package/@truth-market/swarm-verified-fetch",
    install: "npm install @truth-market/swarm-verified-fetch",
    description:
      "Fetch-shaped Swarm gateway reads with local CAC/BMT, manifest, and SOC/feed verification.",
  },
  {
    name: "@truth-market/swarm-kv",
    url: "https://www.npmjs.com/package/@truth-market/swarm-kv",
    install: "npm install @truth-market/swarm-kv",
    description:
      "Developer-friendly get, put, list, delete, and entries on top of verified Swarm storage.",
  },
];

export const jurorBootstrapScript: JurorScriptLink = {
  label: "apps/cli/skills.sh",
  source: "apps/cli/skills.sh",
  line: 1,
  command: "cd apps/cli && ./skills.sh bootstrap",
  description:
    "One-shot local setup for the TruthMarket agent CLI: install, build, start anvil, deploy mock contracts, and write a default policy.",
};

export function githubSourceUrl(source: string, line: number): string {
  return `${GITHUB_SOURCE_ROOT}/${source}#L${line}`;
}

export function jurorPresentationUrl(slug: string): string {
  return `${PUBLIC_TRUTH_MARKET_ROOT}/jurors/${slug}`;
}

export function jurorQrCodeSrc(slug: string): string {
  return `/juror-qr/${slug}.svg`;
}

export function getJurorDemo(slug: string): JurorDemo | undefined {
  return jurorDemos.find((demo) => demo.slug === slug);
}
