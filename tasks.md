# TruthMarket Agent Task Board

TruthMarket is a random-jury belief-resolution protocol. It is not a
fact-checker, not an oracle, and not an external truth source.

Use this file as the active agent work board. Keep each item short, mark status
with the boxes below, and move finished implementation facts into `Done`.

Last reviewed: 2026-05-10 Europe/Prague (Swarm/Sourcify verification link fix).

## Status Legend

- [x] Done / fixed
- [~] Partly done / needs verification
- [ ] Not done
- [!] Blocked / decision needed

## Review Snapshot

- [x] Solidity core and `MarketRegistry` clone factory are implemented and covered by broad Foundry tests.
- [x] CLI can create markets, commit/reveal/withdraw, fetch SpaceComputer randomness, verify Swarm rules, and run a foreground heartbeat.
- [x] Web app can list registry markets, launch claim/rules documents to Swarm, open market details, commit/reveal/withdraw, and show jury/randomness receipts.
- [~] Product copy is still behind ADR 0013; several screens still say "truth", "claim", or "verdict" instead of the random-jury belief-game frame.
- [~] Swarm verification is visible in UI and enforceable by CLI policy; badge links now open verified claim JSON, but the browser commit flow still does not hard-block unverified rules.
- [~] Sepolia evidence exists for deployment, agent market creation, and one commit; full live lifecycle evidence is still missing.

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
- [x] Claim metadata lives in the immutable Swarm/Bee claim document; the clone stores only the Swarm reference.
- [x] `revokeStake` handles nonce leaks during the voting phase only.
- [x] Contract/events avoid fact-checker and oracle framing.
- [x] ADRs capture core decisions through ADR 0013.
- [x] `MarketRegistry` deploys EIP-1167 minimal clones and records an append-only discovery index.
- [x] Per-clone market config includes stake token, jury committer, Swarm reference, timings, jury parameters, min stake, and optional creator bond.
- [x] Creator bond gating is implemented: voters wait until the creator posts the bond; bond joins winner payouts on Yes/No and returns on Invalid.
- [x] CLI policy, encrypted local reveal vault, heartbeat, and browser local reveal vault exist.
- [x] Apify agent runtime exists in `agents/apify` with `agent tick` and `agent run` adapters in the CLI.
- [x] Apify Reddit generator targets authenticity-disputed subs and the `trudax/reddit-scraper-lite` input schema; live runs surface real candidates (ADR 0014).
- [x] Local MVP walkthrough and Sepolia deployment evidence are documented.
- [x] Web app defaults to Sepolia (chain id 11155111) instead of Foundry across `lib/server/viem.ts`, `lib/wagmi.ts`, `WalletPill`, `my-markets`, and `deploy`; chain pill and footer now read "Sepolia"; repo-root `/.env` aligned with the Sepolia registry from `f0114db` (`0xbDdC1066…7595517`), Sepolia stake token, and `NEXT_PUBLIC_JURY_COMMITTER` / `NEXT_PUBLIC_SWARM_GATEWAY_URL`.
- [x] Outcome labels render as green ▲ / red ▼ (with `outcome-arrow up|down` spans, `aria-label` preserved) on home phase pill, market-detail outcome pill + jury verdict tally, and the VotePanel commit buttons / committed-vote line / reveal-time line / verdict headline; demo `DirectionSummary` strips the visible "Upward signal / Downward signal" copy to triangle-only.
- [x] Wallet connectors restored: `@metamask/connect-evm`, `@coinbase/wallet-sdk`, and `@walletconnect/ethereum-provider` were declared in `package.json` but missing from `node_modules`; `npm install` re-hydrated 368 packages so MetaMask SDK + Coinbase Wallet picker work (WalletConnect still needs a `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`).
- [x] Swarm verified badges now route through `/api/swarm/claim-doc?reference=...`, which verifies the contract-stored KV reference and exposes the resolved `/bytes/<claim-json-reference>` URL instead of opening the gateway's 404-prone `/bzz/<kv-index>/` route.
- [x] Sourcify verification route and badge resolve for the Sepolia registry implementation (`0x8179...8a7F`), with clone bytecode checked before showing "Sourcify verified".
- [x] Home page now displays the hourly Apify Reddit agent countdown and states the generated market cadence/lifetime as 60 min / 60 min.

## 1. Product And UI Reframe

Goal: A first-time visitor understands that users are staking on the selected
jury's resolution, not objective truth.

- [x] Canonical product language is documented in `CONTEXT.md`.
- [x] ADR 0013 defines the random-jury game positioning.
- [ ] Replace landing hero copy with game-first copy from ADR 0013.
- [~] Add a compact flow: commit hidden position -> randomness selects jury -> revealed jury outcome pays.
- [ ] Keep a persistent subtitle such as "random-jury belief game".
- [~] Replace empirical demo markets with judgment/rubric/community markets.
- [~] Add examples for agent rubric review, DAO decisions, moderation appeals, creator contests, and community preference.
- [~] Stake screen says users are staking on the selected jury resolution.
- [~] Stake screen shows jury size, minimum revealed jurors, and selected-juror full-stake penalty before commit.
- [~] Result screens say "Jury resolved YES/NO" and "matched/missed jury" — visible YES/NO text is now a green ▲ / red ▼ glyph (with `aria-label`); the "matched / missed jury" framing is still pending.
- [ ] Result screens avoid "right", "wrong", "true", or "false" framing.

