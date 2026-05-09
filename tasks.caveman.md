# TruthMarket — Hackathon Task Plan

Agent-native prediction-market fact-checker. Bounties: Apify (X402) + ENS Bounty 1 + Umia + Swarm + SpaceComputer.

---

## Critical Path (priority order)

### 1. Smart Contract — claim & market core
**What:** Solidity contract owns claim lifecycle: create → stake → submit evidence → resolve → payout. Plus `requestJury(claimId)` escalation for disputes.

**Why first:** Everything reads/writes this. Frontend, agents, Swarm pointers, jury — all pivot on contract deployed + stable.

**Surface (min viable):**
- `createClaim(swarmHash, deadline, bondAmount)` — opens market, stores Swarm ref to claim text/metadata
- `stake(claimId, outcome, amount)` — YES/NO stake in stablecoin (testnet USDC)
- `submitEvidence(claimId, swarmHash, agentAddress)` — agent posts evidence ref + ENS-resolved address
- `resolve(claimId)` — settle by stake-weight, distribute payouts, take protocol fee
- `requestJury(claimId)` — flag for SpaceComputer jury (Task 3 hooks here)
- Events for everything (frontend subscribes)

**Stack:** Foundry or Hardhat. Deploy Base Sepolia (x402-friendly) or Sepolia. OpenZeppelin for ERC20 + AccessControl.

**Deps:** None. Start now.

**Accept:** Contract verified on testnet explorer. Run full lifecycle (create → stake → resolve → withdraw) from script, see right token transfers.

---

### 2. Claim Upload via Swarm
**What:** Library/service. Take claim payload (text + sources + agent evidence), write Swarm, return chunk ref. Read path fetches + (bonus) verifies chunk hash client-side.

**Why:** Contract stores Swarm hashes, not raw claim text. "Tamper-proof evidence trail" pitch depends on this end-to-end. Unlocks Swarm bounty (Verified Fetch — $250) if read path tightened with hash verify.

**Surface:**
- `uploadClaim(payload) → swarmRef` — JSON → Bee node `POST /bzz`
- `uploadEvidence(payload) → swarmRef` — same path, agents use
- `fetchClaim(swarmRef) → payload` — `GET /bzz/{ref}` via gateway
- `verifyClaim(swarmRef, payload)` — recompute BMT hash, assert match (Verified Fetch hook — copy pattern from helia-verified-fetch)

**Stack:** TypeScript + bee-js SDK. Public Swarm gateway for reads; writes need postage stamp.

**Deps:**
- Postage stamp / gift code (grab from Áron Soós at Swarm booth day 1)
- Bee node access or gateway endpoint

**Accept:** Round-trip claim payload — upload, get ref, fetch by ref, verify hash matches. CLI demo or small test page.

---

### 3. Oracle Vote / Jury Selection via SpaceComputer cTRNG
**What:** When market disputed (or always for high-stakes), draw randomized jury of N agents from registered pool via SpaceComputer cosmic TRNG. Randomness must be verifiable — no rigging claims.

**Why:** SpaceComputer integration *load-bearing* for product, not bolted-on. Answers "how prevent collusion among AI fact-checker agents?" — every judge asks.

**Surface:**
- `requestJurySelection(claimId, poolSize, targetJurySize)` — kicks draw
- Pull entropy from SpaceComputer cTRNG (HTTP API or Orbitport, whichever available)
- Use entropy to deterministically pick N agent indices from registry
- Submit selection (with proof/signature from SpaceComputer) back to contract
- Contract verifies + locks jury for claim

**Open Qs — resolve early with mentors:**
- cTRNG returns signed/verifiable random output, or trust API? (Affects on-chain-verifiable vs off-chain-with-attestation.)
- SDK or just REST? Auth model?
- KMS — needed, or just cTRNG?

**Stack:** Off-chain TypeScript service. Calls SpaceComputer, computes selection, submits tx to contract. Contract verifies entropy proof if available.

**Deps:**
- Smart contract deployed (Task 1) — selection submits into it
- Agent registry exists (supporting task — see below)
- SpaceComputer API access — talk Filip / Amir / Pedro early; longest-lead-time external dep on critical path

**Accept:** Given claim with N agents in pool, run selection, see signed jury commitment land on-chain, prove entropy from cTRNG.

---

### 4. Umia Use Case for Presentation (no code)
**What:** Judge-ready narrative — why TruthMarket fundable Umia venture. One slide + short verbal pitch. No engineering.

**Why:** Umia prize $2k cash + $10k follow-on if project continues. Follow-on = largest uncapped upside in bounty pool. Judge (Francesco Mosterts) explicitly wants projects with path to real venture + token. Story must be crisp.

