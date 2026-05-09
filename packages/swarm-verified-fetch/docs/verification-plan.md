# Verification Plan

This package targets the Swarm bounty:

> Verified Fetch — Trust No Gateway

The final developer experience should feel close to `fetch()`: pass a Swarm URL or reference, get a response-like object, and know bytes were verified before application code sees them.

## Package Boundary

`@truth-market/swarm-verified-fetch` owns verification.

`@truth-market/swarm-kv` may later use this package for verified reads, but it should not duplicate CAC/BMT or SOC/feed verification logic.

Cryptographic primitives should come from trusted low-level browser/Node-compatible libraries. See [dependency-policy.md](./dependency-policy.md).

## Immutable Data

### Stage 1: Raw CAC Chunks

Current implementation:

- Uses a low-level browser/Node-compatible Keccak-256 primitive from `@noble/hashes`.
- Fetch `/chunks/:reference`.
- Parse the 8-byte little-endian span.
- BMT-hash the chunk payload with 4096-byte Swarm chunk padding.
- Compute `keccak256(span || bmtRoot(payload))`.
- Compare the computed reference to the expected reference.
- Throw before returning payload helpers if verification fails.

This proves the gateway returned the exact chunk addressed by the requested Swarm reference.

### Stage 2: Raw Bytes / CAC Tree

Current implementation:

- Route `verifiedFetch(referenceOrUrl)` through raw chunk verification internally.
- Use `/chunks/:reference` so the verifier sees raw chunks, not only reconstructed gateway bytes.
- When the root span fits in one chunk, expose payload only after CAC verification.
- When the root is an intermediate chunk, parse 32-byte child references, verify each child recursively, and reconstruct bytes only after every CAC check passes.

### Stage 3: Multi-Chunk Files

Current implementation:

- Reconstruct immutable byte trees from raw chunks by treating intermediate payloads as 32-byte child references.
- Verify every intermediate and leaf chunk as a CAC before joining child payloads.
- Verify the root reference matches the requested reference.

Scope notes:

- Plain 32-byte immutable references and Bee-compatible CAC trees are supported.
- Encrypted references, advanced website routing, and erasure coding remain later scope.

Important scope note: fetching `/bytes/:reference` or `/bzz/:reference` returns reconstructed bytes, not necessarily the raw chunk tree. Full verification needs either raw chunk access for each chunk or enough proof metadata from a gateway to validate the tree. The package should not claim full-file verification until it can prove the same root Bee would prove.

### Stage 4: Manifests and Collections

Current implementation:

- Verify Mantaray/manifest chunks.
- Resolve paths only after the manifest tree is verified.
- Fetch target file chunks and verify them under the resolved reference.

Next:

- Add website routing behavior such as index documents and error documents.

## Mutable Data: SOC and Feeds

Feeds are built on Single Owner Chunks. Verification uses a different proof:

- Verify the SOC address from owner and identifier.
- Verify the owner's Ethereum signature over `keccak256(identifier || wrappedCACAddress)` using Ethereum personal-sign semantics.
- Verify sequence feed topic/index resolution as `keccak256(topic || uint64be(index))`.
- Verify that the payload reference from the feed update is itself a verified immutable reference before exposing content.

Current implementation:

- Parses Bee-compatible SOC bytes as `identifier || signature || span || payload`.
- Verifies the wrapped CAC address with the same BMT path as immutable chunks.
- Recovers the secp256k1 owner from the SOC signature and recomputes `keccak256(identifier || owner)` as the SOC reference.
- Verifies exact sequence feed updates by owner/topic/index.
- Supports gateway-assisted latest-index probing, then ignores the gateway `/feeds` payload and fetches the raw SOC chunk for verification.
- Exposes manual `verifySingleOwnerChunk()` and `verifyFeedUpdate()` APIs.
- Exposes high-level `verifiedFetchFeed()`, `verifiedFetchFeedUpdate()`, `feed://<owner>/<topic>?index=<n>`, and client `fetchFeed()` / `fetchFeedUpdate()` APIs.

Scope note: exact feed indexes are cryptographically verified. A gateway can still censor a newer valid update when asked for "latest", so callers that require a specific version should pass the exact `index`.

## API Shape

Primary API:

```ts
const response = await verifiedFetch("bzz://<reference>", {
  expectedHash: claimRulesHash,
  contentType: "application/json",
  signal: abortController.signal,
  timeoutMs: 10_000
});

const value = await response.json();
```

`verifiedFetch` is the one normal application fetch surface. It hides raw `/chunks` traversal, CAC verification, BMT hashing, byte-tree reconstruction, and optional exact-byte hash checking. It throws typed errors before exposing invalid bytes.

For manifest paths, `verifiedFetch("bzz://<manifest-reference>/path/to/file.json")` verifies the Mantaray manifest bytes first, resolves the path locally from that verified trie, then verifies the target file reference before returning bytes. The gateway is only used as a raw chunk source; it is not trusted to resolve the path.

