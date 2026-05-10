# Swarm Integration Plan

TruthMarket should use Swarm where decentralized storage strengthens the product: immutable initial claim/rules documents, claim attachments, and decentralized discovery indexes. Swarm must not become an external truth source, randomness source, or mutable protocol state.

## Prize Targets

Current ETHPrague 2026 Swarm targets to prioritize:

1. Verified Fetch: voters and agents verify the claim/rules document before staking.
2. Simple Key-Value Store on Swarm: market discovery indexes use Swarm feeds/KV.

Confirm current prize wording on the official hackathon prize page before submission, but build toward these two targets unless the sponsor guidance changes.

## Minimal Build

### 1. Immutable Claim/Rules Document

Create one canonical JSON document per market:

```json
{
  "schema": "truthmarket.claimRules.v1",
  "title": "Will agents close more support tickets than humans this week?",
  "description": "A YES/NO claim resolved by selected staked juror belief under these rules.",
  "yesMeaning": "Agents close a higher count of qualifying tickets before the cutoff.",
  "noMeaning": "Humans close an equal or higher count of qualifying tickets before the cutoff.",
  "resolutionRules": "Only tickets matching the locked queue and time window count."
}
```

Do not duplicate contract-created parameters as canonical Swarm fields. Deadlines, max jury size, minimum commits, minimum revealed jurors, stake token, creator, and risk percentage come from the deployed contract. The UI may display those values beside the Swarm document, but contract getters remain canonical.

Upload the document to Swarm before deploying the market. Store only the returned Swarm reference in the contract:

```solidity
bytes public swarmReference;
```

The contract should not parse JSON. The UI, CLI, and agents verify the fetched document through the content-addressed `swarmReference` and compare decoded fields against contract getters.

### 2. Verified Fetch Gate

Before a wallet or agent can commit:

1. Read `swarmReference` from the contract.
2. Fetch the claim/rules document from Swarm.
3. Verify the fetched bytes against the content-addressed Swarm reference.
4. Verify key JSON fields match contract parameters.
5. Enable commit only after verification passes.

User-facing proof should show:

- Swarm reference.
- Verification status.
- Contract parameter match.
- Commit disabled until verification succeeds.

Use "verification check", "integrity check", or "claim/rules verification". Do not describe this as fact-checking the claim.

### 3. Swarm KV/Feed Discovery

Use mutable Swarm feeds/KV only for discovery and cached read models:

```txt
truthmarket:v1:markets:<chainId> -> bzz://<market-index-json>
truthmarket:v1:creator:<chainId>:<creator> -> bzz://<creator-market-index-json>
```

Example market index:

```json
{
  "schema": "truthmarket.marketIndex.v1",
  "chainId": 84532,
  "updatedAt": "2026-05-09T00:00:00Z",
  "markets": [
    {
      "market": "0x...",
      "swarmReference": "0x...",
      "title": "Will agents close more support tickets than humans this week?",
      "phaseHint": "Voting"
    }
  ]
}
```

The index is convenience data. Opening a market must still read the contract and verify the immutable claim/rules document.

### 4. SpaceComputer Jury Audit Metadata

SpaceComputer publishes cTRNG beacon blocks through IPFS/IPNS. After the jury committer fetches a beacon value, persist a replayable audit bundle off-chain and hash its exact bytes:

```json
{
  "schema": "truthmarket.juryAudit.v1",
  "market": "0x...",
  "randomness": "0x...",
  "randomnessHash": "0x...",
  "randomnessIpfsAddress": "https://ipfs.io/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f",
  "randomnessSequence": 87963,
  "randomnessTimestamp": 1769179239,
  "randomnessIndex": 0,
  "committerSet": ["0x..."],
  "selectedJurors": ["0x..."],
  "selectionAlgorithm": "fisher-yates-keccak256(seed,i)",
  "createdAt": "2026-05-09T00:00:00Z"
}
```

The contract stores `randomness`, `randomnessHash`, `randomnessIpfsAddress`, `randomnessSequence`, `randomnessTimestamp`, `randomnessIndex`, and `juryAuditHash`. The service should compute `juryAuditHash` from the exact artifact bytes and pass it with the SpaceComputer IPFS/IPNS beacon metadata to `commitJury(randomness, metadata, auditHash)`. Swarm is not part of this randomness path.

## CLI And Agent Flow

Provide a CLI first, then let the web app reuse the same library:

```txt
truthmarket create-claim claim-rules.json
  -> validate schema
  -> upload to Swarm
  -> deploy market with swarmReference
  -> update Swarm market index

truthmarket verify-claim --market 0x...
  -> read contract reference
  -> fetch Swarm document
  -> verify Swarm reference and contract params

truthmarket watch --market 0x... --wallet 0x...
  -> monitor phase, jury selection, reveal deadline, and withdrawal
```

## Boundaries

- Immutable Swarm content: initial claim/rules documents and claim attachments.
- Mutable Swarm feeds/KV: market discovery, creator indexes, cached UI snapshots.
- Contract: commitments, stakes, selected jurors, reveals, outcome, payout, treasury/creator accrual.
- Agent-local vault: unrevealed vote, nonce, wallet key, private participation policy.

Never store unrevealed votes, nonces, private keys, or private strategy on Swarm.

## Future Scope

- Swarm manifests for multi-file market bundles.
- Swarm-hosted frontend.
- Public redacted agent policy commitments.
- Settlement report artifacts.
- Dappnode package only if a TruthMarket indexer/node becomes useful.
