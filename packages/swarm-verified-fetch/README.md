# @truth-market/swarm-verified-fetch

Fetch-shaped Swarm gateway reads with client-side verification.

This package is the dedicated verification package for the Swarm "Verified Fetch — Trust No Gateway" bounty. It is separate from `@truth-market/swarm-kv`: the KV package can depend on this later, but this package should stand on its own for any app that wants trust-minimized Swarm reads.

## Status

Early implementation. The Swarm verification flow is implemented in this package instead of delegating to Bee, bee-js, Helia, or another verified-fetch library. Cryptographic primitives come from small browser/Node-compatible low-level libraries.

| Requirement | Current status |
| --- | --- |
| Fetch from any Swarm gateway | Implemented: raw `/chunks/:reference` gateway fetch with failover/racing support |
| Immutable CAC + BMT verification | Implemented: owned TypeScript CAC/BMT verification |
| Multi-chunk immutable byte trees | Implemented: recursive CAC tree reconstruction from raw chunks |
| Verified Mantaray manifest paths | Implemented: `bzz://<manifest-reference>/path/to/file` resolves from verified manifest bytes |
| Mutable feed / SOC verification | Implemented: Bee-compatible SOC signature verification and sequence feed reference reads |
| Browser and Node.js | Package metadata and runtime are universal |
| Fetch-like API | Implemented: `verifiedFetch` plus client factory, cancellation, timeout, progress callbacks, retry/backoff, typed metadata, buffered and stream response modes |
| Manual verification API | Implemented: `verifySwarmChunk`, `verifySwarmBytes`, `verifySingleOwnerChunk`, `verifyFeedUpdate`, and `verifyBytesHash` |
| Clean docs and tests | Implemented with unit, fake e2e, public gateway e2e, and live MITM coverage |

The package verifies raw Swarm chunks fetched through `/chunks/:reference`, reconstructs immutable byte payloads by recursively verifying child references in the CAC tree, resolves Mantaray manifest paths locally after verifying the manifest bytes, and verifies sequence feed updates through Bee-compatible SOC signatures before following the immutable target reference. The public fetch API hides those steps.

Runtime dependencies are intentionally trusted low-level crypto libraries only: pinned `@noble/hashes` for Keccak-256 and pinned `@noble/curves` for secp256k1 SOC/feed signature recovery. We implement the Swarm-specific CAC/BMT/tree/SOC/feed verification flow here instead of delegating it to a full Swarm SDK.

See [docs/dependency-policy.md](./docs/dependency-policy.md).

## Install

```sh
pnpm add @truth-market/swarm-verified-fetch
```

## Usage

```ts
import { verifiedFetch } from "@truth-market/swarm-verified-fetch";

const response = await verifiedFetch("bzz://<raw-immutable-reference>", {
  gatewayUrl: "https://download.gateway.ethswarm.org"
});

console.log(response.delivery); // "buffer"
console.log(response.metadata.kind); // "bytes"
console.log(response.metadata.byteLength);
console.log(response.contentHash);
console.log(await response.text());
```

If you do not configure a gateway, the client uses the public mainnet gateway set:

```ts
const response = await verifiedFetch("bzz://<mainnet-reference>");
```

For public testnet data, select the testnet gateway set:

```ts
const response = await verifiedFetch("bzz://<testnet-reference>", {
  network: "testnet"
});
```

The exported defaults are `SWARM_PUBLIC_GATEWAYS`, `DEFAULT_SWARM_GATEWAY_URL`, and `DEFAULT_SWARM_TESTNET_GATEWAY_URL`. Explicit `gatewayUrl` values stay explicit; pass `gateways` when you want custom failover/racing behavior.

For TruthMarket claim/rules checks, pass the contract-stored exact-byte hash:

```ts
import { verifiedFetch } from "@truth-market/swarm-verified-fetch";

const rules = await verifiedFetch("bzz://<manifest-reference>/claim-rules.json", {
  expectedHash: claimRulesHash,
  cancelToken,
  gatewayUrl: "https://download.gateway.ethswarm.org",
  signal: abortController.signal,
  timeoutMs: 10_000
});

console.log(rules.metadata.manifest?.targetReference);
console.log(rules.metadata.fileName);
console.log(rules.metadata.mimeType);
console.log(rules.metadata.byteLength);
console.log(rules.metadata.path);

const value = await rules.json<{
  schema: "truthmarket.claimRules.v1";
  title: string;
  description: string;
  yesMeaning: string;
  noMeaning: string;
  resolutionRules: string;
}>();
```

