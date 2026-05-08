# TruthMarket — Random Jury Belief Resolution Plan

TruthMarket is no longer framed as a fact-checking oracle. It is a random-jury belief-resolution market:

- participants stake on immutable claims;
- votes are private during the commit phase;
- SpaceComputer randomness selects a subset of staked voters as the resolving jury;
- selected jurors reveal and decide the outcome;
- all voters reveal to settle their stake;
- winners receive their remaining stake plus upside from slashed losing/non-revealed stake.

Core principle: there is no oracle and no external source of truth. The protocol only resolves what the selected staked jury believes under the immutable rules of the claim.

---

## Stage 1 — Reframe Product And Submission

**Goal:** Align every part of the project around random-jury belief resolution.

**Positioning:**

> A belief-resolution protocol where staked voters privately commit to claims, SpaceComputer randomness selects a resolving jury, and the count majority of revealing jurors determines the outcome. Conviction governs only economic exposure — slash size and reward share — not voting power.

**Primary hackathon track:** Network Economy.

**Secondary track:** Future Society, if the demo emphasizes community/governance dispute resolution.

**Sponsor priority:**

1. SpaceComputer — core random jury selection.
2. Umia — venture/token story around protocol fees and staking.
3. Swarm — immutable claim/rules documents.
4. ENS — optional identity/reputation layer.
5. Sourcify — optional contract verification if still eligible and cheap.
6. Apify — optional only; not part of the core mechanism.

**Acceptance:**

- README and submission copy do not describe the product as a fact-checker or oracle.
- Demo language consistently says "random jury belief resolution."
- Apify is removed from the critical path.

---

## Stage 2 — Immutable Claim Rules On Swarm

**Goal:** Every market has immutable rules that voters can inspect before staking.

**Core artifact:** claim/rules document stored on Swarm.

**Claim document fields:**

- title
- description
- resolution rules
- created timestamp
- voting deadline
- reveal deadline
- jury size
- weighting mode, initially `sqrt_stake_conviction`
- stake token
- creator address or identity

**Contract relationship:**

- Contract stores the Swarm reference/hash.
- UI fetches the claim document from Swarm.
- Voters stake only after seeing the immutable rules.

**Acceptance:**

- A claim can be uploaded to Swarm.
- The contract stores the returned Swarm reference.
- The frontend can fetch and display the claim/rules document.
- The UI communicates that rules cannot be changed after market creation.

---

## Stage 3 — Commit Phase

**Goal:** Voters privately stake on a YES/NO belief without revealing their vote.

**Voter inputs:**

- claim id
- vote commitment
- stake amount
- conviction percent

**Conviction:**

Conviction is the percentage of the stake the voter is willing to risk if wrong or if they fail to reveal.

Example:

- stake: 100 tokens
- conviction: 25%
- loss if wrong: 25 tokens
- refund if wrong: 75 tokens

At 100% conviction, the voter risks the full stake.

**Privacy model:**

- Use classic commit-reveal.
- The protocol/operator must not be able to decrypt or reveal votes.
- Voters keep sovereignty over their vote and nonce.

**Acceptance:**

- Voters can commit a hidden vote with stake and conviction.
- No vote is visible before reveal.
- The contract tracks voter stake and conviction.

---

## Stage 4 — SpaceComputer Jury Selection

**Goal:** Use SpaceComputer randomness to select the resolving jury from committed voters.

**Flow:**

1. Voting closes.
2. Off-chain service fetches SpaceComputer cTRNG output.
3. The cTRNG response is preserved for audit.
4. The service deterministically selects `jurySize` voters from the committer set.
5. The selected jury is committed on-chain.

**Trust boundary:**

- Hackathon version may use an off-chain service to post jurors.
- The selection must be replayable from the committer list and randomness.
- Future version can harden this with on-chain verification or signed cTRNG attestations.

**Acceptance:**

- A reviewer can see the randomness value, selected jurors, and replay script/process.
- The contract records the selected jurors.
- The frontend shows the jury selection as the SpaceComputer-powered core moment.

---

## Stage 5 — Reveal And Resolution

**Goal:** Selected jurors reveal to determine the outcome; all voters reveal to settle their own stake.

**Rules:**

