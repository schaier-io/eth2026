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

> A belief-resolution protocol where staked voters privately commit to claims, SpaceComputer randomness selects a resolving jury, and the count majority of revealing jurors determines the outcome. Stake sizes economic exposure and reward share; the normal losing/non-reveal slash is fixed at 20% of stake.

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

## Stage 1A — Positioning And App UI Reframe

**Goal:** Reposition the landing page and app UI around the random-jury belief game described in [ADR 0013](./docs/adr/0013-random-jury-game-positioning.md).

**Decision summary:** Users stake on how a randomly selected jury will resolve a claim. Randomness and luck are part of the game. Winning means matching the selected jury outcome, not being objectively correct.

**Landing page tasks:**

- [ ] Replace generic hero copy with a game-first headline and subtitle from ADR 0013.
- [ ] Add a compact "How it works" strip: commit hidden position -> randomness selects jury -> revealed jury outcome pays.
- [ ] Rework the demo risk modal so the random-jury game frame is visible before or inside the notice.
- [ ] Pair "TruthMarket" with a persistent subtitle such as "random-jury belief game" if the name stays.

**Market example tasks:**

- [ ] Replace empirical/prediction-style demo markets with subjective, underdetermined, or rubric-based markets.
- [ ] Add an agent-evaluation example: "Did this agent satisfy the bounty rubric?"
- [ ] Add a DAO/community example: "Which proposal best matches this community mandate?"
- [ ] Add a moderation/judgment example: "Was this moderation appeal fair under the posted rules?"
- [ ] Add a creator/work review example: "Does this submission qualify for payout under the rules?"

**Stake screen tasks:**

- [ ] Add a pre-commit sentence: "You are staking on the selected jury's resolution, not on an objective answer."
- [ ] Show the target jury size, minimum revealed jurors, and selected-juror full-stake penalty before the commit button.
- [ ] Add a "luck boundary" note: "The jury is selected after commit by public randomness. If the selected jury leans against you, that is part of the game."
- [ ] Ensure the Up/Down meanings are written as jury-resolution rules: "The jury should resolve Up if..." and "The jury should resolve Down if..."

**Create flow tasks:**

- [ ] Replace the default "Will..." placeholder with a judgment-market prompt such as "What should the jury resolve?"
- [ ] Add market templates for agent review, DAO decision, moderation appeal, creator contest, and community taste/vibe decisions.
- [ ] Add a creator warning when a draft looks like an objective prediction-market claim instead of a jury-belief claim.
- [ ] Add fields for "what jurors should consider" and "what jurors should ignore" in the claim/rules document.

**Dashboard/result tasks:**

- [ ] Rename result language from "Outcome: YES/NO" to "Jury resolved Up/Down" in user-facing surfaces.
- [ ] Show "selected jury" as the central status object after voting closes.
- [ ] Make the randomness proof visible as the reason the jury is legitimate.
- [ ] Show final settlement as "matched jury" or "missed jury," not "right" or "wrong."

**Agent/human positioning tasks:**

- [ ] Explain that both humans and agents can create, stake, reveal, and be selected as jurors if eligible.
- [ ] Use agent-rubric markets as the first serious wedge: agents create work, humans/agents stake on whether it satisfies a rubric, and the random jury resolves.
- [ ] Keep Apify as a market discovery/input agent, not as a resolver or truth source.

**Acceptance:**

- A first-time visitor understands within 5 seconds that this is a random-jury belief game.
- The landing page does not sound like an oracle, fact-checker, or conventional prediction market.
- Default markets demonstrate ambiguous judgment, community preference, or rubric resolution.
- Before committing, users see that randomness selects the jury and that matching the jury is the win condition.
- Result copy never implies the protocol discovered objective truth.

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
- target jury size
- fixed normal risk percentage
- stake token
- creator address or identity

**Contract relationship:**

- Contract stores the Swarm reference and a hash of the exact claim/rules document bytes.
- UI fetches the claim document from Swarm.
- UI verifies the fetched bytes against the contract-stored hash before enabling commit.
- Voters stake only after seeing the immutable rules.

**Mutable Swarm discovery:**

