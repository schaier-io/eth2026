# Apify Reddit Agent Market Plan

TruthMarket will use Apify to create quick markets from viral ambiguous Reddit questions without turning Apify into an oracle. The integration is: Apify-powered agents discover public Reddit context and draft belief-resolution markets; selected jurors still resolve the market by committed reveal under immutable claim rules.

## Product Frame

Use this framing:

> Apify-powered agents turn viral ambiguous Reddit questions into candidate belief-resolution markets. TruthMarket stores immutable YES/NO rules on Swarm, uses SpaceComputer randomness to select a jury, and resolves by selected juror belief.

Avoid this framing:

- "Apify verifies whether the post is real."
- "The scraper decides the outcome."
- "TruthMarket fact-checks Reddit."

## Demo Flow

1. Run an Apify Reddit scraper against configured subreddits, viral posts, search terms, or post URLs.
2. Normalize public post, comment, timestamp, author, score, flair, edit/deletion, and source URL fields into a context artifact.
3. Ask an agent to propose candidate YES/NO belief markets from the scraped ambiguous questions.
4. Filter candidates through local policy and optional human review.
5. Generate a canonical `claim-rules.json`.
6. Upload `claim-rules.json` to Swarm.
7. Optionally upload the Apify context artifact to Swarm as public supporting context.
8. Create the market through the TruthMarket CLI.
9. Agents or users commit private votes with stake.
10. SpaceComputer randomness selects the resolving jury.
11. Selected jurors reveal; the market resolves by count-based jury belief.

## Automated Generator

The live demo should run an automated generator loop:

```txt
schedule tick
  -> run Apify Reddit scrape
  -> score ambiguous/viral candidates
  -> draft claim-rules.json for the best candidate
  -> apply policy gates
  -> create market through CLI
  -> publish market to Swarm discovery
  -> start agent watcher for commits, jury commit, reveal, and withdraw
```

Recommended first implementation: keep the scheduler local to the CLI or agent daemon. Do not add a web backend unless the demo needs remote hosted control.

### Timing Modes

Use one of these modes instead of deciding timing ad hoc during the demo:

| Mode | Creation cadence | Voting period | Jury commit timeout | Reveal period | Contract params |
| --- | ---: | ---: | ---: | ---: | --- |
| `demo-fast` | manual or every 15 min | 5 min | 2 min | 5 min | `jurySize=1`, `minCommits=1`, `minRevealedJurors=1` |
| `live-mini` | every 60 min | 20 min | 5 min | 25 min | `jurySize=1`, `minCommits=1`, `minRevealedJurors=1` |
| `public-hourly` | every 3 hours | 60 min | 10 min | 50 min | `jurySize=3`, `minCommits=3`, `minRevealedJurors=3` |

The contract draws the largest odd value no greater than `min(maxJurors, max(minJurors, activeCommitters * 15 / 100))`. Small markets can start at the minimum juror floor; the 15% cap only grows the selected jury once enough active voters arrive.

## Generator Policy

Use a policy file so the generator can run unattended without creating bad markets:

```json
{
  "enabled": true,
  "mode": "live-mini",
  "scheduleCron": "0 * * * *",
  "maxMarketsCreatedPerRun": 1,
  "maxOpenGeneratedMarkets": 3,
  "requireHumanReviewForCreatedMarkets": false,
  "allowedSources": ["reddit"],
  "allowedSubreddits": ["IsItBullshit", "IsItAI", "Scams", "nottheonion", "quityourbullshit"],
  "blockedSubreddits": ["medical", "legaladvice", "relationships", "AmItheAsshole", "AITAH"],
  "keywords": ["real", "fake", "scam", "true", "AI", "proof", "rumor", "shopped", "staged", "deepfake", "verified", "evidence", "source"],
  "minRedditScore": 25,
  "minCommentCount": 15,
  "minAmbiguityScore": 0.65,
  "stake": "100000000000000000",
  "marketDefaults": {
    "minStake": "100000000000000000",
    "jurySize": 1,
    "minCommits": 1,
    "minRevealedJurors": 1
  }
}
```

