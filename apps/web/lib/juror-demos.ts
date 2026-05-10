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
  fit: string;
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
    title: "Future Society",
    shortTitle: "Future Society",
    track: "Social impact track",
    sponsor: "Ethereum public goods",
    status: "Core mechanism implemented",
    summary:
      "TruthMarket gives communities a privacy-respecting way to resolve disputed, probabilistic, or value-laden claims without giving final authority to one moderator.",
    fit:
      "The protocol is useful for DAO accountability, AI claim review, public-interest promises, community funding checks, creator milestones, and research forecasts. The impact comes from fair process: immutable rules, private committed votes, random selected jurors, and risked stake.",
    implemented: [
      "Immutable claim/rules documents are published before stake enters the market.",
      "Classic commit-reveal keeps votes hidden during the voting phase.",
      "SpaceComputer randomness selects the resolving jury after commits are locked.",
      "Each selected juror contributes one count-based vote, independent of stake size.",
      "The UI and CLI expose Swarm verification, jury status, reveal, settlement, and payout flows.",
    ],
    demoFlow: [
      "Create a community-impact claim with locked YES/NO rules.",
      "Voters stake and privately commit their belief.",
      "Voting closes, then randomness selects selected jurors from committed voters.",
      "Selected jurors reveal and resolve the market under the immutable rules.",
      "Winning revealers withdraw returned stake plus their share of the slashed pool.",
    ],
    criteria: [
      {
        label: "Fairness",
        detail:
          "Selected jurors are drawn after commits close, so participants cannot know the resolving jury while votes are being committed.",
      },
      {
        label: "Privacy",
        detail:
          "Votes are committed as hashes and revealed later by the voter. The operator cannot reveal votes for users.",
      },
      {
        label: "Transparent governance",
        detail:
          "Claim rules, selected jurors, randomness evidence, reveal counts, slashing, and withdrawals are inspectable.",
      },
      {
        label: "Inclusive participation",
        detail:
          "Stake controls exposure and reward weight, but selected juror voting power is one juror equals one vote.",
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
        title: "Random selected jury",
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
      headline: "Use TruthMarket where communities need a fair process, not one final authority.",
      body:
        "For this track, walk judges from a disputed social-impact claim to locked rules, private commitments, selected jurors, and settlement.",
      primaryLabel: "Open the live demo",
      primaryHref: "/demo",
      secondaryLabel: "Review the protocol context",
      secondaryHref: "https://github.com/schaier-io/eth2026/blob/main/CONTEXT.md",
    },
  },
  {
    slug: "swarm-verified-fetch",
    title: "Bounty 1: Verified Fetch - Trust No Gateway",
    shortTitle: "Swarm Verified Fetch",
    track: "Swarm bounty 1",
    sponsor: "Swarm",
    status: "Package implemented",
    summary:
      "The repo includes @truth-market/swarm-verified-fetch, a browser and Node.js package for fetching Swarm data through gateways while verifying immutable chunks and signed feed updates locally.",
    fit:
      "TruthMarket uses this for claim/rules documents. A gateway can deliver the bytes, but the client recomputes and verifies the Swarm content path before showing users the rules they are about to stake on.",
    implemented: [
      "Fetches immutable Swarm data through gateway lists with retries, timeouts, and failover.",
      "Verifies CAC chunks and reconstructs multi-chunk byte trees before exposing payloads.",
      "Resolves verified Mantaray manifest paths from verified manifest bytes.",
      "Verifies SOC/feed updates, including owner, topic, sequence index, and target reference.",
      "Exposes manual verification helpers and typed verification metadata.",
      "Includes fake gateway, corrupted chunk, manifest, feed, and MITM-style tests.",
    ],
    demoFlow: [
      "Open a market whose rules are stored as a Swarm reference.",
      "Fetch the claim/rules bytes from a configured gateway.",
      "Recompute the Swarm chunk tree and verify the reference.",
      "Display the rules and enable participation only when verification succeeds.",
    ],
    criteria: [
      {
        label: "Correctness",
        detail:
          "CAC/BMT chunk verification, multi-chunk tree reconstruction, manifests, and SOC/feed updates are implemented.",
      },
      {
        label: "API design",
        detail:
          "The main API is a familiar verifiedFetch(input, options) call with response modes and metadata.",
      },
      {
        label: "Browser support",
        detail:
          "The package is TypeScript, fetch-based, and avoids Node-only assumptions in the core fetch path.",
      },
      {
        label: "Resilience",
        detail:
          "Gateway racing/failover, abort signals, timeout handling, and verification errors are first-class outcomes.",
      },
      {
        label: "Tests",
        detail:
          "The package has unit and e2e-style tests for corrupt bytes, gateway failures, manifests, feeds, and tampering.",
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
        title: "SOC/feed update verification",
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
      headline: "Install verified fetch and make public gateways untrusted delivery.",
      body:
        "For this track, show the package install, then demo a claim/rules document fetched through a gateway and verified locally before staking.",
      primaryLabel: "Open npm package",
      primaryHref: "https://www.npmjs.com/package/@truth-market/swarm-verified-fetch",
      secondaryLabel: "Read package docs",
      secondaryHref: "https://github.com/schaier-io/eth2026/tree/main/packages/swarm-verified-fetch#readme",
    },
  },
  {
    slug: "swarm-kv",
    title: "Bounty 2: A Simple Key-Value Store on Swarm",
    shortTitle: "Swarm KV",
    track: "Swarm bounty 2",
    sponsor: "Swarm",
    status: "Package implemented",
    summary:
      "The repo includes @truth-market/swarm-kv, a developer-friendly key-value store over Swarm for mutable app data, indexes, user preferences, and agent state.",
    fit:
      "TruthMarket keeps canonical claim/rules documents immutable, then uses Swarm KV for discovery and read-model convenience. Mutable indexes help users find markets, but never define rules, outcomes, votes, selected jurors, or payouts.",
    implemented: [
      "Supports string, JSON, bytes, ArrayBuffer, and Blob-like values.",
      "Provides put, get, getJson, getString, getBytes, list, delete, has, and async entries.",
      "Verifies reads through @truth-market/swarm-verified-fetch before decoding values.",
      "Maintains an immutable index document with revisions, tombstones, topics, and previous references.",
      "Handles postage batches, large payload limits, optional encryption, feed pointers, and write locks.",
      "Includes fake Bee, local Bee, deletion, concurrency, and large-value tests.",
    ],
    demoFlow: [
      "Store a creator's market index or user preference with put.",
      "Publish the updated immutable index reference.",
      "Read values back with verified Swarm bytes.",
      "List or iterate keys without exposing feed/SOC details to app developers.",
    ],
    criteria: [
      {
        label: "Developer experience",
        detail:
          "The app-facing surface is get, put, list, delete, and entries instead of feeds, topics, SOCs, and manifests.",
      },
      {
        label: "Completeness",
        detail:
          "Listing, deletion, tombstones, iteration, JSON, strings, bytes, and optional private mode are included.",
      },
      {
        label: "Edge cases",
        detail:
          "Missing keys return null, payload sizes are checked, writes are serialized, and optimistic guards are available.",
      },
      {
        label: "Examples",
        detail:
          "The package README and tests show working local and fake Bee usage paths.",
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
      headline: "Install Swarm KV and make decentralized app storage feel familiar.",
      body:
        "For this track, lead with get, put, list, delete, and verified reads. The point is developer experience on top of Swarm primitives.",
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
    status: "Core integration implemented",
    summary:
      "TruthMarket uses SpaceComputer cTRNG as the fairness engine for jury selection, the moment that decides which staked participants resolve the market.",
    fit:
      "Randomness is not cosmetic here. It is in the critical path: no selected jury, no resolution. The protocol stores the cTRNG value, metadata, randomness hash, audit hash, and selected jurors so the draw can be inspected and replayed.",
    implemented: [
      "The contract accepts SpaceComputer cTRNG randomness only after voting closes.",
      "The posted randomness transitions the market into reveal and draws selected jurors on-chain.",
      "Randomness evidence fields are stored and exposed through getters.",
      "The CLI fetches the public SpaceComputer IPFS/IPNS beacon and submits commitJury.",
      "The frontend displays selected jurors and randomness evidence as the resolution moment.",
    ],
    demoFlow: [
      "Voters commit hidden positions with stake.",
      "Voting closes before jurors are known.",
      "The jury committer fetches SpaceComputer cTRNG and posts the evidence.",
      "The contract deterministically selects the jury.",
      "Selected jurors reveal and determine the outcome.",
    ],
    criteria: [
      {
        label: "Working prototype",
        detail:
          "The local and Sepolia demo flows include commit, jury formation, reveal, resolution, and withdrawal paths.",
      },
      {
        label: "Meaningful stack use",
        detail:
          "cTRNG decides selected jurors, selected jurors decide the outcome, and the outcome controls settlement.",
      },
      {
        label: "Impact and creativity",
        detail:
          "Randomness assigns temporary judgment power for disputed claims rather than powering a lottery or cosmetic trait.",
      },
      {
        label: "Code and clarity",
        detail:
          "The contract exposes replay evidence, and the docs record the trusted-committer hackathon limitation.",
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
      headline: "Run the jury draw and show randomness as the fairness engine.",
      body:
        "For this track, make SpaceComputer the turning point: hidden commitments are locked, cTRNG arrives, selected jurors appear, and reveal begins.",
      primaryLabel: "Open the live demo",
      primaryHref: "/demo",
      secondaryLabel: "Open SpaceComputer ADR",
      secondaryHref: "https://github.com/schaier-io/eth2026/blob/main/docs/adr/0005-spacecomputer-first-sponsor-strategy.md",
    },
    limits: [
      "Hackathon scope trusts the jury committer to post the fetched SpaceComputer beacon value. The draw is replayable, but the cTRNG proof is not verified on-chain yet.",
    ],
  },
  {
    slug: "apify-x402",
    title: "Apify x X402",
    shortTitle: "Apify x X402",
    track: "Apify bounty",
    sponsor: "Apify",
    status: "Apify loop implemented, X402 adapter pending",
    summary:
      "TruthMarket uses Apify as a discovery engine: agents scan public web context, score ambiguous questions, draft claim/rules documents, and create random-jury belief-resolution markets.",
    fit:
      "Apify does not decide outcomes. It finds what people are arguing about. X402 is the natural payment rail for agent-paid data access, sitting before the Apify candidate fetch in the agent workflow.",
    implemented: [
      "A Next.js API route can call Apify, fetch Reddit dataset items, and draft market candidates.",
      "A reusable agent package runs ticks, dedupes seen Reddit permalinks, and creates markets through a host adapter.",
      "The generator scores virality, ambiguity, public resolvability, and safety before drafting rules.",
      "The generated claim/rules copy explicitly says Apify collected context but does not decide the outcome.",
      "Offline dry-run mode accepts supplied Reddit items for judge demos without live Apify credentials.",
    ],
    demoFlow: [
      "Agent pays for or otherwise accesses an Apify-powered scrape.",
      "Apify returns posts, comments, score, source URL, and public context.",
      "TruthMarket scores candidates and drafts an immutable claim/rules document.",
      "The agent publishes rules to Swarm and creates the market through MarketRegistry.",
      "Humans and agents stake, reveal, and resolve through selected jurors.",
    ],
    criteria: [
      {
        label: "Relevant use case",
        detail:
          "The agent turns real-time public disputes into markets for humans and agents to price and resolve.",
      },
      {
        label: "Payment capability",
        detail:
          "The Apify discovery loop is implemented. The X402 payment wrapper is the remaining bounty-specific adapter before the candidate fetch.",
      },
      {
        label: "Functionality",
        detail:
          "The route and agent tick can generate candidates, build specs, create markets, record state, and emit JSON events.",
      },
      {
        label: "Creativity",
        detail:
          "Apify becomes the front door for an agentic market economy, not an outcome authority.",
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
      headline: "Turn internet disputes into markets with an agent loop.",
      body:
        "For this track, show Apify as discovery, X402 as the payment rail to add next, and TruthMarket as the resolution layer.",
      primaryLabel: "Open Apify agent plan",
      primaryHref: "https://github.com/schaier-io/eth2026/blob/main/docs/apify-reddit-agent-market-plan.md",
      secondaryLabel: "Open agent code",
      secondaryHref: "https://github.com/schaier-io/eth2026/tree/main/agents/apify",
    },
    limits: [
      "The repo currently implements Apify discovery and agent market creation. A live X402 payment adapter is still needed before claiming the payment portion as complete.",
    ],
  },
  {
    slug: "agentic-venture",
    title: "Best Agentic Venture",
    shortTitle: "Agentic Venture",
    track: "Umia venture bounty",
    sponsor: "Umia",
    status: "Venture story and agent loop implemented",
    summary:
      "TruthMarket can become a credibility layer for the agent economy: agents discover claims and operate under local policy, while humans and agents stake, reveal, and build reputation through resolved markets.",
    fit:
      "The venture path is protocol fees on markets, agent market tools, creator and DAO dashboards, reputation analytics, and staking infrastructure. The product is naturally community-owned because the mechanism itself is shared-rule, private-vote, random-jury resolution.",
    implemented: [
      "MarketRegistry creates many isolated markets from one verified implementation.",
      "Agents can create markets from Apify candidates through a reusable tick loop.",
      "Agent policy, local reveal vaults, heartbeat monitoring, auto-reveal, and auto-withdraw are documented and partly implemented.",
      "The contract supports protocol fees, creator accrual, treasury withdrawals, and stake-based upside.",
      "The docs include a token path focused on staking, fees, reputation, and community ownership.",
    ],
    demoFlow: [
      "Agent discovers an unresolved claim.",
      "Agent drafts rules and creates a market.",
      "Humans and agents stake under the same immutable rules.",
      "Selected jurors resolve the market.",
      "Resolved history becomes a reputation and analytics surface for future products.",
    ],
    criteria: [
      {
        label: "Long-term viability",
        detail:
          "TruthMarket can monetize through fees, market tooling, agent discovery, dashboards, and settlement infrastructure.",
      },
      {
        label: "Token consideration",
        detail:
          "The token story is tied to stake, protocol fees, reveal incentives, and reputation rather than decorative governance.",
      },
      {
        label: "Agentic execution",
        detail:
          "Agents are creators, voters, selected jurors, and monitors, but must still use classic commit-reveal and local policy.",
      },
      {
        label: "UX audience",
        detail:
          "The web app serves humans, while the CLI and agent package expose machine-friendly JSON workflows.",
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
      headline: "Pitch TruthMarket as venture infrastructure for human and agent credibility.",
      body:
        "For this track, move from working agent flows to the business path: market fees, agent tools, reputation analytics, and community ownership.",
      primaryLabel: "Open the CLI bootstrap",
      primaryHref: "https://github.com/schaier-io/eth2026/blob/main/apps/cli/skills.sh#L1",
      secondaryLabel: "Open task board",
      secondaryHref: "https://github.com/schaier-io/eth2026/blob/main/tasks.md",
    },
  },
  {
    slug: "sourcify",
    title: "Sourcify Bounty",
    shortTitle: "Sourcify",
    track: "Verified contract data",
    sponsor: "Sourcify",
    status: "Verification layer implemented",
    summary:
      "TruthMarket uses Sourcify as a safety layer for a multi-contract architecture: one MarketRegistry creates many lightweight market clones, and the app verifies that each market matches the registry implementation.",
    fit:
      "Swarm verifies the rules users read. Sourcify verifies the code that enforces those rules. Together, users do not have to trust a random market link or the frontend blindly.",
    implemented: [
      "The frontend looks up Sourcify matches for the registry implementation.",
      "The app checks each market's EIP-1167 runtime bytecode against the registry implementation.",
      "Market cards and detail pages show Sourcify/clone verification badges.",
      "The CLI has matching market-integrity checks and refuses mismatched markets.",
      "Unknown, unavailable, clone-checked, verified, and mismatch states are modeled explicitly.",
    ],
    demoFlow: [
      "Load markets from MarketRegistry.",
      "Read the registry implementation address.",
      "Fetch the implementation's Sourcify status.",
      "Check each market clone bytecode against the expected runtime.",
      "Show the user whether the market is verified, clone-checked, unknown, or mismatched.",
    ],
    criteria: [
      {
        label: "Use of Sourcify data",
        detail:
          "Sourcify verified-source status is combined with runtime clone verification and registry discovery.",
      },
      {
        label: "Impact and usefulness",
        detail:
          "Users can distinguish canonical registry markets from verified forks, unknown contracts, or mismatches before staking.",
      },
      {
        label: "Technical execution",
        detail:
          "The same verification concept exists in the web app and CLI, with typed status results.",
      },
      {
        label: "Novelty",
        detail:
          "Sourcify is used as a trust layer for scalable market factories rather than as a passive contract explorer link.",
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
      headline: "Verify the code before anyone stakes.",
      body:
        "For this track, show the full trust flow: Swarm verifies the immutable rules and Sourcify verifies the market implementation.",
      primaryLabel: "Open live markets",
      primaryHref: "/",
      secondaryLabel: "Open Sourcify verifier",
      secondaryHref: "https://github.com/schaier-io/eth2026/blob/main/apps/web/lib/server/sourcify.ts#L24",
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
