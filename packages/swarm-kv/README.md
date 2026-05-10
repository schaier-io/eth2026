<p align="center">
  <img src="../../brand-mark.svg" alt="TruthMarket" width="96" />
</p>

# @truth-market/swarm-kv

A developer-friendly key-value store on Swarm.

`@truth-market/swarm-kv` gives app developers the familiar shape they expect:

```ts
await store.put("settings", { theme: "dark" });
const settings = await store.getJson("settings");
```

The package hides Swarm upload, postage batch, key-topic, index, and verification plumbing behind a small TypeScript API. Reads use the sibling `@truth-market/swarm-verified-fetch` package to verify Swarm content-addressed chunks before exposing bytes to application code.

## API Shape

Most apps only need one object and five methods:

```ts
await store.put("settings", { theme: "dark" });

const result = await store.get("settings");
const settings = await store.getJson("settings");
const name = await store.getString("profile:name");
const avatar = await store.getBytes("avatar");

const keys = await store.list();
await store.delete("settings");
```

`await store.put(...)` resolves after the value upload, index upload, verification, and optional latest-index feed publish are done. Concurrent `put` and `delete` calls on the same store instance wait their turn in an internal queue.

`get`, `getString`, `getJson`, and `getBytes` return `null` when the key is missing. The general `get()` returns a TypeScript discriminated union, so `result.kind` narrows `result.value` to `string`, `JsonValue`, or `Uint8Array`. `put` accepts strings, JSON values, `Uint8Array`, `ArrayBuffer`, and `Blob`. `list()` returns sorted keys, and `entries()` is an async iterator over the current index.

## Status

Implemented:

- `put`, `get`, `getString`, `getJson`, `getBytes`
- string, JSON, `Uint8Array`, `ArrayBuffer`, and `Blob` values
- `list`, `has`, async `entries()` iteration
- `delete` with an indexed tombstone
- postage batch reuse and optional purchase through Bee
- encrypted private mode with stable `encryptionKey` material
- deterministic Swarm topic per key
- optional index feed for stable latest-index discovery
- optional feed manifest creation for callers that want a stable Swarm pointer
- pluggable feed writer adapter for signed SOC/feed updates
- pluggable feed reader adapter for verified latest-index discovery
- optimistic write guard with `ifIndexReference`
- serialized same-store writes to avoid local lost updates
- client-side verification through `@truth-market/swarm-verified-fetch`

## Install

This package is not published yet. In this repository, consume it through the local workspace/file dependency. Once published, the install shape will be:

```sh
pnpm add @truth-market/swarm-kv
```

For local development in this repo:

```sh
sfw pnpm install
pnpm check
pnpm build
```

## Running E2E Tests

The default test command includes the fake-Bee e2e suite. It runs without network access and covers the full library flow against a Bee-like API: `put`, `get`, listing, deletion, cancellation, concurrency, feeds, postage handling, large multi-chunk values, and one test per supported file/media type.

```sh
pnpm test
```

Live e2e tests publish real data. When no Bee node is configured, `pnpm test:e2e` falls back to Swarm's public testnet upload gateway at `https://api.gateway.testnet.ethswarm.org` and uses a dummy postage batch header because that gateway manages upload postage for callers:

```sh
pnpm test:e2e
```

To run the same tests against your own Bee node instead, start Bee, create or reuse a postage batch, then run:

```sh
SWARM_KV_BEE_API_URL=http://localhost:1633 \
SWARM_POSTAGE_BATCH_ID=<your-batch-id> \
pnpm test:e2e
```

Local Bee environment:

- `SWARM_KV_BEE_API_URL`: Bee API used for writes, usually `http://localhost:1633`.
- `SWARM_POSTAGE_BATCH_ID`: 64-byte postage batch id returned by Bee.

Optional environment:

