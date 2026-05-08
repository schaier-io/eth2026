# TruthMarket — Hackathon Task Plan

Agent-native prediction-market fact-checker. Bounty surface: Apify (X402) + ENS Bounty 1 + Umia + Swarm + SpaceComputer.

---

## Critical Path (priority order)

### 1. Smart Contract — claim & market core (4-phase commit-reveal)

**What:** Solidity contract that owns the lifecycle of a claim through four explicit phases: **Created → Voting → Reveal → Resolved**. Voters commit hidden votes during the voting phase; a cTRNG-selected jury reveals during the reveal phase; payouts are weighted by a sequence-based curve so earlier-correct jurors earn more.

**Why first:** Everything else reads from or writes to this. Frontend, agents, Swarm pointers, jury selection, and rewards all pivot on the contract being deployed and stable. The commit-reveal design also means front-running and last-second copy-vote attacks aren't possible — important for a credible fact-checking story.

**Phase model:**
1. **Created.** `createClaim` registers the canonical Swarm doc hash, sets voting/reveal deadlines, fixes the protocol fee (bps), and locks the jury size. `attachEvidence` is event-only — agents post Swarm refs of supporting evidence so other voters can read them.
2. **Voting.** `commitVote(id, commitHash, stake)` locks stake and stores `keccak256(abi.encode(vote, nonce, stake, voter))`. The voter is bound into the hash, so commits cannot be copied or front-run. Vote values are encoded as `1 = YES`, `2 = NO`.
3. **Reveal.** After the voting deadline, `advanceToReveal` flips the phase. The oracle then calls `commitJury(id, jurors[], randomness, ipfsCID)` with the SpaceComputer cTRNG output, the IPFS CID of the pinned cTRNG document, and the off-chain-computed juror list. The contract trusts the admin — it does not verify the randomness on-chain — and simply records the jurors and CID. **Reveal is open to every committer**, not just jurors. The contract recomputes the hash from `(vote, nonce, stake, voter)` and accepts only matching reveals. Jurors are a strict subset of committers and have a single special role: their reveals are the ones that decide the outcome. Non-juror reveals don't influence the outcome but still play in the prediction-market layer (winner share / slashed if wrong).

4. **Resolved.** `resolve` decides the outcome from the jury's stake-weighted reveals only (ties or no-jury-reveals = `Invalid`, no slashing). It then computes a single **slashed pool** spanning the whole committer set: `(revealed-losing stake, any committer) + (non-revealing stake, any committer)`. Protocol fee is pulled from the slashed pool to the treasury; the remainder is the **distributable pool**, cached on storage, split at withdraw among ALL winning revealers (jurors + non-jurors) weighted by the sequence-based reward curve. Each winner gets their own stake back **plus** a slice of the distributable pool.

**Payout matrix (in `withdraw`):**
| Voter state | Payout |
|---|---|
| Outcome = Invalid | full stake refund |
| Didn't reveal (juror or not) | 0 — stake folded into the slashed pool |
| Revealed losing side (juror or not) | 0 — stake folded into the slashed pool |
| Revealed winning side (juror or not) | own stake back + sequence-weighted slice of the distributable pool |

The jury's role is purely informational — they are the truth oracle. Economic exposure (slash and reward) is uniform across every committer; it tracks reveal status and prediction correctness, not jury membership.

**Sequence-based reward curve.** `_rewardWeight(commitIndex)` is harmonic decay by default (`1e18 / (i + 1)`) so earlier correct commits earn a bigger slice of the distributable pool. Trivial to swap for Fibonacci-inverse, exponential decay, or quadratic. Bias: incentivize fast, confident commitments rather than late-mover safety plays.

**Surface area (minimum viable):**
- `createClaim(swarmDocHash, votingPeriod, revealPeriod, protocolFeeBps, jurySize)`
- `attachEvidence(id, swarmRef)` — event-only (agents post evidence)
- `commitVote(id, commitHash, stake)`
- `advanceToReveal(id)` — anyone can call after voting deadline
- `commitJury(id, jurors[], randomness, ipfsCID)` — `ORACLE_ROLE` only; admin posts the off-chain selection (Task 3 calls this)
- `revealVote(id, vote, nonce)`
- `resolve(id)` — pulls fee, freezes outcome
- `withdraw(id)` — claimant-driven payout
- View helpers: `getJury`, `getCommitters`, `isJuror`, `commitHashOf` (so the frontend computes the same commitment the contract verifies)
- Events on every state transition (frontend subscribes)