For mutable Swarm reference feeds, use the explicit feed API or a `feed://` URL. The library verifies the feed SOC first, then verifies the immutable target reference before returning bytes:

```ts
import { verifiedFetchFeed, verifiedFetchFeedUpdate } from "@truth-market/swarm-verified-fetch";

const update = await verifiedFetchFeedUpdate({
  owner: "0x<feed-owner>",
  topic: "0x<32-byte-topic>",
  index: 0
});

console.log(update.reference);
console.log(update.targetReference);

const response = await verifiedFetchFeed({
  owner: "0x<feed-owner>",
  topic: "0x<32-byte-topic>",
  index: 0
});

console.log(response.metadata.feed?.updateReference);
console.log(await response.text());
```

For large immutable blobs, use stream mode. Bytes are yielded only after the corresponding Swarm chunk has been verified. Whole-payload metadata such as `contentHash` is available after the stream completes:

```ts
const response = await verifiedFetch("<raw-immutable-reference>", {
  gatewayUrl: "http://localhost:1633",
  responseType: "stream"
});

for await (const chunk of response.body) {
  // write chunk to a file, hash sink, HTTP response, etc.
}

const proof = await response.completion;
console.log(proof.chunksVerified);
console.log(proof.contentHash);
```

For slower or less reliable gateways, use fetch-style cancellation plus progress, retry/backoff, and multi-gateway availability options. Failover is the default strategy; `gatewayStrategy: "race"` asks all configured gateways for each chunk and accepts the first chunk that verifies:

```ts
const response = await verifiedFetch("bzz://<manifest-reference>/claim-rules.json", {
  gateways: [
    "https://download.gateway.ethswarm.org",
    "https://gateway-2.example",
    "http://localhost:1633"
  ],
  gatewayStrategy: "race",
  retry: { attempts: 3, baseDelayMs: 250, maxDelayMs: 2_000 },
  signal: abortController.signal,
  timeoutMs: 10_000,
  onProgress(event) {
    if (event.type === "bytesEnqueued" || event.type === "complete") {
      console.log(event.bytesVerified, event.totalBytes, event.chunksVerified);
    }
  }
});
```

For shared configuration, create a client:

```ts
import { createSwarmVerifiedFetch } from "@truth-market/swarm-verified-fetch";

const swarm = createSwarmVerifiedFetch({ gatewayUrl: "http://localhost:1633" });
const response = await swarm.fetch("<raw-immutable-reference>");
```

Manual verification APIs are available when callers already have bytes or chunks and do not want network fetching:

```ts
import { verifyBytesHash, verifySwarmBytes, verifySwarmChunk } from "@truth-market/swarm-verified-fetch";

const chunk = verifySwarmChunk(reference, rawChunkBytes);
const payload = await verifySwarmBytes(rootReference, { chunks: chunkMap });
const hashProof = verifyBytesHash(payload.bytes, claimRulesHash);
```

## Fetch Compatibility

Supported now:

- `AbortSignal` via `signal`.
- Timeout cancellation via `timeoutMs`.
- Public gateway fallback when no gateway is configured: mainnet by default, or testnet with `network: "testnet"`.
- SDK-style cancellation via `cancelToken`, accepting a promise, `{ promise }`, `{ aborted/canceled/cancelled }`, `{ throwIfRequested() }`, `{ onCancellationRequested(listener) }`, or `{ subscribe(listener) }`.
- Custom fetch implementations via `fetch`.
- Request headers via `headers`.
- Safety limits via `maxChunks`.
- Buffered and streaming responses via `responseType: "buffer" | "stream"`.
- Verified Mantaray manifest path reads for `bzz://<manifest-reference>/path/to/file.json`.
- File name, content type, path, last-modified hints, and byte length surfaced through typed metadata. Manifest-derived fields come from verified manifest bytes, not gateway HTTP headers. If a verified manifest declares a file size, it must match the verified byte-tree span.
- Verified sequence feed reference reads via `verifiedFetchFeed`, `verifiedFetchFeedUpdate`, `feed://<owner>/<topic>?index=<n>`, and manual `verifySingleOwnerChunk` / `verifyFeedUpdate`.
- Progress callbacks via `onProgress`, with `chunkFetched`, `chunkVerified`, `socVerified`, `bytesEnqueued`, and `complete` events.
- Retry/backoff via `retry`.
- Multi-gateway failover via `gateways`.
- Multi-gateway racing via `gatewayStrategy: "race"`.
- Typed errors with stable `code` values.