- Swarm feeds/KV may store market indexes and creator indexes.
- Feed/KV data is discovery-only and must not define market rules, outcomes, votes, selected jurors, or payouts.
- Opening a market from a feed still requires reading the contract and verifying the immutable Swarm claim/rules document.

**Acceptance:**

- A claim can be uploaded to Swarm.
- The contract stores the returned Swarm reference.
- The contract stores `claimRulesHash` for the exact JSON bytes.
- The frontend can fetch and display the claim/rules document.
- The frontend can verify the document before commit.
- The UI communicates that rules cannot be changed after market creation.

---

## Stage 3 — Commit Phase

**Goal:** Voters privately stake on a YES/NO belief without revealing their vote.

**Voter inputs:**

- claim id
- vote commitment
- stake amount

**Fixed Normal Risk:**

The normal risked stake is fixed at 20% of the committed stake. A losing voter or non-revealing non-juror loses this normal risked amount.

Example:

- stake: 100 tokens
- normal loss if wrong: 20 tokens
- refund if wrong: 80 tokens

Selected jurors who fail to reveal still lose their full stake.

**Privacy model:**

- Use classic commit-reveal.
- The protocol/operator must not be able to decrypt or reveal votes.
- Voters keep sovereignty over their vote and nonce.

**Acceptance:**

- Voters can commit a hidden vote with stake.
- No vote is visible before reveal.
- The contract tracks voter stake and derives the fixed 20% normal risked stake.

---

## Stage 4 — SpaceComputer Jury Selection

**Goal:** Use SpaceComputer randomness to select the resolving jury from committed voters.

**Flow:**

1. Voting closes.
2. Off-chain service fetches SpaceComputer cTRNG output from the public IPFS/IPNS beacon.
3. The cTRNG response, beacon IPFS address, sequence, timestamp, cTRNG index, and randomness hash are preserved for audit.
4. The service deterministically selects `targetJurySize` voters from the committer set.
5. The posted randomness, beacon metadata, and audit hash are committed on-chain.

**Trust boundary:**

- Hackathon version may use an off-chain service to post jurors.
- The selection must be replayable from the committer list and randomness.
- Future version can harden this with on-chain verification or signed cTRNG attestations.

**Acceptance:**

- A reviewer can see the randomness value, randomness hash, SpaceComputer IPFS address, beacon sequence/timestamp/index, selected jurors, and replay script/process.
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
- stake does not influence the YES/NO decision;
- target jury size is constrained to be odd (≤ 100); on full reveal, ties are impossible;
- on partial reveal with an even count of revealing jurors, ties resolve to Invalid.

**Reward weighting:**

- Winner reward share is weighted by the winner's own `riskedStake` (= stake × `RISK_PERCENT` / 100).
- Larger-stake winners take more absolute downside risk and receive a larger reward share if right.

**Juror non-reveal penalty:**

- Selected jurors who skip reveal forfeit their full stake (5× the fixed 20% normal slash).
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

**Production Sybil boundary:** Future production markets must require identity-backed or eligibility-backed voter/jury entry before count-based jury voting is considered Sybil-resistant. The hackathon contract remains address-based for demo speed; see [ADR 0008](./docs/adr/0008-identity-required-for-sybil-resistance.md).

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
2. Multiple voters commit hidden votes with stake.
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
- "Losing voters and non-revealing non-jurors lose 20%; stake size controls absolute exposure and reward share."
- "A selected juror who skips reveal forfeits their full stake — 5× the normal slash."
- "Immutable Swarm rules prevent post-stake rule changes."

**Acceptance:**

- One full market lifecycle is demoable end-to-end.
- Submission clearly lists chosen tracks and bounties.
- README explains the trust model and limitations.

---

## Stage 9 — Agentic Market Productization

**Goal:** Make the agent experience feel like a complete product flow: an AI agent can create a market with its own public artifacts, discover/access markets, vote with stake, reveal from its local vault, and withdraw after settlement without hand-assembling low-level pieces.

**Current issues to fix:**

