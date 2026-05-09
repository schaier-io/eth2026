# TruthMarket Agent Task Board

TruthMarket is a random-jury belief-resolution protocol. It is not a
fact-checker, not an oracle, and not an external truth source.

Use this file as the active agent work board. Keep each item short, mark status
with the boxes below, and move finished implementation facts into `Done`.

## Status Legend

- [x] Done / fixed
- [~] Partly done / needs verification
- [ ] Not done
- [!] Blocked / decision needed

## Do Not Regress

- [x] Say "random-jury belief resolution" or "random-jury belief game".
- [x] Keep Swarm focused on immutable claim/rules documents.
- [x] Keep SpaceComputer randomness central to jury selection.
- [x] Preserve classic commit-reveal; the operator must not reveal votes.
- [x] Keep Apify optional and out of the critical path.
- [x] Avoid "fact-checking oracle", "source of truth", and "operator reveals votes".

## Current Done State

- [x] Product frame changed away from fact-checking/oracle language.
- [x] Solidity core uses fixed 20% normal risked stake.
- [x] Commitment hash binds vote, nonce, voter, chain id, and contract address.
- [x] Non-juror losers and non-revealing non-jurors lose only normal risked stake.
- [x] Selected jurors who fail to reveal forfeit full stake.
- [x] Jury outcome is count-based: one selected juror equals one vote.
- [x] Winner reward distribution is weighted by each winner's risked stake.
- [x] Treasury fee and creator accrual use pull-pattern withdrawals.
- [x] Claim metadata is stored on-chain: name, description, and up to five tags.
- [x] `revokeStake` handles nonce leaks during the voting phase only.
- [x] Contract/events avoid fact-checker and oracle framing.
- [x] ADRs capture core decisions through ADR 0013.

## 1. Product And UI Reframe

Goal: A first-time visitor understands that users are staking on the selected
jury's resolution, not objective truth.

- [x] Canonical product language is documented in `CONTEXT.md`.
- [x] ADR 0013 defines the random-jury game positioning.
- [ ] Replace landing hero copy with game-first copy from ADR 0013.
- [ ] Add a compact flow: commit hidden position -> randomness selects jury -> revealed jury outcome pays.
- [ ] Keep a persistent subtitle such as "random-jury belief game".
- [ ] Replace empirical demo markets with judgment/rubric/community markets.
- [ ] Add examples for agent rubric review, DAO decisions, moderation appeals, creator contests, and community preference.
- [ ] Stake screen says users are staking on the selected jury resolution.
- [ ] Stake screen shows jury size, minimum revealed jurors, and selected-juror full-stake penalty before commit.
- [ ] Result screens say "Jury resolved Up/Down" and "matched/missed jury".
- [ ] Result screens avoid "right", "wrong", "true", or "false" framing.

Acceptance:

- [ ] Visitor understands the random-jury belief game within 5 seconds.
- [ ] Default examples are ambiguous judgment, community preference, or rubric-resolution markets.
- [ ] Commit flow makes the randomness and jury win condition obvious.

## 2. Swarm Immutable Rules

Goal: Every market has immutable rules that voters can inspect and verify before
staking.

- [x] Contract stores an immutable content reference and exact-byte `claimRulesHash`.
- [x] Swarm verification/discovery boundary is documented in ADR 0009.
- [x] `packages/swarm-verified-fetch` exists as a standalone verified-fetch package.
- [ ] Create one canonical claim/rules JSON schema.
- [ ] Upload claim/rules JSON to Swarm during market creation.
- [ ] Store the returned Swarm reference in the market spec.
- [ ] Compute and display `claimRulesHash` before deployment.
- [ ] Fetch by reference in the UI/agent and verify bytes against the contract hash.
- [ ] Block commit when fetched rules do not match `claimRulesHash`.
- [ ] Keep Swarm feeds/KV discovery-only; never use them as canonical market rules.

Acceptance:

- [ ] A voter can read the immutable claim/rules document before commit.
- [ ] UI/agent refuses to commit if the document hash does not match the contract.
- [ ] Rules cannot be quietly changed after market creation.

## 3. Core Contract Tests

Goal: Broaden settlement coverage around the already-implemented contract model.

- [x] Core lifecycle and fixed-risk model are implemented.
- [~] Existing lifecycle tests cover the main happy path and several slash paths.
- [ ] Test losing non-juror receives only refundable stake.
- [ ] Test non-juror non-revealer loses only 1x risked stake.
- [ ] Test selected juror non-revealer loses full stake.
- [ ] Test no selected juror reveals -> Invalid and creator accrual.
- [ ] Test partial-reveal tie -> Invalid and revealing voters refunded.
- [ ] Test small stake that rounds risked stake to zero reverts.
- [ ] Test extreme aggregate stake/revocation pools avoid `uint96` boundary issues.
- [ ] Test paginated dust sweeping preserves unclaimed payouts.

Acceptance:

- [ ] Settlement behavior is covered for Yes, No, Invalid, non-reveal, and dust paths.

## 4. SpaceComputer Jury Selection

Goal: Make randomness selection replayable and judge-legible.

- [x] SpaceComputer-first strategy is documented in ADR 0005.
- [x] Contract records selected jurors and randomness evidence fields.
- [x] Jury draw is replayable from committer list plus posted randomness.
- [ ] Build service command to fetch SpaceComputer cTRNG output from the public IPFS/IPNS beacon.
- [ ] Persist audit artifact with beacon address, sequence, timestamp, cTRNG index, randomness hash, and selected jurors.
- [ ] Submit `commitJury(randomness, metadata, auditHash)` through one clean service operation.
- [ ] Add replay script/process for reviewers.
- [ ] Show randomness proof/evidence in the frontend as the core resolution moment.

