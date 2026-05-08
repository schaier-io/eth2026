# PRD: Random Jury Belief Resolution

## Problem Statement

Prediction and belief markets need a way to resolve contested claims without relying on a centralized oracle, an operator-decrypted vote system, or an external source of truth. The product needs to preserve voter sovereignty, keep votes private during the voting window, make market rules immutable before stake enters the system, and use randomness to select a resolving jury from participants with skin in the game.

The current product direction should be reframed away from "fact-checking" and toward random-jury belief resolution. The system does not claim to know truth. It only resolves a claim according to the revealed belief of a randomly selected staked jury.

## Solution

TruthMarket lets users create immutable claim/rules documents, stake on YES/NO outcomes, privately commit votes, and later reveal votes after SpaceComputer randomness selects a resolving jury. Selected jurors determine the outcome on a one-juror-one-vote basis — stake and conviction do not influence the YES/NO decision. All voters reveal to settle their stake. Winners receive their stake back plus a share of the slashed pool, weighted by their own risked stake. Losers and non-revealing non-jurors lose their risked portion (stake × conviction). Selected jurors who fail to reveal are penalized far more harshly: they forfeit their full stake — at typical conviction levels this is roughly 5× the normal slash.

The product uses Swarm for immutable claim/rules documents, SpaceComputer for random jury selection, and a simple protocol-token story for Umia: protocol-token staking can receive protocol fees/revenue share. ENS is an optional identity/reputation layer. Apify is not core. Sourcify is optional verification hygiene if the bounty remains available and the integration is cheap.

## User Stories

1. As a market creator, I want to create a claim with immutable rules, so that voters know the rules cannot be changed after staking.
2. As a market creator, I want the claim document stored on decentralized storage, so that the market rules remain publicly available.
3. As a market creator, I want to choose voting and reveal deadlines, so that the market has a clear lifecycle.
4. As a market creator, I want to choose a jury size, so that the resolution process fits the claim's risk level.
5. As a voter, I want to read the immutable claim rules before staking, so that I understand what YES and NO mean.
6. As a voter, I want to commit a private vote, so that other voters cannot copy or react to my vote before the reveal phase.
7. As a voter, I want to choose my stake amount, so that I can size my economic exposure.
8. As a voter, I want to choose my conviction level, so that I decide how much of my stake I am willing to risk.
9. As a low-conviction voter, I want to risk only part of my stake, so that I can participate without accepting full downside.
10. As a high-conviction voter, I want a larger share of the slashed-pool reward when I win, so that risking more carries proportional upside even though jury votes are count-based.
11. As a voter, I want the operator to be unable to decrypt my vote, so that my voting sovereignty is preserved.
12. As a voter, I want the protocol to use classic commit-reveal, so that votes stay private until voters reveal them.
13. As a selected juror, I want to know I was selected by randomness, so that I understand why my reveal determines the outcome.
14. As a selected juror, I want my reveal to count toward the market outcome, so that my staked belief participates in resolution.
15. As a non-selected voter, I want to reveal after outcome selection, so that I can settle my stake and claim any reward.
16. As a winning voter, I want my stake returned plus upside, so that correct belief and risk-taking are rewarded.
17. As a losing voter, I want only my chosen risked portion slashed, so that my loss matches my conviction.
18. As a non-revealing non-juror voter, I want clear consequences (lose my risked portion), so that I understand unrevealed votes cannot claim funds.
18a. As a selected juror, I want to know that skipping reveal forfeits my full stake (~5× the normal slash), so that I am incentivized to follow through once selected.
19. As a market observer, I want to see which jurors were selected, so that the resolution process is transparent.
20. As a market observer, I want to see the SpaceComputer randomness used for selection, so that I can audit the jury draw.
21. As a market observer, I want a replayable jury-selection process, so that I can verify jurors were selected deterministically.
22. As a market observer, I want to see the final outcome and payout summary, so that I understand how the market settled.
23. As a protocol participant, I want jury voting decoupled from stake (1 juror = 1 vote), so that the YES/NO outcome cannot be captured by capital alone.
24. As a large staker, I want a larger reward share than a small staker when I win, so that risking more capital still carries proportional upside.
25. As a small staker, I want whale influence on the YES/NO decision eliminated, so that the random jury's count-based outcome stays meaningfully plural.
26. As a protocol-token staker, I want to receive protocol fees or revenue share, so that staking the protocol token has a simple value-capture reason.
27. As a judge, I want the demo to avoid external truth claims, so that the mechanism is clear and not confused with an oracle.
28. As a judge, I want to see SpaceComputer used in the core flow, so that the sponsor integration is meaningful.
29. As a judge, I want to see Swarm used for immutable rules, so that decentralized storage is not a cosmetic add-on.
30. As a judge, I want to understand the token story quickly, so that the Umia venture angle is credible.
31. As a future operator, I want configurable market parameters, so that different claim classes can have different jury sizes and deadlines.
32. As a future operator, I want identity and reputation hooks, so that reliable voters or agents can become recognizable over time.
33. As an ENS-identified participant, I want my identity displayed in the UI, so that users can recognize me without reading raw addresses.
34. As a developer, I want the contract source verified if practical, so that users can inspect the rules being enforced.
35. As a developer, I want the hackathon scope to exclude Apify as core infrastructure, so that the build stays focused on random-jury resolution.

