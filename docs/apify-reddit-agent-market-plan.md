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
truthmarket market draft-from-reddit --apify-run <run-id> --json
truthmarket market create --claim-rules claim-rules.json --json
truthmarket market verify --market <address> --json
truthmarket vote commit --market <address> --vote yes|no --stake <amount> --json
truthmarket agent watch --policy policy.json --json
truthmarket vote reveal --market <address> --json
truthmarket withdraw --market <address> --json
```

The CLI should return stable JSON with `ok`, `action`, `market`, `txHash`, `swarmReference`, `claimRulesHash`, and `error` fields where applicable. It must not require private keys, nonces, or unrevealed votes in command-line arguments.

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