- Agent market creation still feels like an operator toolkit. The agent needs prepared env vars, policy files, wallet setup, a `MarketSpec`, and sometimes placeholder `ipfsHash` behavior before it can create a market.
- Public artifact upload is not first-class. Agents should be able to upload their own claim/rules document, optional image, and public context artifact to Swarm/IPFS, then create a market from those references.
- Manual market creation is too raw. A user or agent has to hand-build `MarketSpec` JSON instead of using a guided command that validates fields and shows what will be deployed.
- Creator-controlled timing is not visible enough in the agent flow. Creators should be able to choose market lifecycle presets such as fast demo, 5 minutes, 1 hour, 24 hours, or custom voting/admin/reveal windows before deployment.
- Stake/vote flow still exposes base-unit complexity. Agents should get token-decimal helpers, allowance checks, dry-run previews, and clear risk summaries before signing.
- Verification is correct in principle but not packaged well. Agents need one clear create/verify/commit path that refuses unsafe placeholder markets when policy requires real Swarm verification.
- The safe unattended-agent loop is not obvious enough. Policy, encrypted reveal vault, heartbeat, selected-juror urgency, and withdraw should feel like one operating mode, not separate concepts.
- The first target agent persona is still too broad. Optimize first for one concrete loop, such as a Reddit ambiguity agent that creates markets from public disputed posts and later votes/reveals under local policy.

**Fix list:**

- [ ] Add a single agent-native create command, for example `truthmarket market create --rules <claim-rules.json> --image <image> --context <artifact> --json`.
- [ ] Upload claim/rules JSON to Swarm/IPFS and use the returned immutable reference in the market spec.
- [ ] Support optional image/context artifact upload and include those references in the claim/rules document, not as canonical contract state.
- [ ] Compute and display `claimRulesHash` before market creation; after deployment, read the contract and verify the uploaded bytes still match.
- [ ] Add a `--dry-run`/preview mode for market creation that prints the exact registry, creator, stake token, timings, jury size, min commits, uploaded references, and expected transaction target.
- [ ] Add creator-configurable timing inputs with presets and custom values for `votingPeriod`, `adminTimeout`, and `revealPeriod`; validate against the on-chain 1 minute minimum and 365 day maximum per phase, and show the resulting absolute voting, jury-commit, and reveal deadlines before signing.
- [ ] Decide whether "1 minute market" means 1 minute per phase or 1 minute total lifecycle. The current contract supports 1 minute minimum per phase, so a true 1 minute total market requires a contract/design change.
- [ ] Add token-decimal helpers for stake input so agents can pass human amounts while the CLI safely converts to base units.
- [ ] Add an approve-and-commit helper or guided sequence that checks allowance, shows normal 20% risk, previews the commitment action, then commits.
- [ ] Return stable JSON for every agent action with `ok`, `action`, `marketAddress`, `txHash`, `artifactReferences`, `claimRulesHash`, `vaultPath`, and `error` where applicable.
- [ ] Make `policy.requireSwarmVerification` block generated placeholder markets by default unless a matching local document is supplied.
- [ ] Add a single "safe agent mode" command or documented sequence that starts heartbeat monitoring after commit and handles reveal/withdraw according to local policy.
- [ ] Add a dedicated README/demo for the first target agent persona: create a market from a public Reddit ambiguity, upload artifacts, create market, commit a vote, reveal, and withdraw.

**Acceptance:**

- An agent can create a custom market from a local rules document plus optional image/context artifact without hand-writing a full `MarketSpec`.
- The created market stores an immutable rules reference and a verifiable `claimRulesHash`.
- The creator can choose lifecycle timing before deployment, including fast demo, 5 minute, 1 hour, 24 hour, and custom timing paths within protocol bounds.
- Agents that require Swarm verification refuse to commit on placeholder-reference markets.
- The CLI can preview create/approve/commit actions before signing.
- Vote, nonce, and reveal data remain local/private and are never uploaded to Swarm/IPFS/Apify.
- The first persona demo runs end-to-end with machine-readable JSON output for every step.

---

## Out Of Scope For Hackathon

- Apify as core evidence tooling.
- Operator-decrypted votes.
- External truth oracle integration.
- Full threshold encryption.
- Full governance system.
- Production audit readiness.
- Complex revenue distribution implementation beyond a credible prototype/story.