**Slide must cover:**
- **Revenue model:** protocol fee per market, take rate on agent-to-agent payments, premium tier for enterprise (DAOs, AI labs, prediction markets needing fast resolution)
- **Token thesis:** why token needed — staking for agent registry slots, governance over dispute escalation rules, fee-share for stakers, slashing on bad fact-check outcomes. Token gates *credibility*, not access.
- **Why Umia:** agentic-native venture (agents = workers, not just users), needs onchain legal wrapper (decentralized adjudication has regulatory surface), token launch via CCA fits model
- **Scale path:** start prediction-market resolution (replace UMA latency for fast claims), expand DAO governance proposals, expand enterprise content moderation
- **Defensibility:** reputation network effects — once agents earn ENS reputation here, switching cost high

**Deps:** Tasks 1–3 shaped enough to speak concretely. Else no blockers.

**Accept:** One slide deck (3–5 slides) + 90-sec verbal pitch, rehearsed. Team-reviewed.

---

## Supporting Tasks (needed for complete demo, lower priority than critical path)

**Not** on priority list, but demo doesn't run without them. Slot around critical path.

- **Agent registry (ENS-backed)** — set up `*.facts.eth` (or chosen parent), register 3–4 agents as subnames, populate text records for `capability`, `endpoint`, `feeUsdc`, `accuracy`. Required by Task 3 (jury pool) + demo flow. Hits ENS Bounty 1.
- **At least one working AI fact-checker agent** — calls Apify Actor, posts evidence to Swarm, stakes on market. Without this, nothing to show. Hits Apify bounty.
- **x402 payment integration** — agents pay each other and/or user pays master agent via x402. "Money moves on screen" demo beat. Required by Apify bounty.
- **Demo frontend** — minimal UI: market, agents racing to evidence, stake flipping real-time, resolution receipt. Single Next.js page works.
- **Demo script + characters** — name agents, write live-claim flow, rehearse failure mode (one agent wrong, loses reputation). Makes clip travel.

---

## Dependency Graph

```
Task 1: Smart Contract  ─────────┬──────────────► Task 3: SpaceComputer Jury
        (foundational)            │                       (needs contract)
                                  │
Task 2: Swarm Upload  ────────────┼──────────────► Frontend / Demo
        (parallel, no blockers)   │                       (needs both)
                                  │
                                  └──────────────► AI Agent
                                                   (writes evidence to Swarm,
                                                    posts ref to contract)

Task 4: Umia Pitch  ──────────────────────────────► (needs 1–3 shaped, not finished)

Agent Registry (ENS) ─────────────────────────────► Task 3 (jury pool)
                                                    AI Agent (own identity)

x402 Integration  ────────────────────────────────► AI Agent (payment rail)
                                                    Frontend (visible $ flow)
```

**Critical path:** Task 1 → (Task 3 + Agent Registry) → Demo. Task 2 parallel, feeds frontend. Task 4 end-of-event prep.

---

## Setup & External Requirements (day 1)

- [ ] Grab Swarm gift code from Áron Soós at booth (postage stamp $)
- [ ] Reach SpaceComputer mentors (Filip @elrondjr / Amir @am_ylm / Pedro @zkpedro) for cTRNG access — longest-lead-time dep
- [ ] Find Jakub Kopecky (@themq37) at Apify booth for X402 docs walk-through
- [ ] Find workemon (TG: workemon) at ENS booth — clarity on parent name for `*.facts.eth`
- [ ] Confirm Umia mentors (Nicolas / Oxytocin / Francesco) want quick scope review of venture pitch — Francesco = judge
- [ ] Decide testnet (Base Sepolia recommended for x402 — confirm with Apify mentor)
- [ ] Shared repo, basic CI, env management

## Risks & Mitigations

- **SpaceComputer access blocked/slow.** Fallback: Chainlink VRF stand-in for demo, document SpaceComputer path, claim partial credit. Talk mentors *before* problem.
- **Swarm postage / upload flaky.** Fallback: store claim payloads on IPFS with thin wrapper to swap later. Lose Swarm bounty, keep demo alive.
- **AI agent quality bad live.** Pre-bake 3–4 known claims, tested. Demo doesn't need arbitrary input — pick good story.
- **x402 / Base Sepolia issues.** "Fake" payment mode (same UI events logged) as fallback. Lose Apify bounty if needed.

## Definition of Done (hackathon submission)

- Contract deployed + verified on testnet, tx history shows full lifecycle
- One real claim resolved end-to-end on stage, evidence on Swarm, SpaceComputer-selected jury (or VRF fallback)
- At least one AI fact-checker agent calls Apify Actor, paid via x402
- 60-sec demo video uploaded
- Umia pitch slide ready
- README: architecture + bounties claimed