Nice to have next:

- Advanced website routing (`/` index documents, error documents, extension fallback).
- Range reads and resumable streams for large immutable blobs.
- Stream `tee()`/cache helpers that preserve completion proof semantics.
- Concurrency controls for chunk-tree traversal.
- Optional schema validation helpers for JSON claim/rules documents after byte verification.

## Why This Exists

Swarm content-addressed chunks are addressed by their hash. If a gateway returns bytes for a chunk reference, the client can recompute the Swarm CAC address and reject tampered content before handing it to application code.

For immutable data this package verifies the content-addressed chunk path:

```text
span || payload -> BMT(payload) -> keccak256(span || BMT root) -> reference
```

For mutable feeds, the package verifies SOC/feed payloads by checking the owner signature and sequence feed update path rather than trusting the gateway response. Exact feed indexes are cryptographically verified; latest-index discovery can be gateway-assisted, so applications that need a specific version should pass `index`.

## Bounty Implementation Plan

See [docs/verification-plan.md](./docs/verification-plan.md).

## Development

```sh
pnpm install
pnpm check
pnpm build
```

Optional local Bee e2e tests publish real bytes through `/bytes`, then verify the raw chunk tree through `/chunks`:

```sh
SWARM_KV_BEE_API_URL=http://localhost:1633 \
SWARM_POSTAGE_BATCH_ID=<your-batch-id> \
pnpm test:e2e
```

Public gateway e2e tests are fixture-driven. A populated public testnet fixture is checked in, so the easiest live run is:

```sh
cp .env.e2e.example .env.e2e
pnpm test:e2e
```

`.env.e2e` is auto-loaded by Vitest and points at:

- `test/fixtures/public-gateway.example.json`: public testnet raw JSON, multi-chunk bytes, a Mantaray manifest path with verified metadata, and a SOC/feed reference update.
- `test/fixtures/live-registry.testnet.example.json`: registry-shaped public testnet data for the cross-package verifier test.
- `https://api.gateway.testnet.ethswarm.org`: a public testnet gateway used for live verified fetches and postageless test uploads.

You can still override the public gateway fixture directly:

```sh
SWARM_PUBLIC_E2E_FIXTURE=test/fixtures/public-gateway.example.json pnpm test:e2e
```

See [docs/public-e2e-data-plan.md](./docs/public-e2e-data-plan.md) for the fixture data plan. The public e2e command also includes MITM tests that fetch real gateway chunks and mutate them in-process to prove corrupted live responses are rejected.

The default `pnpm test` run includes a public-gateway configuration check. If no public fixture is configured it prints a warning and skips the live public/MITM cases; once the fixture is present, those cases run as part of the default test suite.

To verify live registry data that was published through `@truth-market/swarm-kv`, run the KV e2e first, then point this package at the generated fixture and gateway:

```sh
cd ../swarm-kv
pnpm test:e2e

cd ../swarm-verified-fetch
SWARM_E2E_GATEWAY_URL=https://api.gateway.testnet.ethswarm.org \
SWARM_E2E_REGISTRY_FIXTURE=../swarm-kv/.e2e/live-registry-references.json \
pnpm test:e2e
```

The KV command uses Swarm's public testnet upload gateway by default. To publish through a local Bee instead, set `SWARM_KV_BEE_API_URL` and `SWARM_POSTAGE_BATCH_ID` before running the KV e2e suite, then point `SWARM_E2E_GATEWAY_URL` at the same readable gateway for this package.

For a local Bee with a normal postage batch, remove `SWARM_E2E_POSTAGE_MODE=none` from `.env.e2e` and set `SWARM_E2E_BEE_API_URL` or `SWARM_KV_BEE_API_URL` plus `SWARM_POSTAGE_BATCH_ID`.

The package is standalone for now because the repository does not yet have a root pnpm workspace.

## References

- Swarm chunk types: https://docs.ethswarm.org/docs/develop/tools-and-features/chunk-types/
- Swarm DISC / chunk model: https://docs.ethswarm.org/docs/concepts/DISC/
- Bee API `/chunks`, `/bytes`, `/bzz`, `/feeds`: https://docs.ethswarm.org/api/
- bee-js SOC and feeds: https://bee-js.ethswarm.org/docs/soc-and-feeds/
- Go BMT reference package: https://pkg.go.dev/github.com/ethersphere/bee/pkg/bmt
