# Dependency Policy

This package should be credible for a hackathon bounty and safe enough for other developers to inspect quickly.

## Rule

Use trusted low-level cryptographic libraries, but implement the Swarm-specific verification flow in this package.

That means:

- Do use audited or widely reviewed primitives for Keccak-256 and secp256k1.
- Do not hand-roll cryptographic primitives.
- Do not depend on a full Swarm verified-fetch library.
- Do not hide CAC/BMT/tree/SOC/feed verification behind Bee, bee-js, Helia, or a gateway SDK.

## Current Runtime Dependencies

| Dependency | Purpose | Why acceptable |
| --- | --- | --- |
| `@noble/hashes@2.2.0` | Keccak-256 | Small, audited, browser/Node-compatible, no native bindings |
| `@noble/curves@2.2.0` | secp256k1 recovery for SOC/feed verification | Small, audited, browser/Node-compatible, no native bindings |

Versions are pinned exactly for reproducible judging/demo builds.

## What This Package Owns

- Fetching raw Swarm chunks from any gateway.
- CAC verification: span parsing, BMT root construction, reference comparison.
- Recursive immutable file/tree verification from raw chunk references.
- SOC/feed byte-layout parsing and verification orchestration.
- Response-shaped developer API.

## What Low-Level Libraries Own

- Keccak-256 compression and sponge implementation.
- secp256k1 signature recovery and public-key operations.

This keeps the hackathon implementation honest: the trustless Swarm verification behavior is ours, while the dangerous cryptographic primitives come from trusted libraries.
