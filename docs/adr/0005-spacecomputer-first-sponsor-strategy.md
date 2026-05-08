# SpaceComputer-First Sponsor Strategy

Status: accepted

SpaceComputer is the core sponsor integration because randomness is load-bearing for the product. Umia, Swarm, ENS, Sourcify, and Apify may support the submission, but none should distort the core mechanism away from random jury selection and belief resolution.

For the hackathon contract, `juryCommitter` is intentionally trusted to fetch the SpaceComputer cTRNG output and post the randomness plus an audit hash. The contract uses that posted value to draw the jury on-chain, and observers can replay the draw from the active committer list and the emitted randomness. The audit hash is transparency plumbing, not an on-chain verification proof.

This is an accepted scope trade-off: the demo keeps SpaceComputer mechanically central without attempting full cTRNG proof verification in the contract. Production hardening should replace the trusted poster with an on-chain-verifiable SpaceComputer proof, signed attestation, or request/response binding that prevents seed grinding by the committer.

**Consequences**

- Apify stays optional and out of the critical path.
- Sourcify is optional verification hygiene.
- ENS is optional identity/reputation, not a jury-selection dependency.
- Swarm is core only for immutable claim/rules documents.
- Jury selection remains replayable and inspectable, but the hackathon build trusts `juryCommitter` not to choose among multiple randomness values.