- `SWARM_E2E_BEE_API_URL`: legacy alias for `SWARM_KV_BEE_API_URL`.
- `SWARM_E2E_GATEWAY_URL`: gateway used for reads when it should differ from the Bee API used for writes.
- `SWARM_E2E_REGISTRY_FIXTURE`: output path for registry verifier references. Defaults to `.e2e/live-registry-references.json`.
- `SWARM_KV_TEST_LOG=0`: disables the e2e progress log lines.

Public fallback behavior:

- Leave `SWARM_KV_BEE_API_URL`, `SWARM_E2E_BEE_API_URL`, and `SWARM_POSTAGE_BATCH_ID` unset to use the public testnet gateway.
- The fallback does not call `/stamps` and does not require local Bee funding.
- The tests still verify downloaded chunks client-side, so gateway corruption is caught even though the gateway pays/handles upload postage.
- The public gateway can return gzipped Bee API JSON without a `Content-Encoding` header. The client decodes that automatically by default.

If `SWARM_KV_BEE_API_URL` is set but `SWARM_POSTAGE_BATCH_ID` is missing, Vitest intentionally skips the local Bee suites and prints a warning listing the missing variables plus the command to enable them. A configured live run prints progress for every test, including each `put`, content type, value kind, byte count, references, verification result, and chunk count where relevant.

The live suites include:

- `test/e2e.local-bee.test.ts`: real string, JSON, binary, file-style content types, image/video media bytes, large multi-chunk values, and a feed manifest.
- `test/e2e.live-registry.local-bee.test.ts`: registry-shaped package JSON, release JSON, README markdown, tarball bytes, and one verifier-reference test per registry file type.

After the registry fixture is written, the sibling verifier package can check those references through the configured gateway:

```sh
cd ../swarm-verified-fetch
SWARM_E2E_GATEWAY_URL=http://localhost:1633 \
SWARM_E2E_REGISTRY_FIXTURE=../swarm-kv/.e2e/live-registry-references.json \
pnpm test:e2e
```

See [Local Swarm Gateway](./docs/local-swarm-gateway.md) for Bee setup and postage-batch creation.

## Five-Minute Start

Run Bee locally and set a postage batch:

```sh
export SWARM_KV_BEE_API_URL=http://localhost:1633
export SWARM_POSTAGE_BATCH_ID=<your-64-byte-batch-id>
```

Then write and read values:

```ts
import { createSwarmKvStore, fixedPostage } from "@truth-market/swarm-kv";

const store = createSwarmKvStore({
  beeApiUrl: process.env.SWARM_KV_BEE_API_URL,
  gatewayUrl: process.env.SWARM_KV_BEE_API_URL,
  postage: fixedPostage(process.env.SWARM_POSTAGE_BATCH_ID!),
  privateByDefault: false
});

await store.put("profile:name", "Ada");
await store.put("settings", { theme: "dark", compact: true });
await store.put("avatar", new Uint8Array([1, 2, 3, 4]));

console.log(await store.getString("profile:name"));
console.log(await store.getJson("settings"));
console.log(await store.getBytes("avatar"));

for await (const entry of store.entries()) {
  console.log(entry.key, entry.reference, entry.verification.verified);
}

console.log("keys", await store.list());
console.log("database index", store.indexReference);
```

Save `store.indexReference` after writes. Reopen the same database later with:

```ts
const store = createSwarmKvStore({
  rootReference: "<previous-index-reference>",
  gatewayUrl: "https://download.gateway.ethswarm.org",
  privateByDefault: false
});

const settings = await store.getJson("settings");
```

## Stable Latest Index

For a database-like UX, enable `indexFeed`. The store will derive a stable Swarm feed topic for the latest index from your namespace and owner.

Feed updates are signed SOC writes, and feed reads must verify that signed update before trusting the returned latest index reference. This package keeps both steps behind small adapters so the `get` / `put` API stays simple:

```ts
import {
  createSwarmKvStore,
  fixedPostage,
  type SwarmKvFeedReader,
  type SwarmKvFeedWriter
} from "@truth-market/swarm-kv";

const feedWriter: SwarmKvFeedWriter = {
  async updateReference(input) {
    // Wire this to bee-js FeedWriter, swarm-cli, or a low-level SOC writer.
    // The adapter receives owner, topic, reference, postageBatchId, and URLs.
  }
};

const feedReader: SwarmKvFeedReader = {
  async readLatestReference(input) {
    // Wire this to a feed/SOC verifier. Return verified: true only after
    // checking the feed update signature for input.owner + input.topic.
    return { reference: null, verified: true };
  }
};

const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  gatewayUrl: "http://localhost:1633",
  postage: fixedPostage(process.env.SWARM_POSTAGE_BATCH_ID!),
  owner: "0x...",
  privateByDefault: false,
  indexFeed: true,
  feedReader,
  feedWriter
});

await store.put("settings", { theme: "dark" });
console.log(await store.getIndexFeedInfo());
```

Read-only clients can reopen from the feed without a writer, but still need a verifying reader:

```ts
const store = createSwarmKvStore({
  gatewayUrl: "https://download.gateway.ethswarm.org",
  owner: "0x...",
  namespace: "my-dapp:v1",
  privateByDefault: false,
  indexFeed: { writeLatest: false, readLatest: true },
  feedReader
});
```

If you omit `feedReader`, `readLatest` defaults to `false`. Setting `readLatest: true` without a reader throws instead of trusting raw `/feeds/...` gateway bytes.

## Private By Default

Pass stable `encryptionKey` material and values are encrypted before upload. The index is encrypted too, so key names and listing metadata are not public by default.

```ts
import { fixedPostage } from "@truth-market/swarm-kv";

const signer = {
  address: account,
  signMessage: (message: string) =>
    window.ethereum.request({
      method: "personal_sign",
      params: [message, account]
    })
};

const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  gatewayUrl: "http://localhost:1633",
  postage: fixedPostage(process.env.SWARM_POSTAGE_BATCH_ID!),
  namespace: "my-dapp:v1",
  owner: account,
  signer,
  encryptionKey: await loadStableKeyMaterial(account)
});

await store.put("bookmarks", [
  { title: "Swarm docs", href: "https://docs.ethswarm.org/" }
]);
```

Private keys are never passed to the library. A signer is still useful for deriving the owner address and for feed writers, but signer-derived encryption is disabled by default because Ethereum JSON-RPC does not require every wallet or KMS to return the same signature for the same message.

If you know your signer is deterministic and want the old quick-start behavior, opt in explicitly:

```ts
const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  gatewayUrl: "http://localhost:1633",
  postage: fixedPostage(process.env.SWARM_POSTAGE_BATCH_ID!),
  namespace: "my-dapp:v1",
  signer,
  allowSignerDerivedEncryption: true
});
```

For anything you expect to reopen reliably across wallets, browsers, or hardware signers, prefer stable `encryptionKey` material and keep it in your app's secure storage.

Bee's native `Swarm-Encrypt: true` upload mode works differently: Bee generates random encryption keys and returns a 64-byte reference whose second half is the decryption key. That is convenient with a local Bee node, but public gateways must not receive full encrypted references because they include key material. This package encrypts client-side before upload so public gateways only see encrypted chunks.

## Postage

Uploads require a Bee postage batch. The simplest non-auto path is to pass a known batch id with `manualPostage` or `fixedPostage`.

```ts
import { createSwarmKvStore, manualPostage } from "@truth-market/swarm-kv";

const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  postage: manualPostage(process.env.SWARM_POSTAGE_BATCH_ID!)
});
```

Manual mode never calls `/stamps` to discover, buy, or top up batches. It only sends your batch id on uploads. If you omit postage entirely, writes fail fast instead of silently consuming a random local stamp.

For demos with a funded local Bee node, `autoPostage` discovers an existing usable batch or buys one:

```ts
import { autoPostage, createSwarmKvStore } from "@truth-market/swarm-kv";

const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  postage: autoPostage({ amount: "1000000000", depth: 20 })
});
```

Auto mode is explicit opt-in. It revalidates the selected batch before each write sequence, so a cached batch that became unusable, expired, or too short-lived is topped up or replaced rather than reused forever.

