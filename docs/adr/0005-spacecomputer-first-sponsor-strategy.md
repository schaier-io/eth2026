# SpaceComputer-First Sponsor Strategy

Status: accepted

SpaceComputer is the core sponsor integration because randomness is load-bearing for the product. Umia, Swarm, ENS, Sourcify, and Apify may support the submission, but none should distort the core mechanism away from random jury selection and belief resolution.

For the hackathon contract, `juryCommitter` is intentionally trusted to fetch the SpaceComputer cTRNG output from the public IPFS/IPNS beacon and post the randomness, the beacon/audit IPFS address, beacon sequence, beacon timestamp, cTRNG index, and an audit hash. SpaceComputer's current docs describe cTRNG values as available through the Orbitport SDK or directly from a public IPFS beacon whose blocks include `data.sequence`, `data.timestamp`, and a `data.ctrng` array. The contract computes and stores `randomnessHash = keccak256(abi.encodePacked(randomness))`, uses the posted randomness value to draw the jury on-chain, and exposes a bundled randomness-evidence query so observers can replay the draw from the active committer list and the emitted randomness. The IPFS address, beacon metadata, randomness hash, and audit hash are transparency plumbing, not an on-chain verification proof.

The CLI `jury commit` command does not accept manual randomness fields. It fetches the latest SpaceComputer IPNS beacon at execution time from `https://ipfs.io/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f` with cache-bypass headers and a query nonce, consumes `data.ctrng[0]`, stores the canonical `/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f` beacon path with `data.sequence`, `data.timestamp`, and `randomnessIndex = 0`, and computes `juryAuditHash` from the exact fetched beacon response bytes.

This is an accepted scope trade-off: the demo keeps SpaceComputer mechanically central without attempting full cTRNG proof verification in the contract. Production hardening should replace the trusted poster with an on-chain-verifiable SpaceComputer proof, signed attestation, or request/response binding that prevents seed grinding by the committer.

**Consequences**

- Apify stays optional and out of the critical path.
- Sourcify is optional verification hygiene.
- ENS is optional identity/reputation, not a jury-selection dependency.
- Swarm is core only for immutable claim/rules documents.
- Jury selection remains replayable and inspectable, but the hackathon build trusts `juryCommitter` not to choose among multiple SpaceComputer beacon values.