**Stack:** Foundry. Deploy to Base Sepolia (x402-friendly) or Sepolia. OpenZeppelin for `IERC20`, `SafeERC20`, `AccessControl`, `ReentrancyGuard`. Roles: `DEFAULT_ADMIN_ROLE` and `ORACLE_ROLE` (held by the Task 3 service account).

**Dependencies:** None. Start immediately. Task 3 plugs into `commitJury` later.

**Acceptance:** Contract verified on the testnet block explorer; a Foundry script runs the full happy path end-to-end (create → 3+ commits → advance → commitJury with mock randomness + dummy CID → reveals → resolve → withdraw) with assertions on token balances; a second script exercises the slash paths (non-revealing juror, losing juror, invalid-outcome refund) and confirms the math.

**Known gaps to fix before audit (not blockers for hackathon):**
- Jury submission is fully trusted — the admin/oracle could post any juror list and any randomness, and the contract has no way to detect it. The IPFS CID is the only audit trail. Future hardening: signed cTRNG attestations, on-chain verifier, or in-contract derivation from a posted seed.
- No timeout for oracle non-fulfillment. Add an admin escape that lets `resolve` refund everyone if `commitJury` never lands within a grace window.
- Bonus integer-division dust stays locked in the contract. Sweep to treasury at end-of-claim if it becomes meaningful at scale.

---

### 2. Claim Upload via Swarm
**What:** A small library/service that takes a claim payload (text + sources + agent evidence) and writes it to Swarm, returning a chunk reference. A read path that fetches and (bonus) verifies the chunk hash client-side.

**Why:** The smart contract stores Swarm hashes, not raw claim text. The whole "tamper-proof evidence trail" pitch depends on this working end-to-end. Also unlocks the Swarm bounty (Verified Fetch — $250) if you tighten the read path with hash verification.

**Surface area:**
- `uploadClaim(payload) → swarmRef` — JSON → Bee node `POST /bzz`
- `uploadEvidence(payload) → swarmRef` — same path, used by agents
- `fetchClaim(swarmRef) → payload` — `GET /bzz/{ref}` via gateway
- `verifyClaim(swarmRef, payload)` — recompute BMT hash, assert match (this is the Verified Fetch hook — copy the pattern from helia-verified-fetch)

**Stack:** TypeScript + bee-js SDK. Can run against a public Swarm gateway for reads; for writes you need a postage stamp.

**Dependencies:**
- Postage stamp / gift code (pick up from Áron Soós at the Swarm booth on day 1)
- Bee node access or gateway endpoint

**Acceptance:** Round-trip a claim payload — upload, get ref, fetch by ref, verify hash matches. CLI demo or a small test page.

---

### 3. Oracle Vote / Jury Selection via SpaceComputer cTRNG (off-chain selection, on-chain commitment)
**What:** Once a claim's voting deadline passes, the off-chain service fetches a cTRNG output from SpaceComputer, pins the cTRNG document to IPFS, computes the jury locally over the committer pool, and posts the result on-chain via `commitJury(id, jurors[], randomness, ipfsCID)`. The contract does **not** verify the randomness — it trusts the admin/oracle entirely. The IPFS CID is the only audit trail: anyone can pull it, replay the off-chain selection, and confirm the posted jurors match.

**Why:** Hackathon-pragmatic. Verifiable on-chain RNG is a deep rabbit hole (signature schemes, attestations, cTRNG-specific verifiers). For the demo, "trusted admin + auditable IPFS pin" is a defensible, judge-legible compromise. Future work hardens this into on-chain verification.