Acceptance:

- [~] Visitor understands the random-jury belief game within 5 seconds.
- [~] Default examples are ambiguous judgment, community preference, or rubric-resolution markets.
- [~] Commit flow makes the randomness and jury win condition obvious.

## 2. Swarm Immutable Rules

Goal: Every market has immutable rules that voters can inspect and verify before
staking.

- [x] Contract stores only the immutable Swarm reference for the claim/rules document.
- [x] Swarm verification/discovery boundary is documented in ADR 0009.
- [x] `packages/swarm-verified-fetch` exists as a standalone verified-fetch package.
- [~] Create one canonical claim/rules JSON schema (`truthmarket.claim.v1` exists; add full PRD fields for timing/jury/risk).
- [x] Upload claim/rules JSON to Swarm during web, CLI registry, and default agent market creation.
- [x] Store the returned Swarm reference in the market spec.
- [~] Display the Swarm reference and gateway URL before deployment/signing.
- [x] Fetch by reference in the UI/CLI and verify bytes against the contract-stored reference.
- [x] Market detail Swarm badge opens the verified claim JSON via the gateway `/bytes/<reference>` endpoint, not the KV index root.
- [~] Block commit when fetched rules cannot be verified from the contract-stored Swarm reference.
- [x] Keep Swarm feeds/KV discovery-only; never use mutable data as canonical market rules.

Acceptance:

- [x] A voter can read the immutable claim/rules document before commit.
- [~] UI/agent refuses to commit if the document cannot be verified from the contract-stored Swarm reference.
- [x] Rules cannot be quietly changed after market creation.

## 3. Core Contract Tests

Goal: Broaden settlement coverage around the already-implemented contract model.

- [x] Core lifecycle and fixed-risk model are implemented.
- [x] Existing lifecycle tests cover the main happy path, invalid paths, revocation, juror penalties, dust, and registry clones.
- [~] Test losing non-juror receives only refundable stake.
- [~] Test non-juror non-revealer loses only 1x risked stake.
- [x] Test selected juror non-revealer loses full stake.
- [~] Test no selected juror reveals -> Invalid and creator accrual.
- [ ] Test partial-reveal tie -> Invalid and revealing voters refunded.
- [x] Test small stake that rounds risked stake to zero reverts.
- [x] Test extreme aggregate stake/revocation pools avoid `uint96` boundary issues.
- [x] Test paginated dust sweeping preserves unclaimed payouts.
- [x] Test MarketRegistry clone creation, indexing, creator lookup, pagination, and implementation guards.
- [x] Test creator bond gating, post-bond flow, Yes/No payout path, and Invalid refund path.

Acceptance:

- [~] Settlement behavior is covered for Yes, No, Invalid, non-reveal, and dust paths.

## 4. SpaceComputer Jury Selection

Goal: Make randomness selection replayable and judge-legible.

- [x] SpaceComputer-first strategy is documented in ADR 0005.
- [x] Contract records selected jurors and randomness evidence fields.
- [x] Jury draw is replayable from committer list plus posted randomness.
- [x] Build service command to fetch SpaceComputer cTRNG output from the public IPFS/IPNS beacon.
- [~] Persist audit artifact with beacon address, sequence, timestamp, cTRNG index, randomness hash, and selected jurors.
- [x] Submit `commitJury(randomness, metadata, auditHash)` through one clean service operation.
- [~] Add replay script/process for reviewers.
- [x] Show randomness proof/evidence in the frontend as the core resolution moment.

Acceptance:

- [~] Reviewer can see the randomness value, metadata, selected jurors, and replay process.
- [x] Demo makes SpaceComputer visibly central.

## 5. Frontend Market Lifecycle

Goal: Make one full lifecycle demo understandable without reading contract state.

- [x] Contract stores only the Swarm reference for the claim/rules document.
- [x] UI fetches and displays the claim/rules document from Swarm.
- [~] UI verifies the fetched document from the contract-stored reference before enabling commit.
- [~] Create market screen stores immutable rules before deployment/commit.
- [~] Commit screen shows hidden vote, stake, fixed 20% risk, and selected-juror penalty.
- [~] Voters stake only after seeing the immutable rules.
- [x] Jury screen centers the selected jury and randomness evidence.
- [x] Reveal screen supports selected jurors and non-selected voters.
- [~] Settlement screen shows matched/missed jury, refund, slash, bonus, and withdraw state.
- [~] Add typed client wrapper around generated getters when frontend work starts.
- [x] Web app lists registry markets and hides unrecognized/unverified clone registrations.
- [x] Web app supports creator-bond posting and post-resolution creator/treasury withdrawals.

Acceptance:

- [~] One market can be created, committed to, jury-selected, revealed, resolved, and withdrawn through the app.

## 6. Agent Productization

Goal: An agent can create, verify, commit, reveal, and withdraw without manually
assembling low-level pieces.

