# Apify Reddit Generator Genre and Actor Schema

Status: accepted

The Apify Reddit market generator targets authenticity- and credibility-disputed posts, not opinion threads. The default allowlist is `IsItBullshit, IsItAI, Scams, nottheonion, quityourbullshit`, and `buildApifyInput` emits the input schema for `trudax/reddit-scraper-lite` (the actor pinned by `APIFY_REDDIT_ACTOR_ID` in the demo env).

The original allowlist (`AskReddit, NoStupidQuestions, OutOfTheLoop, technology`) was kept while the generator was being scaffolded. A live Apify run against it returned zero candidates: those communities surface relationship and opinion questions, which the scorer correctly rejects (`ambiguity_too_low`) and which the claim-rules template ("Do selected jurors believe this Reddit question is credible") cannot meaningfully resolve in 20 minutes from public context. The pivot is empirical, not stylistic.

The new allowlist is built around the design's existing market shape ([apify-reddit-agent-market-plan.md](../apify-reddit-agent-market-plan.md): "Do selected jurors believe this post is likely authentic under the linked public signals?"). Each sub was probed against Reddit's public JSON before adoption:

- `IsItBullshit` and `IsItAI` — every post is already a binary authenticity question. Volumes are smaller, so `minRedditScore` drops from 100 to 25 and `minCommentCount` from 25 to 15.
- `Scams` — "is this a scam?" is binary by construction; volume is moderate.
- `nottheonion` — high-volume reliable fallback when the Tier-1 subs are quiet. Headlines are concrete claims a juror can verify by reading the linked article.
- `quityourbullshit` — public callouts of fake claims; comments contain the disagreement signal the scorer looks for.

The blocklist gains `relationships, AmItheAsshole, AITAH` to enforce the "is this person guilty?" ban already in the plan. The `AMBIGUITY_TERMS` list adds `shopped, staged, deepfake, verified, evidence, source?, cgi, actually happened` so the scorer detects the disagreement vocabulary the new subs actually use.

`buildApifyInput` previously emitted `urls / maxPostsPerSource / includeComments / maxCommentsPerPost / commentDepth / filterKeywords`, which `trudax/reddit-scraper-lite` silently ignores; runs against the default policy returned an empty dataset. It now emits `startUrls / skipComments / skipUserPosts / skipCommunity / searchPosts / sort / includeNSFW / maxItems / maxPostCount / maxComments`. The dataset returned by trudax mixes `dataType: "post"` and `dataType: "comment"` items, so `generateMarketCandidates` filters to posts before scoring; comment bodies promoted to market titles produced nonsense claims in dry-run.

**Considered Options**

- Keep the AskReddit-style allowlist and broaden the scorer to accept opinion questions: rejected because opinion threads do not have a YES/NO claim that a juror can resolve in 20 minutes from public evidence, and the "credibility" claim template misfits.
- Add r/AmITheAsshole-style judgment subs as a richer source of binary YES/NO posts: rejected because [apify-reddit-agent-market-plan.md:203](../apify-reddit-agent-market-plan.md:203) explicitly bans the "is this person guilty?" market shape; reusing those threads would route the agent into that shape.
- Use Apify search queries (`searches: ["is this real", "AI generated", ...]`) instead of subreddit hot pages: deferred. Subreddit pages produce predictable yields, are easier to audit during a hackathon demo, and stay inside the existing safety blocklist. The search path remains available through `policy.apify.input` for operators who want it.
- Make `buildApifyInput` actor-agnostic by detecting the actor and shaping accordingly: deferred. Only one actor is wired into the demo. When a second actor is introduced, switch on `policy.apify.actorId` rather than expanding the default function.

**Consequences**

- Operators who pinned a different Reddit-scraper actor must override `policy.apify.input` because the default shape is now trudax-specific. The function comment names the actor.
- Tier-1 subs are smaller; the agent will produce fewer candidates per tick, but the candidates will pass the scorer at higher rates. `nottheonion` is the volume floor.
- The plan doc's example `apifyInput` was the pre-pivot schema; it is now a historical reference and is annotated as such there.