**Surface area (off-chain service):**
- Watch for `ClaimCreated` events; when `block.timestamp >= votingDeadline`, call `advanceToReveal(id)` if not already advanced
- Pull a fresh entropy value from SpaceComputer cTRNG (HTTP API or Orbitport)
- Pin the cTRNG response document to IPFS; record the CID
- Read `getCommitters(id)` from the contract; locally run a deterministic selection (e.g. seeded Fisher-Yates) using the cTRNG value to pick `jurySize` addresses
- Call `commitJury(id, jurors, randomness, ipfsCID)` from the `ORACLE_ROLE` account — the contract stores the jury, marks each address as a juror, and emits `JuryCommitted`
- Keep the IPFS CID + the selection script publicly available so reviewers can reproduce the draw

**Trust model & future hardening:**
- *Now:* trust the admin. The IPFS pin documents the source; off-chain replay is the audit.
- *Future:* require a signed cTRNG attestation, verify on-chain, or have the contract derive the jury from the posted randomness directly. Both can layer on without changing the phase model.

**Open questions to resolve early with mentors:**
- Is there an SDK or just a REST endpoint for cTRNG? Auth model?
- KMS — do we need it for this version, or just the raw cTRNG endpoint?
- Latency: what's a realistic time between request and a pinned IPFS CID? Sets the minimum reveal-window length.

**Stack:** Off-chain TypeScript service holding the `ORACLE_ROLE` private key. Polls/subscribes to `ClaimCreated` and the voting deadline, fetches cTRNG, pins to IPFS (web3.storage / Pinata / kubo), computes the jury, submits a single `commitJury` tx per claim.

**Dependencies:**
- Smart contract deployed (Task 1) — the service writes to `commitJury`
- SpaceComputer API access — talk to Filip / Amir / Pedro early; longest-lead-time external dependency on the critical path
- IPFS pinning service or self-hosted node
- *No longer blocked on an external agent registry.* The jury pool is the set of committers on the claim. The agent registry is now an identity/reputation layer (still valuable for the demo + ENS Bounty 1) rather than a hard precondition for jury selection.

**Acceptance:** Given a claim with N committers, the service fetches a cTRNG output, pins the document to IPFS, submits `commitJury`, `JuryCommitted` fires with the jurors and CID, and a reviewer can fetch the CID + run the published selection script to reproduce the same juror set.

---

### 4. Umia Use Case for Presentation (no code)
**What:** A clear, judge-ready narrative for why TruthMarket is a fundable Umia venture. One slide + a short verbal pitch. No engineering work.

**Why:** Umia's prize is $2k cash + $10k follow-on if the project continues with them. The follow-on is the largest uncapped upside in the entire bounty pool. The judge (Francesco Mosterts) is explicitly looking for projects with a path to a real venture and a token. You need the story crisp.

**Slide must cover:**
- **Revenue model:** protocol fee on every market, take rate on agent-to-agent payments, premium tier for enterprise consumers (DAOs, AI labs, prediction markets needing fast resolution)
- **Token thesis:** why a token is needed — staking for agent registry slots, governance over dispute escalation rules, fee-share for stakers, slashing on bad fact-check outcomes. Token gates *credibility*, not access.
- **Why Umia specifically:** agentic-native venture (agents are the workers, not just users), needs onchain legal wrapper (decentralized adjudication has regulatory surface area), token launch via CCA fits the model
- **Scale path:** start with prediction-market resolution (replace UMA latency for fast claims), expand to DAO governance proposals, expand to enterprise content moderation
- **Defensibility:** reputation network effects — once agents earn ENS reputation here, switching cost is high

**Dependencies:** Tasks 1–3 shaped enough that you can speak to them concretely. Otherwise no blockers.

**Acceptance:** One slide deck (3–5 slides) + a 90-second verbal pitch you've rehearsed. Reviewed by the team.

---

## Supporting Tasks (needed for a complete demo, lower priority than the critical path)

These are **not** on the priority list you set, but the demo doesn't run without them. Slot them in around the critical path.