- Selected jurors determine the market outcome.
- All voters must reveal to claim any returned stake or rewards.
- Non-revealing voters lose the risked portion of their stake.
- Revealed losing voters lose the risked portion of their stake.
- Revealed winning voters receive stake back plus a share of the slashed pool.

**Jury voting:**

Jury outcome is count-based ([ADR 0006](./docs/adr/0006-count-based-jury-voting.md)):

- each selected juror contributes exactly 1 vote;
- stake and conviction do not influence the YES/NO decision;
- jury size is constrained to be odd (≤ 100); on full reveal, ties are impossible;
- on partial reveal with an even count of revealing jurors, ties resolve to Invalid.

**Reward weighting:**

- Winner reward share is weighted by the winner's own `riskedStake` (= stake × conviction).
- High-conviction winners take more downside risk (1× risked slash if wrong) and receive a larger reward share if right.

**Juror non-reveal penalty:**

- Selected jurors who skip reveal forfeit their full stake regardless of conviction (~5× a typical normal slash).
- The extra above the normal 1× risked slash joins the distributable pool on Yes/No, or accrues to the claim creator on Invalid (pull pattern via `withdrawCreator`).

**Acceptance:**

- Selected jurors reveal and the count majority decides the outcome.
- Non-selected voters can reveal to settle.
- Winners receive stake plus a risked-stake-weighted bonus.
- Non-juror losers/non-revealers lose only their risked portion.
- Selected jurors who skip reveal lose their full stake.

---

## Stage 6 — Token And Umia Venture Story

**Goal:** Keep token mechanics simple enough for the hackathon while making the venture path credible.

**Hackathon token story:**

- The protocol has a token.
- Users can stake on claims with the token.
- Users can stake the protocol token in the protocol to receive protocol fees/revenue share.

**Deferred token mechanics:**

- Governance over protocol settings.
- Claim creation requirements.
- Complex emissions.
- Multi-token markets.

**Umia pitch:**

TruthMarket can become a venture because it monetizes belief-resolution markets through protocol fees, creates demand for a staking token, and can expand from prediction markets into DAO decisions, public disputes, and agent-mediated coordination.

**Acceptance:**

- Pitch deck has a simple revenue model.
- Token value capture is fee/revenue-share driven, not hand-wavy governance.
- Demo does not depend on complex tokenomics.

---

## Stage 7 — ENS Identity Layer

**Goal:** Add optional but visible identity and reputation if time allows.

**Use cases:**

- Named voters or agents.
- Market creators with ENS names.
- Juror profiles.
- Text records for reputation, role, or endpoint.

**Boundary:**

- ENS is not required for jury selection.
- ENS must not be cosmetic if submitted for the bounty.
- Live resolution/lookups are required if we pursue ENS seriously.

**Acceptance:**

- At least one voter/agent/creator is resolved through ENS live.
- UI displays ENS identity instead of only raw addresses.
- Any ENS records used are public-safe.

---

## Stage 8 — Demo And Submission

**Goal:** Ship a judge-legible demo that makes the random jury mechanism obvious.

**Demo flow:**

1. Create a claim with immutable rules on Swarm.
2. Multiple voters commit hidden votes with stake and conviction.
3. Voting closes.
4. SpaceComputer randomness selects the resolving jury.
5. Selected jurors reveal.
6. Outcome is published.
7. All voters reveal to settle.
8. Winners receive stake plus upside; losers lose their risked portion.

**Judging beats:**

- "There is no oracle."
- "Votes are private until reveal."
- "Randomness selects the resolving jury."
- "Each selected juror counts as one vote — stake decides exposure, not the outcome."
- "Conviction sizes your slash and your share of the winning pool, but never your jury vote."
- "A selected juror who skips reveal forfeits their full stake — roughly 5× the normal slash."
- "Immutable Swarm rules prevent post-stake rule changes."

**Acceptance:**

- One full market lifecycle is demoable end-to-end.
- Submission clearly lists chosen tracks and bounties.
- README explains the trust model and limitations.

---

## Out Of Scope For Hackathon

- Apify as core evidence tooling.
- Operator-decrypted votes.
- External truth oracle integration.
- Full threshold encryption.
- Full governance system.
- Production audit readiness.
- Complex revenue distribution implementation beyond a credible prototype/story.