## Implementation Decisions

- The product is a random-jury belief-resolution market, not a fact-checking oracle.
- The protocol does not decide external truth. It resolves outcomes from selected juror reveals.
- Swarm stores immutable claim/rules documents.
- The contract stores the Swarm reference for each claim.
- Votes use classic commit-reveal to preserve voter sovereignty.
- Operator-encrypted votes are rejected for the hackathon design because they make the operator a privileged reveal service.
- SpaceComputer randomness is the core sponsor integration and selects the resolving jury from committed voters.
- The hackathon version can use an off-chain service to fetch randomness and post selected jurors, but the selection must be replayable.
- Juror resolution is count-based: each selected juror contributes 1 vote, regardless of stake or conviction (see [ADR 0006](./adr/0006-count-based-jury-voting.md)).
- Conviction controls the portion of stake at risk.
- Conviction affects reward upside (winners' share of the slashed pool is weighted by their own risked stake) but does not affect the YES/NO outcome.
- All voters must reveal to settle their stake.
- Selected jurors determine the outcome.
- Non-selected voters do not determine the outcome but reveal to prove whether they won or lost.
- Losing voters lose only their risked portion, not necessarily their full stake.
- Non-revealing non-juror voters lose the risked portion because unrevealed votes cannot be classified as winning or losing.
- Selected jurors who fail to reveal forfeit their full stake (~5× a typical normal slash); the extra above the normal 1× risked portion joins the distributable pool on a Yes/No outcome or accrues to the treasury on Invalid.
- Winning voters receive stake back plus a share of slashed stake, weighted by their own risked stake.
- Jury size is constrained to be odd (≤ 100). Even-count partial reveals can still tie → Invalid.
- The token story for the hackathon is limited to staking and protocol fee/revenue share.
- Governance, claim-creation token requirements, and complex emissions are deferred.
- ENS is optional and should be pursued only if it can be live and functional.
- Apify is optional and not part of the core product.
- Sourcify is optional verification hygiene if the bounty remains active.

## Implementation Modules

- **Market lifecycle contract:** owns claim creation, voting phase transitions, jury commitment, reveal, resolution, payout, and treasury fee transfer.
- **Commitment module:** owns commitment hash construction and verification, including vote, nonce, stake, conviction, voter, and claim id so commitments cannot be replayed or copied across contexts.
- **Conviction accounting module:** owns risked stake, refundable stake, slashed-pool accounting (including the juror full-stake penalty extras), winner reward weights, and payout math.
- **Jury voting module:** owns count-based outcome resolution from selected juror reveals (`juryYesCount`/`juryNoCount`), tie-to-Invalid behavior, and the minimum-revealed-jurors gate.
- **Jury selection service:** fetches SpaceComputer randomness, reads committed voters, deterministically selects jurors, persists/references the randomness audit artifact, and submits selected jurors on-chain.
- **Swarm claim document service:** creates, validates, uploads, fetches, and optionally verifies immutable claim/rules documents.
- **Demo frontend:** presents immutable rules, stake/conviction controls, commit/reveal states, selected jurors, randomness audit data, and settlement results.
- **Optional identity adapter:** resolves ENS names and records for creators, voters, or agents without making ENS required for market operation.

## Testing Decisions

- Tests should focus on externally visible protocol behavior, not implementation details.
- The claim lifecycle should be tested end-to-end: create claim, commit votes, close voting, select jury, reveal, resolve, withdraw.
- Commit privacy should be tested by verifying no vote is known from the commitment alone.
- Jury selection integration should be tested with deterministic mocked randomness.
- Count-based jury outcome should be tested with mixed stakes/convictions to confirm the YES/NO decision tracks juror count, not stake.
- Partial slashing should be tested for low-conviction and full-conviction non-juror losers/non-revealers.
- Winner payout should be tested to confirm winners receive returned stake plus slashed-pool upside, weighted by their own risked stake.
- Losing payout should be tested to confirm only the risked portion is slashed for non-juror losers.
- Non-reveal behavior should be tested for both non-juror non-revealers (1× risked slash) and selected jurors (full-stake slash, conviction ignored).
- Juror full-stake penalty should be tested at low conviction to confirm the slash is independent of the original conviction setting.
- Invalid or under-revealed market behavior should be defined and tested once the fallback rule is finalized.
- Swarm upload/fetch behavior should be tested at the service boundary with fixture claim documents.
- UI tests, if added, should verify the user can understand immutable rules, commit stake, see selected jurors, reveal, and inspect settlement.

## Out of Scope

- External truth oracles.
- Fact-checking as the product category.
- Operator-decrypted votes.
- Threshold encryption.
- Apify as a critical dependency.
- Full protocol governance.
- Full production tokenomics.
- Full on-chain cTRNG verification.
- Production-grade audit hardening.
- Multi-outcome markets beyond YES/NO.
- Full ENS reputation system unless time allows.

## Further Notes

The strongest hackathon story is SpaceComputer-first. The core demo should make randomness visually and mechanically central. Swarm should be framed as immutable rule storage, not evidence storage. Umia should be framed around a credible venture path where protocol-token stakers receive protocol fees or revenue share. The demo should repeatedly emphasize that TruthMarket is not a truth oracle: it is a sovereign, private, staked belief-resolution mechanism.