- [x] Agent policy, heartbeat, and auto-reveal boundary is documented in ADR 0010.
- [x] Apify agent loop boundary is documented in ADR 0012.
- [x] A claim can be uploaded to Swarm.
- [x] The contract stores the returned Swarm reference.
- [x] The frontend can fetch and display the claim/rules document.
- [~] The frontend/CLI can verify the document before commit.
- [~] The UI communicates that rules cannot be changed after market creation.
- [~] Add `truthmarket market create --rules <claim-rules.json> --image <image> --context <artifact> --json`.
- [ ] Add `--dry-run` preview for registry, creator, token, timings, jury size, references, hash, and tx target.
- [~] Upload rules/image/context artifacts and include optional artifact references in the rules document.
- [~] Return stable JSON for every agent action: `ok`, `action`, `marketAddress`, `txHash`, `artifactReferences`, `swarmReference`, `vaultPath`, `error`.
- [~] Add token-decimal helpers for human stake amounts.
- [~] Add approve-and-commit helper with allowance check and 20% risk preview.
- [~] Make `policy.requireSwarmVerification` block placeholder-reference markets by default.
- [~] Add safe agent mode for heartbeat, selected-juror urgency, reveal, and withdraw.
- [~] Write first persona demo: Reddit ambiguity agent creates a market, commits, reveals, and withdraws.
- [x] Add `truthmarket agent tick` and `truthmarket agent run` with local dedupe state.
- [x] Add local policy gates for create-market, max stake, Swarm verification, and jury commit.
- [x] Pivot Apify Reddit generator to authenticity-disputed subs (`IsItBullshit, IsItAI, Scams, nottheonion, quityourbullshit`), emit the `trudax/reddit-scraper-lite` input schema, and filter dataset items to `dataType: "post"` so comment bodies do not become market titles (ADR 0014).
- [x] Refresh `docs/agent/sample-items.json` so the offline `agent tick --items-file` demo passes the new allowlist.
- [x] Keep vote nonce and reveal data in local vault/browser storage, not Swarm.

Acceptance:

- [~] Agent can create a custom market from local rules plus optional artifacts.
- [~] Agent refuses unsafe placeholder markets when Swarm verification is required.
- [x] Vote, nonce, and reveal data remain local/private.

## 7. Timing And Market Creation UX

Goal: Creators can choose clear lifecycle timing before deployment.

- [x] Add timing presets: 5 minutes, 1 hour, 24 hours, 1 week, custom.
- [~] Validate `votingPeriod`, `adminTimeout`, and `revealPeriod` against on-chain bounds.
- [ ] Show absolute voting, jury-commit, and reveal deadlines before signing.
- [x] Decide whether "1 minute market" means 1 minute per phase or 1 minute total lifecycle: duration presets are total lifecycle split 40/20/40, with 60s minimum per phase.

Acceptance:

- [~] Creator understands the full lifecycle timing before creating a market.

## 8. Token And Umia Story

Goal: Keep token mechanics simple while making the venture path credible.

- [x] Hackathon story: token is used for staking on claims.
- [x] Venture story: protocol fees can support token staking/revenue share.
- [ ] Pitch deck has a simple revenue model.
- [x] Demo avoids complex tokenomics.

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

- [~] Create claim with immutable rules on Swarm.
- [~] Multiple voters commit hidden votes with stake.
- [ ] Voting closes.
- [ ] SpaceComputer randomness selects the resolving jury.
- [ ] Selected jurors reveal.
- [ ] Outcome is published.
- [ ] All voters reveal to settle.
- [ ] Winners receive stake plus upside; losers lose the risked portion.
- [ ] Submission lists chosen tracks and bounties.
- [~] README explains trust model and limitations.
- [x] Sepolia deployment addresses, transactions, agent-created market, and first commit are recorded in `docs/evidence.md`.
- [x] Local anvil MVP walkthrough is documented in `docs/mvp-demo.md`.
- [ ] Surface periodic Apify market creation in the web app: status panel reading `~/.truthmarket/agent-state.json` (Apify run id, candidate, market address, tx hash, timestamps) plus an activity feed so judges can see the agent creating dynamic markets over time.

Judging beats:

- [x] There is no oracle.
- [x] Votes are private until reveal.
- [x] Randomness selects the resolving jury.
- [x] Each selected juror counts as one vote; stake decides exposure and reward share.
- [x] Normal loser/non-reveal loss is 20% of stake.
- [x] Selected juror non-reveal loss is full stake.
- [x] Immutable Swarm rules prevent post-stake rule changes.
- [~] Reviewer can see the randomness value, randomness hash, SpaceComputer IPFS address, beacon sequence/timestamp/index, selected jurors, and replay script/process.
- [x] The frontend shows jury selection as the SpaceComputer-powered core moment.

## Out Of Scope For Hackathon

- [x] Apify as core evidence tooling.
- [x] Operator-decrypted votes.
- [x] External truth oracle integration.
- [x] Full threshold encryption.
- [x] Full governance system.
- [x] Production audit readiness.
- [x] Complex revenue distribution beyond credible prototype/story.
