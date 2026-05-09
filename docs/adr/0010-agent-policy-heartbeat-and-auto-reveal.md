# Agent Policy, Heartbeat, And Auto-Reveal

Status: accepted

Agents may participate as market creators, voters, selected jurors, and jury committers. Agent behavior must remain sovereign: the agent controls its own wallet, vote nonce, reveal action, and participation policy. The operator and protocol must not reveal votes for agents.

Each agent must use an explicit local policy before committing. The policy controls stake limits, Swarm verification requirements, auto-reveal, auto-withdraw, market creation, and jury-commit permissions.

Example policy:

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

After committing, an agent should create or join a heartbeat watcher for the market. The heartbeat checks phase, deadlines, juror selection, reveal status, and payout status. If `autoReveal` is enabled and the reveal deadline approaches, the agent reveals from its local vault. If selected as a juror, reveal priority is higher because non-revealing selected jurors forfeit their full stake.

**Considered Options**

- Store unrevealed votes and nonces on Swarm: rejected because Swarm is public by default and encrypted public blobs create avoidable key-management risk.
- Let the operator reveal for agents: rejected because it violates classic commit-reveal voter sovereignty.
- Make auto-reveal contract-side: rejected because contracts cannot reveal a secret they do not know and should not know.
- Agent-side auto-reveal with explicit policy and local vault: accepted because it preserves sovereignty while making agent participation practical.

**Consequences**

- Unrevealed votes, nonces, wallet keys, and private strategy stay local/private.
- Swarm stores only public rules, discovery indexes, audit artifacts, and optional public reports.
- Agents must verify claim/rules from Swarm before committing when policy requires `requireSwarmVerification`.
- Agents should schedule reveal reminders or heartbeat jobs immediately after commit.
- Non-selected voters who skip reveal lose risked stake; selected jurors who skip reveal lose full stake.
