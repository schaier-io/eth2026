---
name: truthmarket-agent
description: Use when an agent is creating, discovering, verifying, voting in, revealing for, watching, or settling a TruthMarket random-jury belief-resolution market. Covers Swarm claim/rules verification, agent policy, local reveal vaults, heartbeat scheduling, and commit-reveal safety.
---

# TruthMarket Agent Workflow

TruthMarket is random-jury belief resolution, not fact-checking and not an oracle. Use "claim/rules verification" or "integrity check" for Swarm reads.

## Hard Rules

- Never commit unless the claim/rules document fetched from Swarm verifies against the contract.
- Treat mutable Swarm feeds/KV as discovery only. Contract state and immutable Swarm references are canonical.
- Never store unrevealed votes, nonces, private keys, or private strategy on Swarm.
- Never reveal for another voter or agent.
- After committing, schedule heartbeat monitoring for reveal and withdrawal.
- If selected as a juror, reveal before the deadline unless explicit policy blocks it; non-revealing jurors forfeit full stake.

## Policy

Require an explicit local policy before an agent commits:

```json
{
  "autoReveal": true,
  "revealBufferMinutes": 30,
  "autoWithdraw": true,
  "maxStake": "1000000000000000000",
  "requireSwarmVerification": true,
  "allowCreateMarkets": true,
  "allowJuryCommit": true
}
```

Reject or ask for operator approval when a requested action exceeds policy.

## Verify Before Commit

1. Read `swarmReference` and `claimRulesHash` from the market contract.
2. Fetch the claim/rules document from Swarm.
3. Verify `keccak256(fetchedBytes) == claimRulesHash`.
4. Decode JSON and compare key fields against contract getters.
5. Only then decide whether the agent policy allows commit.

## Commit

1. Choose YES or NO under the immutable claim/rules document.
2. Generate a high-entropy nonce locally.
3. Compute the contract commitment hash.
4. Submit only the commitment hash and stake.
5. Store vote, nonce, market, chain, wallet, and deadlines in a local private vault.
6. Start or update the heartbeat watcher.

## Heartbeat

Watch market phase, `isJuror(agent)`, reveal deadline, reveal status, outcome, and withdrawal status.

- If reveal opens and `autoReveal` is true, reveal before `revealBufferMinutes`.
- If selected as a juror, prioritize reveal because the selected juror non-reveal penalty is full stake.
- If resolved and `autoWithdraw` is true, withdraw.

## Create Market

When policy allows market creation:

1. Validate canonical `claim-rules.json`.
2. Upload it to Swarm.
3. Compute `claimRulesHash`.
4. Deploy/create market with `swarmReference` and `claimRulesHash`.
5. Update mutable Swarm discovery index/feed.

## Jury Committer

When policy allows jury committing:

1. Wait until voting deadline.
2. Fetch SpaceComputer randomness.
3. Build a replayable jury audit artifact.
4. Upload the artifact to Swarm.
5. Call `commitJury(randomness, auditHash)`.

The jury audit artifact is public. It must not include private votes or nonces.
