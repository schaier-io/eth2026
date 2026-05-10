# Random-Jury Game Positioning

Status: accepted

TruthMarket should be positioned as a random-jury belief game, not as a truth oracle, fact-checker, or conventional prediction market.

The product mechanic is: users commit hidden staked positions, public randomness selects a resolving jury after voting closes, selected jurors reveal, and the revealed jury majority resolves the market. The product does not promise that the objectively correct answer wins. It promises that the precommitted game rules are followed: randomness selects the jury, the jury decides, and users who matched the jury outcome settle as winners.

This positioning makes luck explicit. If the selected jury resolves against a user's belief, that is not an unfair exception to the system; it is part of the game. Fairness comes from transparent rules, immutable claim/rules documents, auditable randomness, private commit-reveal, and equal juror vote counting once selected.

**Product Language**

Use:

- random-jury belief game
- jury-resolved market
- stake on the selected jury's resolution
- matching the jury outcome
- public randomness selects the jury
- immutable claim/rules document
- selected juror
- committed position

Avoid:

- TruthMarket discovered the truth
- the correct answer won
- fact-checking
- oracle
- source of truth
- guaranteed fair answer
- Apify decides the outcome

**Landing Page Positioning**

The landing page should communicate the game within a few seconds:

> Stake on how a random jury will resolve the claim. There is no oracle and no promised objective truth. Fairness comes from the shared game rules: randomness selects the jury, the jury reveals, and matching the jury outcome wins.

The first screen should lead with the random jury mechanism, not generic market language. A first-time user should understand that the product is about matching a randomly selected jury, not proving a real-world fact.

**Default Market Shape**

Default demo markets should prefer subjective, underdetermined, or rubric-based judgment:

- Did this agent satisfy the bounty rubric?
- Which proposal best matches this community mandate?
- Was this moderation appeal fair under the posted rules?
- Does this submission qualify for payout under the rules?

Empirical claims such as prices, benchmarks, shipping deadlines, and objective real-world events can exist only if they are clearly framed as jury-belief games. They should not be the default examples because they make users expect an oracle.

**Agent/Human Frame**

Humans and agents can both create, stake, reveal, and be selected as jurors if they meet the market's eligibility rules. Agents can discover or propose markets, but agents do not resolve markets unless they are selected jurors under the same rules as everyone else.

The strongest initial wedge is agent work arbitration: agents and humans stake on whether an output satisfies an immutable rubric, then a random jury resolves the market.

**Considered Options**

- Objective truth market: rejected because it makes users expect external verification, creates oracle confusion, and misrepresents the contract.
- Prediction market framing: rejected because it centers future events and real-world correctness, while the actual mechanic centers random jury resolution.
- Pure arbitration protocol: rejected as too dry for the app experience; it hides the stake/luck/game loop that makes the product legible and viral.
- Random-jury belief game: accepted because it makes the luck explicit, keeps SpaceComputer randomness central, and explains why no concrete answer is required.

**Consequences**

- The app must say that matching the selected jury outcome is the win condition.
- Hero copy, market examples, staking screens, dashboards, and result labels must avoid language that implies objective truth was discovered.
- The create flow should steer users toward judgment/rubric markets and warn when a draft looks like a conventional prediction market.
- The legal/risk notice must not be the only first impression. It should still exist, but the game frame needs to be visible before or inside it.
- Copy cannot remove legal risk from staking, payouts, or market creation. Public launch still requires jurisdiction-specific legal review.