- **Agent registry (ENS-backed)** — set up `*.facts.eth` (or chosen parent name), register 3–4 agents as subnames, populate text records for `capability`, `endpoint`, `feeUsdc`, `accuracy`. With the new commit-reveal contract, the registry is no longer the jury pool (committers are) — it's the identity/reputation layer that ties an on-chain voter address to a named, advertised agent. Still required by the demo flow and by ENS Bounty 1.
- **At least one working AI fact-checker agent** — calls an Apify Actor, posts evidence to Swarm, places a stake on the market. Without this, there's nothing to show. Hits the Apify bounty.
- **x402 payment integration** — agents pay each other and/or the user pays the master agent via x402. The "money moves on screen" beat of the demo. Required by Apify bounty.
- **Demo frontend** — minimal UI showing the market, the agents racing to evidence, stake flipping in real time, resolution receipt. Could be a single Next.js page.
- **Demo script + characters** — name the agents, write the live-claim flow, rehearse the failure mode (one agent gets it wrong, loses reputation). The thing that makes the clip travel.

---

## Dependency Graph

```
Task 1: Smart Contract  ─────────┬──────────────► Task 3: SpaceComputer Jury
        (4-phase commit-reveal)   │                       (calls commitJury)
                                  │
Task 2: Swarm Upload  ────────────┼──────────────► Frontend / Demo
        (parallel, no blockers)   │                       (needs both)
                                  │
                                  └──────────────► AI Agent
                                                   (commits hidden vote,
                                                    posts evidence to Swarm,
                                                    reveals if drawn)

Task 4: Umia Pitch  ──────────────────────────────► (needs 1–3 shaped, not finished)

Agent Registry (ENS) ─────────────────────────────► AI Agent (named identity)
                                                    Frontend (display layer)
                                                    [no longer a jury pool —
                                                     jury is drawn from
                                                     committers]

x402 Integration  ────────────────────────────────► AI Agent (payment rail)
                                                    Frontend (visible $ flow)
```

**Critical path:** Task 1 → Task 3 → Demo. Task 3 only needs the contract deployed and at least one committer on a test claim — no separate registry build is required to exercise jury fulfillment. Task 2 runs in parallel and feeds the frontend. Agent Registry and x402 are demo-completeness work, not jury blockers. Task 4 is end-of-event prep.

---

## Setup & External Requirements (do day 1)

- [ ] Pick up Swarm gift code from Áron Soós at booth (postage stamp money)
- [ ] Reach out to SpaceComputer mentors (Filip @elrondjr / Amir @am_ylm / Pedro @zkpedro) for cTRNG access details — this is the longest-lead-time dependency
- [ ] Find Jakub Kopecky (@themq37) at Apify booth for X402 docs walk-through
- [ ] Find workemon (TG: workemon) at ENS booth — get clarity on which parent name to use for `*.facts.eth`
- [ ] Confirm Umia mentors (Nicolas / Oxytocin / Francesco) want a quick scope review of the venture pitch — Francesco is the judge
- [ ] Decide testnet (Base Sepolia recommended for x402 compatibility — confirm with Apify mentor)
- [ ] Set up shared repo, basic CI, environment management

## Risks & Mitigations

- **SpaceComputer access blocked or slow.** Fallback: use Chainlink VRF as a stand-in for the demo, document the SpaceComputer integration path, claim partial credit. Talk to mentors *before* this is a problem.
- **Swarm postage / upload flakiness.** Fallback: store claim payloads on IPFS with a thin wrapper to swap later. Lose Swarm bounty but keep the demo alive.
- **AI agent quality is bad live on stage.** Pre-bake 3–4 known claims that you've tested. The demo doesn't need to handle arbitrary input — pick a good story.
- **x402 / Base Sepolia issues.** Have a "fake" payment mode (logs the same UI events) as a presentation fallback. Lose Apify bounty if it comes to that.

## Definition of Done (for the hackathon submission)

- Contract deployed and verified on testnet, with a transaction history that walks all four phases (Created → Voting → Reveal → Resolved) on at least one claim
- One real claim resolved end-to-end on stage: claim doc on Swarm, multiple hidden commits, admin-committed jury (cTRNG output pinned to IPFS, posted via `commitJury`) visible in `JuryCommitted`, reveals from the posted jurors, payouts that demonstrate the sequence-based bonus
- At least one AI fact-checker agent that calls an Apify Actor, posts evidence to Swarm, commits a vote, and is paid via x402
- 60-second demo video uploaded
- Umia pitch slide ready
- README explaining architecture (4-phase commit-reveal + cTRNG jury + sequence reward) and bounties claimed
