# Web App UI Direction

TruthMarket's app should feel like a lightweight social market feed for random-jury belief resolution. The first useful screen is a grid of ongoing markets; marketing copy stays secondary.

## Product Language

Use:

- Up
- Down
- claim/rules document
- committed position
- selected juror
- risked stake
- fixed normal risk
- reveal key
- slashed pool
- revenue distribution pool

Avoid:

- Yes/No in primary user-facing vote controls
- fact-checking
- oracle
- source of truth
- operator reveals votes

The contract still encodes vote values as `1` and `2`; the app maps those values to Up and Down.

## Minimum User Flow

1. Market feed
   - Show several ongoing markets first, similar to a social/trending feed.
   - Each card should expose only the claim, phase, committed stake, commit count, time left, and one clear "Open market" action.
   - Include a visible "Create market" action in the nav and feed toolbar.

2. Focused staking step
   - After opening a market, focus the user on one decision: Up or Down.
   - Then show stake and the fixed normal risk preview.
   - Keep protocol/debug details out of the main path.
   - Store the local reveal key automatically using wallet-local protection where possible.

3. Monitoring dashboard
   - Only show after the user commits.
   - Show the user's committed position, phase, commit count, target jury size, pool, reveal action, and the next required step.
   - Put randomness, audit hash, jury addresses, commitment hash, and local vault status in a developer settings panel.

4. Create market
   - Keep as a secondary but first-class flow, not hidden in developer settings.
   - Claim title, detailed YES meaning, detailed NO meaning, edge cases/Invalid conditions, optional image/reference artifact, voting window, target jury size, and minimum revealed jurors.
   - Upload claim/rules document to Swarm KV before deploying/recording the market.
   - Store only the returned immutable Swarm reference on-chain.
   - After creation, send the creator directly to the focused staking step for the new market.

5. Swarm verification gate
   - Read the current rules pointer from the contract (`swarmReference()`).
   - Fetch the claim/rules document from Swarm.
   - Verify the fetched bytes against the content-addressed Swarm reference.
   - Compare key JSON fields against contract parameters.
   - Keep commit disabled until verification succeeds.

## Commit And Reveal UX

The app must not reveal a user's Up/Down position during the commit phase.

Commit flow:

1. User chooses Up or Down.
2. User enters stake.
3. App shows the fixed normal risk amount (`stake * RISK_PERCENT / 100`; currently 20%).
4. App generates a high-entropy nonce locally.
5. App computes the commitment hash locally.
6. App submits only the commitment hash and stake.
7. App stores the reveal key locally, encrypted with a passphrase or a wallet-derived key.

Production commitment hash must match the contract:

```solidity
keccak256(abi.encode(vote, nonce, voter, block.chainid, address(this)))
```

The prototype uses browser Web Crypto to demonstrate the local-secret flow. Production should use `viem` ABI encoding and `keccak256`.

## Local Secret Model

The operator must never receive the reveal key or the raw vote during commit.

Minimum local safeguards:

- Generate nonce with browser cryptographic randomness.
- Encrypt the reveal key before writing to local storage.
- Require passphrase or wallet-derived key to reveal.
- Allow export/import of the encrypted reveal key for recovery.
- Add a strict content security policy before production to reduce XSS risk.

Important limitation: browser local storage cannot be made "unhackable" against a compromised device or malicious script. The goal is to keep the operator and backend unable to reveal votes, and to reduce client-side leakage.

## Reveal Incentives

All committed voters need to reveal. The UI should not let non-jurors treat reveal as optional.

- Selected juror who does not reveal: forfeits full stake.
- Non-selected voter who does not reveal: cannot prove their side and loses the risked stake.
- Losing revealed voter: loses only risked stake.
- Winning revealed voter: receives stake plus a risked-stake-weighted share of the slashed pool.
- The normal risked stake is fixed by contract `RISK_PERCENT` rather than chosen per vote.

Until the user reveals, the app should not present them as a winner or loser. The outcome panel can show the market outcome, but the wallet-specific settlement state should remain "Reveal required" until their reveal transaction is complete.

## Contract-Aligned Dashboard