When a manifest entry carries file metadata, the response exposes it from the verified manifest graph rather than trusting HTTP headers:

```ts
const response = await verifiedFetch("bzz://<manifest-reference>/claim-rules.json");

console.log(response.metadata.fileName);
console.log(response.metadata.mimeType);
console.log(response.metadata.byteLength);
console.log(response.metadata.path);
```

If the verified manifest declares a byte length, it is checked against the verified target byte-tree span. A mismatch is treated as a verification error rather than silently choosing one value.

Buffered responses are the default because claim/rules documents and audit JSON are small:

```ts
const response = await verifiedFetch("<raw-immutable-reference>", {
  gatewayUrl: "http://localhost:1633"
});

if (response.delivery === "buffer") {
  console.log(response.metadata.kind); // "bytes"
  console.log(response.metadata.mediaType.kind); // "json" | "text" | "binary" | "unknown"
  console.log(response.verification.chunksVerified);
}
```

Large immutable blobs can opt into a true stream:

```ts
const response = await verifiedFetch("<raw-immutable-reference>", {
  gatewayUrl: "http://localhost:1633",
  responseType: "stream"
});

for await (const chunk of response.body) {
  // each chunk is yielded only after chunk-level verification
}

const completion = await response.completion;
console.log(completion.contentHash);
```

Fetch ergonomics implemented in the primary API:

```ts
const response = await verifiedFetch("bzz://<manifest-reference>/claim-rules.json", {
  gateways: ["https://gateway-1.example", "https://gateway-2.example", "http://localhost:1633"],
  gatewayStrategy: "race",
  retry: { attempts: 3, baseDelayMs: 250, maxDelayMs: 2_000 },
  signal: abortController.signal,
  timeoutMs: 10_000,
  onProgress(event) {
    switch (event.type) {
      case "chunkFetched":
      case "chunkVerified":
      case "bytesEnqueued":
      case "complete":
        console.log(event.bytesVerified, event.totalBytes, event.chunksVerified);
        break;
    }
  }
});
```

Retry and gateway racing improve availability only. They do not weaken verification: every accepted chunk is still checked against the requested Swarm reference before bytes are exposed.

Manual verification APIs remain explicit and do not perform network fetches:

```ts
const chunk = verifySwarmChunk(reference, rawChunkBytes);
const soc = verifySingleOwnerChunk(socReference, rawSocBytes);
const feed = verifyFeedUpdate(feedReference, rawSocBytes, { owner, topic, index });
const bytes = await verifySwarmBytes(rootReference, { chunks });
const hash = verifyBytesHash(bytes.bytes, claimRulesHash);
```

## Test Plan

- Unit tests for span encoding and hex normalization.
- Unit tests for CAC/BMT verification against generated chunks.
- Negative tests for mutated payloads and wrong references.
- Deterministic Bee-like `/chunks/:reference` response mocks for single-chunk and multi-chunk immutable trees.
- Modification-vector tests for tampered roots, tampered children, missing children, malformed intermediate chunks, and verified chunk limits.
- Optional local Bee e2e tests using `/bytes` uploads and `/chunks` verification when `SWARM_KV_BEE_API_URL` and `SWARM_POSTAGE_BATCH_ID` are configured.
- Cross-package live registry e2e where `@truth-market/swarm-kv` publishes registry-shaped JSON, text, and multi-chunk bytes, then this verifier package reads the generated fixture and verifies the live references through `SWARM_E2E_GATEWAY_URL`.
- Fixture tests against Bee-generated chunks and references.
- Deterministic Mantaray manifest tests for verified local path resolution and verified manifest metadata.
- Unit tests for progress callbacks, retry/backoff, gateway failover, and gateway racing with a lying gateway.
- Fake-gateway e2e tests for invalid public responses: tampered chunks, invalid manifest targets, missing manifest paths, bad manifest file-size metadata, all-lying gateway racing, and retry from invalid to valid chunks.
- Public gateway e2e tests using `SWARM_PUBLIC_E2E_FIXTURE`, including live MITM mutation tests that fetch real gateway chunks and corrupt selected responses in-process; see [public-e2e-data-plan.md](./public-e2e-data-plan.md).
- Unit and fake-gateway e2e tests for SOC/feed updates, including tampered SOC signatures/payloads, untrusted `/feeds` payloads, and feed failover.
- Public testnet SOC/feed fixture coverage plus live MITM tests for the feed SOC and the immutable target it resolves to.
- Future fixture tests for additional Bee-generated multi-chunk files and website manifests.

## Source Notes

- Swarm docs describe content-addressed chunks as BMT-addressed chunks.
- DISC docs describe CAC addresses as the hash of span metadata and BMT root of payload.
- Bee API exposes `/chunks`, `/bytes`, `/bzz`, and `/feeds`.
- bee-js documents `makeContentAddressedChunk`, `SingleOwnerChunk`, `FeedReader`, and `MerkleTree`, which are useful references for compatibility.
