# Web App UI Direction

TruthMarket's app should feel like a live market terminal for random-jury belief resolution. The first useful screen is the active market board; marketing copy stays secondary.

## Product Language

Use:

- Up
- Down
- claim/rules document
- committed position
- selected juror
- conviction
- risked stake
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

## Minimum Screens

1. Market board
   - Active markets, phase, time left, committed stake, commit count, jury size.
   - Wallet/account status.
   - Create market entry point.

2. Market terminal
   - Immutable claim/rules summary.
   - Up/Down committed-position controls.
   - Stake input.
   - Conviction slider.
   - Risked stake and refundable stake preview.
   - Local reveal-key vault status.
   - Jury selection panel with SpaceComputer randomness and audit hash.
   - Reveal panel for all committed voters.
   - Resolution and withdrawal panel.

3. Create market
   - Claim title, description, Up meaning, Down meaning, resolution rules, voting deadline, reveal deadline, jury size, min stake.
   - Upload claim/rules document to Swarm before deploying/recording the market.

## Commit And Reveal UX

The app must not reveal a user's Up/Down position during the commit phase.

Commit flow:

1. User chooses Up or Down.
2. User enters stake.
3. User chooses conviction.
4. App generates a high-entropy nonce locally.
5. App computes the commitment hash locally.
6. App submits only the commitment hash, stake, and conviction.
7. App stores the reveal key locally, encrypted with a passphrase or a wallet-derived key.

Production commitment hash must match the contract:

```solidity
keccak256(abi.encode(vote, nonce, voter, address(this)))
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

Until the user reveals, the app should not present them as a winner or loser. The outcome panel can show the market outcome, but the wallet-specific settlement state should remain "Reveal required" until their reveal transaction is complete.

## Juror Penalty Pool

For the app narrative, juror non-reveal penalties should be presented as flowing into the revenue distribution pool when the market resolves Up or Down. If the market resolves Invalid, the current contract accrues invalid-path juror penalties to the claim creator. If the intended product behavior is that all juror penalties always go to the revenue distribution pool, the contract and docs should be updated together.

## Visual Direction

- Dense but clean, closer to a market terminal than a landing page.
- Feed on the left, selected market in the center, account/action rail on the right.
- Up and Down are first-class actions.
- Use color sparingly: Up and Down may have semantic accents, but the rest should stay neutral.
- Show mechanism transparency without turning the screen into documentation.