For a smarter demo policy, ask the store to select an existing usable batch with enough capacity/lifetime, top it up when TTL is getting low, or buy a new one if none qualify:

```ts
import { autoPostage, createSwarmKvStore } from "@truth-market/swarm-kv";

const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  postage: autoPostage({
    amount: "1000000000",
    depth: 20,
    minDepth: 20,
    minTTLSeconds: 3600,
    topUpBelowTTLSeconds: 7200,
    topUpAmount: "1000000000",
    topUpRetryIntervalMs: 120_000
  })
});
```

Batch selection prefers usable, non-expired batches that meet `minDepth` and `minTTLSeconds`, then picks lower utilization, higher depth, and longer TTL. If a batch is otherwise valid but below the TTL policy, auto mode can top it up before buying a replacement. Concurrent writes share the same pending top-up, and `topUpRetryIntervalMs` prevents repeat top-up transactions while Bee is still propagating the previous one.

For safer local development, label your app-owned batches and tell auto mode to only use those:

```ts
const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  postage: autoPostage({
    label: "truthmarket-dev-kv",
    amount: "1000000000",
    depth: 20,
    minTTLSeconds: 3600
  })
});
```

When buying a new batch, the label is sent to Bee as the stamp label. When selecting existing batches, you can use `label`, `labelPrefix`, and `selectBatch`:

```ts
const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  postage: autoPostage({
    labelPrefix: "truthmarket-dev",
    selectBatch: (stamp) => stamp.label?.endsWith("-kv") === true,
    minDepth: 20
  })
});
```

Typed postage helpers:

```ts
import {
  autoPostage,
  fixedPostage,
  manualPostage,
  type PostageBatchResult,
  type SwarmKvPostageBatchInfo,
  type SwarmKvAutoPostageOptions,
  type SwarmKvPostageConfig
} from "@truth-market/swarm-kv";

const manual: SwarmKvPostageConfig = manualPostage("<batch-id>");
const fixed: SwarmKvPostageConfig = fixedPostage("<batch-id>");

const auto: SwarmKvPostageConfig = autoPostage({
  amount: "1000000000",
  depth: 20,
  minTTLSeconds: 3600,
  selectBatch: (stamp: SwarmKvPostageBatchInfo) => stamp.usable
} satisfies SwarmKvAutoPostageOptions);

const selected: PostageBatchResult = await store.ensurePostageBatch();
console.log(selected.batchId, selected.source, selected.label, selected.batchTTL);
```

## API

```ts
const put = await store.put("key", value);
put.reference;      // immutable value reference
put.indexReference; // latest database index reference

const result = await store.get("key");
result?.value;
result?.verification.verified;

if (result?.kind === "bytes") {
  result.value; // Uint8Array
}

await store.delete("key");
await store.list();
await store.has("key");

for await (const entry of store.entries()) {
  console.log(entry.key, entry.value);
}
```

The general `get()` method decodes values from stored metadata:

```ts
const value = await store.get("anything");

if (value?.kind === "string") {
  value.value.toUpperCase();
}

if (value?.kind === "json") {
  value.value; // JsonValue
}

if (value?.kind === "bytes") {
  value.value.byteLength;
}
```

Use `getJson<T>()` or `get<T>()` when your app knows a stricter JSON shape:

```ts
const settings = await store.getJson<{ theme: "dark" | "light" }>("settings");
const raw = await store.get<{ theme: string }>("settings");
```

### Cancellation And Timeouts

Public operations accept standard `AbortSignal` cancellation and `timeoutMs`:

```ts
const controller = new AbortController();

const put = store.put("settings", nextSettings, {
  signal: controller.signal,
  timeoutMs: 30_000
});

controller.abort();
await put; // throws SwarmKvAbortError
```

You can also set a default timeout for the store:

```ts
const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  timeoutMs: 30_000
});
```

Per-call `timeoutMs` overrides the default. Timeouts throw `SwarmKvTimeoutError`. A queued write can be aborted or timed out while it is waiting behind an earlier write; it will not run afterward.