For the hackathon demo, `requireHumanReviewForCreatedMarkets` can be false if the candidate filters are conservative and the generated market is previewed in the terminal before signing. For public use, default it to true.

## Candidate Scoring

Score candidates before creating markets:

- Virality: Reddit score, comment count, and recent velocity.
- Ambiguity: title or comments contain disagreement, uncertainty, competing interpretations, or unresolved claims.
- Public resolvability: jurors can judge from public context linked in the claim/rules document.
- Safety: no doxxing, harassment target, medical/legal/financial determinations, private evidence, or illegal instructions.
- Market clarity: YES and NO meanings are short, symmetric, and defined before staking.

Only create one market per tick. If no candidate passes threshold, skip the tick.

## Apify API Use

Use Apify's Actor API as the generator input surface:

1. Start the Reddit scraper Actor with JSON input:

```txt
POST https://api.apify.com/v2/acts/<actorId>/runs
Authorization: Bearer <APIFY_TOKEN>
Content-Type: application/json
```

2. Read `id` and `defaultDatasetId` from the returned run object.
3. Poll the run:

```txt
GET https://api.apify.com/v2/actor-runs/<runId>?waitForFinish=30
```

4. Fetch results:

```txt
GET https://api.apify.com/v2/datasets/<defaultDatasetId>/items?format=json&clean=1
```

For short demo scrapes, a synchronous Actor call can be used, but Apify documents a 300-second limit for synchronous dataset-item endpoints. Prefer async run + poll for reliability.

## Apify Actor Role

The simplest build can call an existing Reddit scraper Actor through the Apify API. A stronger bounty-facing build is a small custom Actor:

```txt
truthmarket-reddit-market-generator
```

Input:

```json
{
  "subreddits": ["technology", "CryptoCurrency"],
  "keywords": ["fake", "real", "scam", "claim"],
  "maxPosts": 20,
  "maxComments": 50,
  "requireHumanReview": true
}
```

Output:

```json
{
  "schema": "truthmarket.apifyRedditCandidates.v1",
  "source": "apify",
  "candidates": [
    {
      "sourceUrl": "https://www.reddit.com/r/example/comments/...",
      "title": "Do selected jurors believe this post is likely authentic?",
      "summary": "Short neutral summary of the public context.",
      "claimRulesDraft": {
        "schema": "truthmarket.claimRules.v1",
        "title": "Do selected jurors believe this post is likely authentic?",
        "description": "A YES/NO claim resolved by selected staked juror belief under these rules.",
        "yesMeaning": "Selected jurors believe the post is likely authentic under the listed public signals.",
        "noMeaning": "Selected jurors do not believe the post is likely authentic under the listed public signals.",
        "resolutionRules": "Jurors may use only the linked public Reddit context and any public links included in the rules document."
      },
      "contextArtifact": {
        "post": {},
        "comments": [],
        "scrapedAt": "2026-05-09T00:00:00Z"
      }
    }
  ]
}
```

## Candidate Policy

Agent-created markets must pass these gates:

- `allowScrapedMarketCreation` is true.
- Source is in `allowedSources`.
- Subreddit is allowed and not blocked.
- Created market count is below `maxMarketsCreatedPerRun`.
- Human review is completed when `requireHumanReviewForCreatedMarkets` is true.
- YES/NO meanings are clear before anyone stakes.
- The question can be judged from public context.

Reject candidates that require private evidence, doxxing, harassment, illegal instructions, medical/legal/financial determinations, or unavailable data.

## Good Market Shapes

- "Do selected jurors believe this post is likely authentic under the linked public signals?"
- "Do selected jurors believe this claim is credible enough to classify as YES under the rules?"
- "Do selected jurors believe the community question should resolve YES after reviewing the supplied public context?"

## Bad Market Shapes

