# Public Gateway E2E Data Plan

The public e2e suite is fixture-driven because Swarm data availability depends on a gateway that exposes raw `/chunks/:reference` reads. The test should verify public data, but the refs should be owned and refreshed by the project instead of copied from an arbitrary website.

## Checked-In Testnet Fixture

The repository includes a populated public testnet fixture:

- [`../test/fixtures/public-gateway.example.json`](../test/fixtures/public-gateway.example.json)
- [`../test/fixtures/live-registry.testnet.example.json`](../test/fixtures/live-registry.testnet.example.json)
- [`../.env.e2e.example`](../.env.e2e.example)

Run the live public gateway suite with:

```sh
cp .env.e2e.example .env.e2e
pnpm test:e2e
```

The fixture contains a small, pinned Swarm bundle published through the public testnet gateway:

1. `claim-rules.json` as raw immutable JSON.
2. `pattern.bin` as a multi-chunk immutable byte blob, `4096 * 3 + 777` bytes.
3. A Mantaray manifest path for `claim-rules.json` with content-type, file-name, and byte-length metadata.
4. A Bee-compatible SOC/sequence feed update that points at the verified `claim-rules.json` reference.
5. A registry-shaped index and values fixture used by `test/e2e.live-registry-gateway.test.ts`.

`.env.e2e.example` also enables `SWARM_E2E_POSTAGE_MODE=none` for `https://api.gateway.testnet.ethswarm.org`, so the upload-style e2e can publish temporary deterministic data without a local Bee postage batch. For local Bee runs, remove that setting and provide `SWARM_POSTAGE_BATCH_ID`.

Record for each object:

- Swarm reference.
- Exact byte length.
- Keccak-256 hash of the exact file bytes.
- Content type.
- File name.
- Feed owner, topic, index, update reference, target reference, and timestamp, when applicable.
- Manifest path, when applicable.

To test a refreshed or project-owned fixture, store live refs in an untracked file:

```sh
cp test/fixtures/public-gateway.example.json test/fixtures/public-gateway.fixture.json
```

Then run:

```sh
SWARM_PUBLIC_E2E_FIXTURE=test/fixtures/public-gateway.fixture.json pnpm test:e2e
```

`SWARM_PUBLIC_E2E_FIXTURE` can also be an inline JSON string with the same schema, which is useful in CI secrets. Vitest also auto-loads `.env.e2e` and `.env.e2e.local` when present.

The default test command includes a public-gateway configuration check. If this fixture is not configured, `pnpm test` and `pnpm test:e2e` print a warning and skip only the live public/MITM cases.

## Live MITM Coverage

The public e2e command also runs a live man-in-the-middle suite when the fixture is configured. These tests still fetch from the real configured gateway, but the test `fetch` wrapper mutates selected `/chunks/:reference` responses before the verifier sees them.

Mutations currently include:

- Flip one payload byte.
- Flip one span byte.
- Truncate the raw chunk.
- Extend the raw chunk.
- Replace the gateway bytes with a valid CAC chunk for a different reference.

The MITM suite runs those mutations against:

- A raw immutable root chunk.
- The first non-root child chunk for the multi-chunk fixture.
- A Mantaray manifest root chunk before path resolution.
- A resolved target root chunk after manifest path resolution.
- A SOC/feed update chunk before following its target reference.
- The resolved immutable target root after feed verification.

Every case must fail before bytes are exposed to application code.

## Candidate Gateways

Start with a Sepolia Bee node or gateway controlled by the project. If a public gateway exposes the same testnet chunks, add it to `gatewayUrls` so the suite can exercise `gatewayStrategy: "race"` against real public infrastructure.

The current code needs `/chunks/:reference` support. A gateway that only serves reconstructed `/bzz` or `/bytes` payloads is not enough for full chunk-tree verification.

## Public Data Selection

Use project-owned testnet data first:

- The canonical TruthMarket claim/rules sample JSON.
- A small text document for UTF-8 and `text/plain` metadata.
- A deterministic binary pattern for multi-chunk tree verification.
- A Mantaray collection for verified path resolution and verified file metadata.
- A deterministic SOC/feed reference update for mutable-read verification.

Useful external public data can be added later as smoke coverage only after its exact refs and hashes are pinned in the fixture. Do not make CI depend on an arbitrary public website staying retrievable forever.

## Official Swarm Context

- Swarm Bee can be configured for the Sepolia testnet with `mainnet: false` and a Sepolia RPC endpoint.
- The testnet token is sBZZ on Sepolia.
- The Bee API exposes `/bzz`, `/bytes`, and `/chunks`; verified fetch uses `/chunks` internally.
- Swarm Gateway exposes Bee-backed HTTP access to public content, but gateway availability is an availability concern only. Verification remains local.