### Missing Keys

Missing keys are ordinary control flow, not exceptions:

```ts
const settings = await store.getJson("settings");

if (settings === null) {
  await store.put("settings", { theme: "system" });
}
```

Typed helpers follow the same rule:

```ts
await store.get("missing");       // null
await store.getString("missing"); // null
await store.getJson("missing");   // null
await store.getBytes("missing");  // null
await store.has("missing");       // false
```

Missing keys do not trigger a value fetch; the store checks the verified index first.

## Stable Pointers And Feeds

Every key maps to a deterministic 32-byte Swarm topic:

```ts
const topic = store.topicForKey("settings");
```

The package also stores a mutable database index document on Swarm so `list()` and `entries()` do not require knowing every value reference. If your app wants a stable Swarm pointer for the latest index, create a feed manifest:

```ts
const manifest = await store.createFeedManifest();
console.log(manifest.owner);
console.log(manifest.topic);
console.log(manifest.manifestReference);
```

Apps that need fully automated feed updates can use this manifest data with Bee feed tooling. The KV API stays simple: app code uses keys and values, not feed internals.

## Concurrent Writes

Swarm feed-style state is append-only, so two independent store instances can race. A single store instance serializes its own writes, and you can use the optimistic guard when you want compare-and-swap behavior across callers:

```ts
const base = store.indexReference;
await store.put("settings", nextSettings, { ifIndexReference: base });
```

If another write moved the index first, the call throws `SwarmKvConflictError`.

If you start two writes on the same store instance, the later write waits for the earlier write to finish:

```ts
const first = store.put("a", "one");
const second = store.put("b", "two");

await first;
await second;
```

The promise returned by each `put` resolves only after that write is fully committed to the latest index.

## Large Values

Values can span multiple Swarm chunks. Reads reconstruct and verify the content-addressed chunk tree through `@truth-market/swarm-verified-fetch`, so callers still use the same `put` / `getBytes` API:

```ts
const bytes = new Uint8Array(await file.arrayBuffer());

await store.put("backup:file", bytes, {
  contentType: file.type || "application/octet-stream"
});

const restored = await store.getBytes("backup:file");
```

The default maximum plaintext value size is 64 MiB:

```ts
const store = createSwarmKvStore({
  maxPayloadBytes: 128 * 1024 * 1024
});
```

If a value exceeds `maxPayloadBytes`, `put` throws `SwarmKvPayloadError` before uploading or spending postage.

## Examples

- [examples/basic.ts](./examples/basic.ts): public strings, JSON, binary values, listing, iteration, deletion.
- [examples/private-browser.ts](./examples/private-browser.ts): browser signer adapter for private-by-default storage.

## Local Swarm Gateway

For Docker Bee setup, CORS, postage batches, and smoke-test upload/download commands, see [docs/local-swarm-gateway.md](./docs/local-swarm-gateway.md).

## Gateway Compatibility

Some public gateways return gzipped Bee API JSON while omitting the `Content-Encoding: gzip` header. That breaks the platform `Response.json()` path because the runtime sees raw gzip bytes. `@truth-market/swarm-kv` reads Bee JSON responses as bytes and auto-decompresses gzip by default.

Disable the compatibility path when you want strict plain-JSON behavior:

```ts
const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  gatewayUrl: "http://localhost:1633",
  postage: fixedPostage(process.env.SWARM_POSTAGE_BATCH_ID!),
  decodeGzippedBeeJson: false
});
```

## Notes

- `beeApiUrl` is required for writes.
- `gatewayUrl` is used for reads and can point at a local Bee node or a public gateway.
- `decodeGzippedBeeJson` defaults to `true` for public gateway compatibility.
- Public reads verify immutable Swarm chunks before returning values.
- Private values require the same namespace, owner, and stable encryption key material to decrypt after reopening.
- Do not store wallet private keys, unrevealed commit-reveal nonces, or private strategy in public mode.