Acceptance:

- [ ] Reviewer can see the randomness value, metadata, selected jurors, and replay process.
- [ ] Demo makes SpaceComputer visibly central.

## 5. Frontend Market Lifecycle

Goal: Make one full lifecycle demo understandable without reading contract state.

- [ ] Create market screen verifies immutable rules before deployment/commit.
- [ ] Commit screen shows hidden vote, stake, fixed 20% risk, and selected-juror penalty.
- [ ] Jury screen centers the selected jury and randomness evidence.
- [ ] Reveal screen supports selected jurors and non-selected voters.
- [ ] Settlement screen shows matched/missed jury, refund, slash, bonus, and withdraw state.
- [ ] Add typed client wrapper around generated getters when frontend work starts.

Acceptance:

- [ ] One market can be created, committed to, jury-selected, revealed, resolved, and withdrawn through the app.

## 6. Agent Productization

Goal: An agent can create, verify, commit, reveal, and withdraw without manually
assembling low-level pieces.

- [x] Agent policy, heartbeat, and auto-reveal boundary is documented in ADR 0010.
- [x] Apify agent loop boundary is documented in ADR 0012.
- [ ] Add `truthmarket market create --rules <claim-rules.json> --image <image> --context <artifact> --json`.
- [ ] Add `--dry-run` preview for registry, creator, token, timings, jury size, references, hash, and tx target.
- [ ] Upload rules/image/context artifacts and include optional artifact references in the rules document.
- [ ] Return stable JSON for every agent action: `ok`, `action`, `marketAddress`, `txHash`, `artifactReferences`, `claimRulesHash`, `vaultPath`, `error`.
- [ ] Add token-decimal helpers for human stake amounts.
- [ ] Add approve-and-commit helper with allowance check and 20% risk preview.
- [ ] Make `policy.requireSwarmVerification` block placeholder-reference markets by default.
- [ ] Add safe agent mode for heartbeat, selected-juror urgency, reveal, and withdraw.
- [ ] Write first persona demo: Reddit ambiguity agent creates a market, commits, reveals, and withdraws.

Acceptance:

- [ ] Agent can create a custom market from local rules plus optional artifacts.
- [ ] Agent refuses unsafe placeholder markets when Swarm verification is required.
- [ ] Vote, nonce, and reveal data remain local/private.

## 7. Timing And Market Creation UX

Goal: Creators can choose clear lifecycle timing before deployment.

- [ ] Add timing presets: fast demo, 5 minutes, 1 hour, 24 hours, custom.
- [ ] Validate `votingPeriod`, `adminTimeout`, and `revealPeriod` against on-chain bounds.
- [ ] Show absolute voting, jury-commit, and reveal deadlines before signing.
- [!] Decide whether "1 minute market" means 1 minute per phase or 1 minute total lifecycle.

Acceptance:

- [ ] Creator understands the full lifecycle timing before creating a market.

## 8. Token And Umia Story

Goal: Keep token mechanics simple while making the venture path credible.

- [x] Hackathon story: token is used for staking on claims.
- [x] Venture story: protocol fees can support token staking/revenue share.
- [ ] Pitch deck has a simple revenue model.
- [ ] Demo avoids complex tokenomics.

Deferred:

- [ ] Governance over protocol settings.
- [ ] Claim-creation token requirements.
- [ ] Complex emissions.
- [ ] Multi-token markets.

## 9. ENS Identity Layer

Goal: Optional identity/reputation layer if time allows.

- [x] Production Sybil boundary documented in ADR 0008.
- [ ] Resolve at least one voter, agent, or creator through ENS live.
- [ ] Show ENS identity instead of only raw addresses.
- [ ] Keep used ENS records public-safe.

Boundary:

- [x] ENS is not required for hackathon jury selection.
- [ ] ENS must be live and functional if submitted for a bounty.

## 10. Demo And Submission

Goal: Ship a judge-legible demo that makes the random jury mechanism obvious.

- [ ] Create claim with immutable rules on Swarm.
- [ ] Multiple voters commit hidden votes with stake.
- [ ] Voting closes.
- [ ] SpaceComputer randomness selects the resolving jury.
- [ ] Selected jurors reveal.
- [ ] Outcome is published.
- [ ] All voters reveal to settle.
- [ ] Winners receive stake plus upside; losers lose the risked portion.
- [ ] Submission lists chosen tracks and bounties.
- [ ] README explains trust model and limitations.

Judging beats:

- [x] There is no oracle.
- [x] Votes are private until reveal.
- [x] Randomness selects the resolving jury.
- [x] Each selected juror counts as one vote; stake decides exposure and reward share.
- [x] Normal loser/non-reveal loss is 20% of stake.
- [x] Selected juror non-reveal loss is full stake.
- [x] Immutable Swarm rules prevent post-stake rule changes.

## Out Of Scope For Hackathon

- [x] Apify as core evidence tooling.
- [x] Operator-decrypted votes.
- [x] External truth oracle integration.
- [x] Full threshold encryption.
- [x] Full governance system.
- [x] Production audit readiness.
- [x] Complex revenue distribution beyond credible prototype/story.