- "Did this objectively happen?" when the answer needs private evidence.
- "Does Apify prove this is true?"
- "Is this person guilty?"
- Any claim where YES and NO are undefined before staking.

## CLI Contract

The teammate-built CLI should be the execution layer for agents. Recommended commands:

```txt
truthmarket generator run --policy generator-policy.json --json
truthmarket generator daemon --policy generator-policy.json --json
truthmarket market draft-from-reddit --apify-run <run-id> --json
truthmarket market create --claim-rules claim-rules.json --json
truthmarket market verify --market <address> --json
truthmarket vote commit --market <address> --vote yes|no --stake <amount> --json
truthmarket agent watch --policy policy.json --json
truthmarket vote reveal --market <address> --json
truthmarket withdraw --market <address> --json
```

The CLI should return stable JSON with `ok`, `action`, `market`, `txHash`, `swarmReference`, and `error` fields where applicable. It must not require private keys, nonces, or unrevealed votes in command-line arguments.

Generator commands should also return `apifyRunId`, `datasetId`, `candidateId`, `skippedReason`, and `createdMarketCount`.

## Web API Surface

The web app exposes a server-side generator endpoint for the demo:

```txt
POST /api/apify/generated-markets
```

Environment:

```txt
APIFY_TOKEN=<server-side Apify token>
APIFY_REDDIT_ACTOR_ID=prodiger/reddit-scraper
```

Live Apify request (default `apifyInput` matches `trudax/reddit-scraper-lite`; see ADR 0014):

```json
{
  "policy": {
    "mode": "demo-fast",
    "maxMarketsCreatedPerRun": 1
  },
  "apifyInput": {
    "startUrls": [
      { "url": "https://www.reddit.com/r/IsItBullshit/hot/" },
      { "url": "https://www.reddit.com/r/nottheonion/hot/" }
    ],
    "skipComments": false,
    "skipUserPosts": true,
    "skipCommunity": true,
    "searchPosts": false,
    "sort": "hot",
    "includeNSFW": false,
    "maxItems": 20,
    "maxPostCount": 5,
    "maxComments": 15
  }
}
```

Dry-run request without Apify:

```json
{
  "items": [
    {
      "title": "Is this viral AI restaurant receipt real or fake?",
      "url": "https://reddit.com/r/IsItBullshit/comments/...",
      "subreddit": "IsItBullshit",
      "score": 1200,
      "numComments": 240,
      "selftext": "People are split on whether the receipt was generated by AI.",
      "comments": [
        { "body": "This looks fake, source?" },
        { "body": "I think it is real because the timestamp matches." }
      ]
    }
  ],
  "policy": {
    "mode": "demo-fast",
    "minAmbiguityScore": 0.4
  }
}
```

The endpoint returns generated candidates only. It does not upload to Swarm or create markets on-chain yet; the CLI should consume the returned `claimRulesDraft` and `contextArtifact`.

## Swarm Artifacts

Upload two separate artifacts:

- Claim/rules document: canonical market rules, YES/NO meanings, source links, and allowed evidence.
- Context artifact: public Apify/Reddit scrape output used to draft the market.

Only the claim/rules document defines the market. The context artifact is supporting material and must not become mutable protocol state.

## Hackathon Fit

This creates a visible Apify integration while preserving TruthMarket's random-jury belief-resolution model. The demo can show:

- Apify collecting public Reddit context.
- An agent drafting market candidates.
- Swarm making the selected rules immutable.
- SpaceComputer selecting the jury.
- Agents and users participating with commit-reveal.

The result is not a Reddit fact-checker. It is an agent-generated belief market from public web context.

## References

- Apify API overview: https://docs.apify.com/api
- Run Actor endpoint: https://docs.apify.com/api/v2/act-runs-post
- Run Actor and retrieve data guide: https://docs.apify.com/academy/api/run-actor-and-retrieve-data-via-api
- Dataset items endpoint: https://docs.apify.com/api/v2/dataset-items-get