After a user commits, the dashboard should become more detailed than onboarding. It should answer:

- What protocol stage is the market in?
- What deadline matters now?
- Has SpaceComputer jury selection happened?
- Was this wallet selected as a juror?
- How many jurors have revealed?
- What does the user need to do next?
- When should the app remind the user?

The app-level lifecycle maps to the current contract as:

1. Voting
   - Contract: `phase() == Voting` and current time is before `votingDeadline()`.
   - User action: `commitVote(commitHash, stake)`.
   - UI state: show time until voting closes and keep position hidden.

2. Jury selection
   - Contract: `phase() == Voting`, current time is after `votingDeadline()`, before `juryCommitDeadline()`, and `randomness() == 0`.
   - Service action: jury committer fetches SpaceComputer randomness from the public IPFS/IPNS beacon and calls `commitJury(randomness, metadata, auditHash)`, including the beacon IPFS address, sequence, timestamp, and cTRNG index.
   - UI state: show loading/progress state for randomness and jury draw.

3. Reveal
   - Contract: `phase() == Reveal`.
   - User action: `revealVote(vote, nonce)`.
   - UI state: show selected jurors from `getJury()`, reveal progress from `revealedJurorCount()`, current counts from `juryYesCount()` / `juryNoCount()` mapped to Up/Down, and time until `revealDeadline()`.

4. Resolve
   - Contract: `phase() == Reveal` and current time is after `revealDeadline()`, or `phase() == Voting` and current time is after `juryCommitDeadline()`.
   - User/service action: anyone may call `resolve()`.
   - UI state: show "ready to resolve" action or automated resolver status.

5. Withdraw
   - Contract: `phase() == Resolved`.
   - User action: `withdraw()`.
   - UI state: show `outcome()`, payout status from `commits(wallet).withdrawn`, and withdraw action.

Useful read model:

- Market phase and deadlines: `phase`, `votingDeadline`, `juryCommitDeadline`, `revealDeadline`
- Market parameters: `targetJurySize`, `minCommits`, `minRevealedJurors`, `minStake`, `protocolFeeBps`
- Claim/rules document: `swarmReference`
- Commit aggregate: `commitCount`, `totalCommittedStake`, `totalRiskedStake`
- Wallet position: `commits(wallet)`, `isJuror(wallet)`
- Jury state: `getJury()`, `revealedJurorCount`, `juryYesCount`, `juryNoCount`
- Randomness audit: `randomness`, `randomnessHash`, `randomnessIpfsAddress`, `randomnessSequence`, `randomnessTimestamp`, `randomnessIndex`, `juryAuditHash`
- Settlement: `outcome`, `distributablePool`, `treasuryAccrued`, `creatorAccrued`, `withdrawnCount`

Reminder triggers:

- Before `votingDeadline`: remind user that voting will close soon if they have not committed.
- At `votingDeadline`: monitor for `commitJury`.
- On `JuryCommitted`: notify committed users that reveal is open and tell selected jurors they are under the full-stake penalty.
- Before `revealDeadline`: remind every committed wallet that has not revealed.
- On `Resolved`: notify revealed users to withdraw and unrevealed users of the settlement consequence.

Agent-oriented clients should run the same lifecycle as a heartbeat watcher. Auto-reveal is allowed only from the agent's own local reveal vault and only when explicit local policy enables it.

## Juror Penalty Pool

For the app narrative, juror non-reveal penalties should be presented as flowing into the revenue distribution pool when the market resolves Up or Down. If the market resolves Invalid, the current contract accrues invalid-path juror penalties to the claim creator. If the intended product behavior is that all juror penalties always go to the revenue distribution pool, the contract and docs should be updated together.

## Visual Direction

- Bright, social, and direct rather than a dark trading terminal.
- Landing page is a grid of active markets.
- Open market leads to a focused staking screen.
- Dashboard appears only after the user commits.
- Up and Down are first-class actions.
- Use color for market energy and Up/Down semantics, but keep the staking step calm and obvious.
- Show mechanism transparency in the dashboard and developer settings without turning the first interaction into documentation.
