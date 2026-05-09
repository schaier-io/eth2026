import { beforeEach, describe, expect, it } from "vitest";

import { SwarmGatewayError, SwarmVerificationError } from "@truth-market/swarm-verified-fetch";

import {
  SwarmKvConfigError,
  SwarmKvAbortError,
  SwarmKvConflictError,
  SwarmKvFeedError,
  SwarmKvGatewayError,
  SwarmKvPayloadError,
  SwarmKvPostageError,
  SwarmKvTimeoutError,
  SwarmKvVerificationError,
  autoPostage,
  createSwarmKvStore,
  fixedPostage,
  manualPostage,
  type FetchLike,
  type SwarmKvClientOptions,
  type SwarmKvFeedReader,
  type SwarmKvFeedWriter,
  type SwarmKvStore
} from "../src/index.js";
import { byteLength, logE2eStep, logE2eTestStart, traceE2ePut } from "./e2e-log.js";
import { copyArrayBuffer, createFakeBee, mutateLastByte, patternedBytes } from "./fake-bee.js";
import { FILE_TYPE_CASES, assertFileTypeRoundTrip } from "./file-type-fixtures.js";

beforeEach((context) => {
  logE2eTestStart(context.task.name);
});

describe("Swarm KV e2e against a Bee-like mock", () => {
  it("publishes, stores, verifies, and reopens immutable values across supported data types", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);
    const binary = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const arrayBufferBytes = new Uint8Array([9, 8, 7, 6]);
    const multiChunk = patternedBytes(4096 * 3 + 513);

    const stringPut = await traceE2ePut(
      { key: "profile:name", valueType: "string", bytes: byteLength("Ada Lovelace") },
      () => store.put("profile:name", "Ada Lovelace")
    );
    const jsonPut = await traceE2ePut(
      { key: "settings", valueType: "json", bytes: byteLength(JSON.stringify({ theme: "dark", compact: true })) },
      () => store.put("settings", { theme: "dark", compact: true })
    );
    const bytesPut = await traceE2ePut({ key: "avatar", valueType: "Uint8Array", bytes: binary.byteLength }, () =>
      store.put("avatar", binary)
    );
    const arrayBufferPut = await traceE2ePut(
      { key: "buffer", valueType: "ArrayBuffer", bytes: arrayBufferBytes.byteLength },
      () => store.put("buffer", copyArrayBuffer(arrayBufferBytes))
    );
    const blobPut = await traceE2ePut(
      { key: "blob", valueType: "Blob", contentType: "application/test", bytes: 3 },
      () => store.put("blob", new Blob([new Uint8Array([4, 5, 6])], { type: "application/test" }))
    );
    const multiPut = await traceE2ePut(
      { key: "large", valueType: "Uint8Array", bytes: multiChunk.byteLength },
      () => store.put("large", multiChunk)
    );
    const multiChunkUpload = bee.uploads.find((upload) => upload.reference === multiPut.reference);

    logE2eStep("put:chunks", {
      key: "large",
      bytes: multiChunk.byteLength,
      chunks: multiChunkUpload?.leafReferences.length
    });

    expect([stringPut, jsonPut, bytesPut, arrayBufferPut, blobPut, multiPut].every((put) => put.verification.verified))
      .toBe(true);
    expect(multiPut.reference).toHaveLength(64);
    expect(multiChunkUpload?.leafReferences.length).toBeGreaterThan(1);

    await expect(store.getString("profile:name")).resolves.toBe("Ada Lovelace");
    await expect(store.getJson("settings")).resolves.toEqual({ theme: "dark", compact: true });
    await expect(store.getBytes("avatar")).resolves.toEqual(binary);
    await expect(store.getBytes("buffer")).resolves.toEqual(arrayBufferBytes);
    await expect(store.getBytes("blob")).resolves.toEqual(new Uint8Array([4, 5, 6]));
    await expect(store.getBytes("large")).resolves.toEqual(multiChunk);
    await expect(store.list()).resolves.toEqual(["avatar", "blob", "buffer", "large", "profile:name", "settings"]);

    const reopened = createPublicStore(bee.fetch, store.indexReference);

    await expect(reopened.getString("profile:name")).resolves.toBe("Ada Lovelace");
    await expect(reopened.getBytes("large")).resolves.toEqual(multiChunk);
  });

  describe("file content types", () => {
    for (const fileCase of FILE_TYPE_CASES) {
      it(`round-trips ${fileCase.name} with preserved metadata`, async () => {
        const bee = createFakeBee();
        const store = createPublicStore(bee.fetch);

        await assertFileTypeRoundTrip(store, fileCase);
      });
    }
  });

  it("handles missing keys as null without fetching value chunks", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);

    await expect(store.get("missing")).resolves.toBeNull();
    await expect(store.getString("missing")).resolves.toBeNull();
    await expect(store.getJson("missing")).resolves.toBeNull();
    await expect(store.getBytes("missing")).resolves.toBeNull();
    await expect(store.has("missing")).resolves.toBe(false);
    await expect(store.list()).resolves.toEqual([]);
    expect(bee.requests.some((request) => request.path.startsWith("/chunks/"))).toBe(false);
  });

  it("stores large multi-chunk values and rejects oversized values before upload", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);
    const large = patternedBytes(4096 * 5 + 777);

    const put = await store.put("large:blob", large);
    const upload = bee.uploads.find((candidate) => candidate.reference === put.reference);

    expect(upload?.leafReferences.length).toBeGreaterThan(1);
    await expect(store.getBytes("large:blob")).resolves.toEqual(large);

    const constrained = createPublicStore(bee.fetch, null, {
      maxPayloadBytes: 4
    });
    const uploadsBeforeReject = bee.uploads.length;

    await expect(constrained.put("too-large", new Uint8Array([1, 2, 3, 4, 5]))).rejects.toBeInstanceOf(
      SwarmKvPayloadError
    );
    expect(bee.uploads).toHaveLength(uploadsBeforeReject);
  });

  it("times out a slow write and aborts before Bee records the upload", async () => {
    const bee = createFakeBee();
    const fetch: FetchLike = async (input, init) => {
      const url = new URL(input);

      if (url.pathname === "/bytes" && init?.method === "POST") {
        await sleepForTest(50, init.signal);
      }

      return bee.fetch(input, init);
    };
    const store = createPublicStore(fetch);

    await expect(store.put("slow", "value", { timeoutMs: 5 })).rejects.toBeInstanceOf(SwarmKvTimeoutError);
    expect(bee.uploads).toHaveLength(0);
    await expect(store.get("slow")).resolves.toBeNull();
  });

  it("aborts a queued write before it runs behind an earlier put", async () => {
    const bee = createFakeBee();
    const gate = createGate();
    let delayedFirstUpload = false;
    const fetch: FetchLike = async (input, init) => {
      const url = new URL(input);

      if (url.pathname === "/bytes" && init?.method === "POST" && !delayedFirstUpload) {
        delayedFirstUpload = true;
        gate.entered.resolve();
        await gate.release.promise;
      }

      return bee.fetch(input, init);
    };
    const store = createPublicStore(fetch);
    const controller = new AbortController();
    const first = store.put("first", "value");

    await gate.entered.promise;
    const second = store.put("second", "value", { signal: controller.signal });
    controller.abort();

    await expect(second).rejects.toBeInstanceOf(SwarmKvAbortError);
    gate.release.resolve();
    await expect(first).resolves.toMatchObject({ key: "first" });
    await expect(store.list()).resolves.toEqual(["first"]);
    expect(bee.uploads).toHaveLength(2);
  });

  it("does not propagate an aborted write to the index or feed after value upload", async () => {
    const bee = createFakeBee();
    const controller = new AbortController();
    let abortAfterValueUpload = true;
    let feedWrites = 0;
    const feedWriter: SwarmKvFeedWriter = {
      async updateReference(input) {
        feedWrites += 1;
        bee.writeFeedReference(input.owner.slice(2), input.topic, input.reference);
        return {
          reference: input.reference
        };
      }
    };
    const fetch: FetchLike = async (input, init) => {
      const response = await bee.fetch(input, init);
      const url = new URL(input);

      if (url.pathname === "/bytes" && init?.method === "POST" && abortAfterValueUpload) {
        abortAfterValueUpload = false;
        controller.abort();
      }

      return response;
    };
    const store = createPublicStore(fetch, null, {
      indexFeed: true,
      feedWriter
    });

    await expect(store.put("aborted", "value", { signal: controller.signal })).rejects.toBeInstanceOf(
      SwarmKvAbortError
    );
    expect(bee.uploads).toHaveLength(1);
    expect(feedWrites).toBe(0);
    expect(store.indexReference).toBeNull();
    await expect(store.get("aborted")).resolves.toBeNull();
    await expect(store.list()).resolves.toEqual([]);
  });

  it("does not run a queued write after its timeout expires", async () => {
    const bee = createFakeBee();
    const gate = createGate();
    let delayedFirstUpload = false;
    const fetch: FetchLike = async (input, init) => {
      const url = new URL(input);

      if (url.pathname === "/bytes" && init?.method === "POST" && !delayedFirstUpload) {
        delayedFirstUpload = true;
        gate.entered.resolve();
        await gate.release.promise;
      }

      return bee.fetch(input, init);
    };
    const store = createPublicStore(fetch);
    const first = store.put("first", "value");

    await gate.entered.promise;
    const second = store.put("second", "value", { timeoutMs: 5 });
    const secondExpectation = expect(second).rejects.toBeInstanceOf(SwarmKvTimeoutError);
    await sleepForTest(10);

    await secondExpectation;
    gate.release.resolve();
    await expect(first).resolves.toMatchObject({ key: "first" });
    await expect(store.list()).resolves.toEqual(["first"]);
    expect(bee.uploads).toHaveLength(2);
  });

  it("creates a mutable feed manifest pointer using the same Bee-like API contract", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);

    const manifest = await store.createFeedManifest("settings");

    expect(manifest.owner).toBe(`0x${"1".repeat(40)}`);
    expect(manifest.topic).toHaveLength(64);
    expect(manifest.manifestReference).toHaveLength(64);
    expect(bee.feedManifests).toEqual([
      {
        owner: "1".repeat(40),
        topic: manifest.topic,
        reference: manifest.manifestReference
      }
    ]);
  });

  it("publishes the latest index reference to a stable index feed and reopens from it", async () => {
    const bee = createFakeBee();
    const feedWriter = createFakeFeedWriter(bee);
    const feedReader = createFakeFeedReader(bee);
    const store = createPublicStore(bee.fetch, null, {
      indexFeed: true,
      feedWriter
    });

    await store.put("settings", { theme: "dark" });
    await store.put("profile:name", "Ada");

    const feedInfo = await store.getIndexFeedInfo();

    expect(feedInfo?.latestReference).toBe(store.indexReference);
    expect(feedInfo?.manifestReference).toHaveLength(64);
    expect(bee.feedManifests).toHaveLength(1);

    const reopened = createPublicStore(bee.fetch, null, {
      indexFeed: { writeLatest: false },
      feedReader
    });

    await expect(reopened.getJson("settings")).resolves.toEqual({ theme: "dark" });
    await expect(reopened.getString("profile:name")).resolves.toBe("Ada");
    expect(reopened.indexReference).toBe(store.indexReference);
  });

  it("fails fast when index feed writing is enabled without a feed writer", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch, null, {
      indexFeed: true
    });

    await expect(store.put("settings", { theme: "dark" })).rejects.toBeInstanceOf(SwarmKvFeedError);
    expect(bee.uploads).toHaveLength(0);
    expect(bee.requests.some((request) => request.path === "/bytes")).toBe(false);
  });

  it("requires verified index feed reads", async () => {
    const bee = createFakeBee();
    const unverifiedFeedReader: SwarmKvFeedReader = {
      async readLatestReference() {
        return {
          reference: "b".repeat(64),
          verified: false,
          details: "test reader refused SOC proof"
        };
      }
    };
    const store = createPublicStore(bee.fetch, null, {
      indexFeed: { writeLatest: false, readLatest: true },
      feedReader: unverifiedFeedReader
    });

    await expect(store.list()).rejects.toBeInstanceOf(SwarmKvFeedError);
  });

  it("rejects explicit latest-feed reads without a verifying reader", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch, null, {
      indexFeed: { writeLatest: false, readLatest: true }
    });

    await expect(store.list()).rejects.toBeInstanceOf(SwarmKvFeedError);
  });

  it("serializes optimistic writes so concurrent compare-and-swap calls cannot both commit", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);
    const writes = await Promise.allSettled([
      store.put("alpha", "one", { ifIndexReference: null }),
      store.put("beta", "two", { ifIndexReference: null })
    ]);
    const fulfilled = writes.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<SwarmKvStore["put"]>>> =>
        result.status === "fulfilled"
    );
    const rejected = writes.filter((result): result is PromiseRejectedResult => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(SwarmKvConflictError);
    const committedKey = fulfilled[0]?.value.key ?? "";

    await expect(store.list()).resolves.toEqual([committedKey]);
    expect(bee.uploads).toHaveLength(2);
  });

  it("preserves every unguarded same-store write queued concurrently", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);
    const items = Array.from({ length: 12 }, (_, index) => [`key:${index.toString().padStart(2, "0")}`, index] as const);

    const puts = await Promise.all(items.map(([key, value]) => store.put(key, { value })));

    expect(puts).toHaveLength(items.length);
    await expect(store.list()).resolves.toEqual(items.map(([key]) => key));

    for (const [key, value] of items) {
      await expect(store.getJson(key)).resolves.toEqual({ value });
    }
  });

  it("serializes mixed same-store puts and deletes without resurrecting deleted keys", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);

    await store.put("keep", "still here");
    await store.put("remove", "gone soon");

    const [putResult, deleteResult] = await Promise.all([
      store.put("new", { ok: true }),
      store.delete("remove")
    ]);

    expect(putResult.key).toBe("new");
    expect(deleteResult.deleted).toBe(true);
    await expect(store.list()).resolves.toEqual(["keep", "new"]);
    await expect(store.getString("remove")).resolves.toBeNull();
    await expect(store.getString("keep")).resolves.toBe("still here");
    await expect(store.getJson("new")).resolves.toEqual({ ok: true });
  });

  it("lets a feed writer reject stale separate-store commits with previousIndexReference", async () => {
    const bee = createFakeBee();
    const feedReader = createFakeFeedReader(bee);
    const feedWriter = createCompareAndSwapFakeFeedWriter(bee);
    const indexFeed = { autoCreateManifest: false };
    const initial = createPublicStore(bee.fetch, null, {
      indexFeed,
      feedReader,
      feedWriter
    });

    await initial.put("base", "shared");

    const baseReference = initial.indexReference;

    if (!baseReference) {
      throw new Error("Expected initial write to publish an index reference.");
    }

    const first = createPublicStore(bee.fetch, null, {
      indexFeed,
      feedReader,
      feedWriter
    });
    const second = createPublicStore(bee.fetch, null, {
      indexFeed,
      feedReader,
      feedWriter
    });

    await expect(first.list()).resolves.toEqual(["base"]);
    await expect(second.list()).resolves.toEqual(["base"]);
    expect(first.indexReference).toBe(baseReference);
    expect(second.indexReference).toBe(baseReference);

    const writes = await Promise.allSettled([
      first.put("first", "1", { ifIndexReference: baseReference }),
      second.put("second", "2", { ifIndexReference: baseReference })
    ]);
    const fulfilled = writes.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<SwarmKvStore["put"]>>> =>
        result.status === "fulfilled"
    );
    const rejected = writes.filter((result): result is PromiseRejectedResult => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(SwarmKvConflictError);

    const committedKey = fulfilled[0]?.value.key ?? "";
    const reopened = createPublicStore(bee.fetch, null, {
      indexFeed: { writeLatest: false, readLatest: true, autoCreateManifest: false },
      feedReader
    });

    await expect(reopened.list()).resolves.toEqual(["base", committedKey].sort());
    await expect(reopened.getString(committedKey)).resolves.toBe(committedKey === "first" ? "1" : "2");
  });

  it("rejects Bee upload responses whose references do not match the uploaded bytes", async () => {
    const bee = createFakeBee({ corruptUploadReferences: true });
    const store = createPublicStore(bee.fetch);

    await expect(store.put("settings", { theme: "dark" })).rejects.toBeInstanceOf(SwarmKvVerificationError);
  });

  it("auto-selects the best usable postage batch by policy", async () => {
    const bestBatch = "b".repeat(64);
    const bee = createFakeBee({
      existingStamps: [
        {
          batchID: "a".repeat(64),
          usable: true,
          depth: 17,
          batchTTL: 10_000,
          utilization: 0
        },
        {
          batchID: bestBatch,
          usable: true,
          depth: 20,
          batchTTL: 7_200,
          utilization: 0
        },
        {
          batchID: "c".repeat(64),
          usable: false,
          depth: 22,
          batchTTL: 20_000,
          utilization: 0
        }
      ]
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: autoPostage({
        minDepth: 20,
        minTTLSeconds: 3600
      }),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    const postage = await store.ensurePostageBatch();

    expect(postage.batchId).toBe(bestBatch);
    expect(postage.source).toBe("existing");
    expect(postage.depth).toBe(20);
  });

  it("does not inspect or consume local stamps unless auto postage is enabled", async () => {
    const bee = createFakeBee({
      existingPostageBatchId: "f".repeat(64)
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    await expect(store.put("manual-required", "no implicit auto")).rejects.toBeInstanceOf(SwarmKvPostageError);
    expect(bee.requests.some((request) => request.path === "/stamps")).toBe(false);
  });

  it("filters auto-selected postage batches by label and custom selector", async () => {
    const selectedBatch = "2".repeat(64);
    const bee = createFakeBee({
      existingStamps: [
        {
          batchID: "1".repeat(64),
          label: "unrelated",
          depth: 20,
          batchTTL: 20_000,
          utilization: 0
        },
        {
          batchID: selectedBatch,
          label: "truthmarket-dev-kv",
          depth: 20,
          batchTTL: 10_000,
          utilization: 5
        }
      ]
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: autoPostage({
        labelPrefix: "truthmarket-dev",
        selectBatch: (stamp) => stamp.label?.endsWith("-kv") === true
      }),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    const postage = await store.ensurePostageBatch();

    expect(postage.batchId).toBe(selectedBatch);
    expect(postage.label).toBe("truthmarket-dev-kv");
  });

  it("passes the requested label to Bee when auto-buying a postage batch", async () => {
    const purchasedBatch = "3".repeat(64);
    const bee = createFakeBee({
      existingPostageBatchId: null,
      purchasedPostageBatchId: purchasedBatch
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: autoPostage({
        amount: "1000000000",
        depth: 20,
        label: "truthmarket-dev-kv",
        waitForUsable: false
      }),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    const postage = await store.ensurePostageBatch();

    expect(postage).toMatchObject({
      batchId: purchasedBatch,
      source: "purchased",
      label: "truthmarket-dev-kv"
    });
    expect(bee.requests.some((request) => request.url.endsWith("/stamps/1000000000/20?label=truthmarket-dev-kv")))
      .toBe(true);
  });

  it("does not buy a replacement while a purchased batch is pending or unusable", async () => {
    const purchasedBatch = "9".repeat(64);
    const bee = createFakeBee({
      existingPostageBatchId: null,
      purchasedPostageBatchId: purchasedBatch
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: autoPostage({
        amount: "1000000000",
        depth: 20,
        waitForUsable: false
      }),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    await expect(store.ensurePostageBatch()).resolves.toMatchObject({
      batchId: purchasedBatch,
      source: "purchased"
    });
    bee.setStamp(purchasedBatch, { usable: false });

    await expect(store.ensurePostageBatch()).rejects.toBeInstanceOf(SwarmKvPostageError);
    expect(bee.requests.filter((request) => request.method === "POST" && request.path === "/stamps/1000000000/20"))
      .toHaveLength(1);
  });

  it("fails closed instead of buying when Bee cannot list postage batches", async () => {
    const bee = createFakeBee({
      existingPostageBatchId: null,
      purchasedPostageBatchId: "a".repeat(64),
      failStampList: true
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: autoPostage({
        amount: "1000000000",
        depth: 20
      }),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    await expect(store.ensurePostageBatch()).rejects.toBeInstanceOf(SwarmKvGatewayError);
    expect(bee.requests.some((request) => request.method === "POST" && request.path.startsWith("/stamps/")))
      .toBe(false);
  });

  it("uses a fixed postage batch through the typed postage helper", async () => {
    const batch = "f".repeat(64);
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: fixedPostage(batch),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    const postage = await store.ensurePostageBatch();

    expect(postage).toMatchObject({
      batchId: batch,
      source: "configured"
    });
  });

  it("uses a manual non-auto postage batch through the typed postage helper", async () => {
    const batch = "1".repeat(64);
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: manualPostage(batch),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    const put = await store.put("manual", "no auto stamp selection");

    expect(put.postageBatch).toMatchObject({
      batchId: batch,
      source: "configured"
    });
    expect(bee.requests.some((request) => request.path === "/stamps")).toBe(false);
    expect(bee.requests.some((request) => request.path.startsWith("/stamps/"))).toBe(false);
  });

  it("buys a new postage batch when no existing batch satisfies policy", async () => {
    const purchasedBatch = "d".repeat(64);
    const bee = createFakeBee({
      purchasedPostageBatchId: purchasedBatch,
      existingStamps: [
        {
          batchID: "a".repeat(64),
          usable: true,
          depth: 17,
          batchTTL: 60,
          utilization: 0
        }
      ]
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      autoBuyPostageBatch: {
        amount: "1000000000",
        depth: 20,
        minDepth: 20,
        minBatchTTL: 3600
      },
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    const postage = await store.ensurePostageBatch();

    expect(postage.batchId).toBe(purchasedBatch);
    expect(postage.source).toBe("purchased");
    expect(bee.requests.some((request) => request.method === "POST" && request.path === "/stamps/1000000000/20"))
      .toBe(true);
  });

  it("tops up a selected postage batch when TTL is below the configured threshold", async () => {
    const batch = "e".repeat(64);
    const bee = createFakeBee({
      existingStamps: [
        {
          batchID: batch,
          usable: true,
          depth: 20,
          batchTTL: 1200,
          utilization: 0
        }
      ]
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      autoBuyPostageBatch: {
        minDepth: 20,
        minBatchTTL: 600,
        topUpBelowTTL: 3600,
        topUpAmount: "1000000000",
        waitForUsable: false
      },
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    const postage = await store.ensurePostageBatch();

    expect(postage.batchId).toBe(batch);
    expect(postage.toppedUp).toBe(true);
    expect(bee.requests.some((request) => request.method === "PATCH" && request.path === `/stamps/topup/${batch}/1000000000`))
      .toBe(true);
  });

  it("tops up a low-TTL candidate before buying a replacement batch", async () => {
    const batch = "4".repeat(64);
    const bee = createFakeBee({
      purchasedPostageBatchId: "5".repeat(64),
      existingStamps: [
        {
          batchID: batch,
          usable: true,
          depth: 20,
          batchTTL: 1200,
          utilization: 0
        }
      ]
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: autoPostage({
        minDepth: 20,
        minTTLSeconds: 3600,
        topUpBelowTTLSeconds: 7200,
        topUpAmount: "1000000000",
        waitForUsable: false
      }),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    const postage = await store.ensurePostageBatch();

    expect(postage.batchId).toBe(batch);
    expect(postage.toppedUp).toBe(true);
    expect(postage.batchTTL).toBe(4800);
    expect(bee.requests.some((request) => request.method === "POST" && request.path.startsWith("/stamps/")))
      .toBe(false);
  });

  it("revalidates cached auto batches and switches away from unusable ones", async () => {
    const firstBatch = "6".repeat(64);
    const secondBatch = "7".repeat(64);
    const bee = createFakeBee({
      existingStamps: [
        {
          batchID: firstBatch,
          usable: true,
          depth: 20,
          batchTTL: 10_000,
          utilization: 0
        },
        {
          batchID: secondBatch,
          usable: true,
          depth: 20,
          batchTTL: 9_000,
          utilization: 1
        }
      ]
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: autoPostage({ minDepth: 20 }),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    await expect(store.ensurePostageBatch()).resolves.toMatchObject({ batchId: firstBatch });
    bee.setStamp(firstBatch, { usable: false });

    await expect(store.ensurePostageBatch()).resolves.toMatchObject({ batchId: secondBatch });
  });

  it("shares a pending auto top-up across concurrent calls and respects the retry window", async () => {
    const batch = "8".repeat(64);
    const bee = createFakeBee({
      existingStamps: [
        {
          batchID: batch,
          usable: true,
          depth: 20,
          batchTTL: 100,
          utilization: 0
        }
      ]
    });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: autoPostage({
        minDepth: 20,
        topUpBelowTTLSeconds: 7200,
        topUpAmount: "1000000000",
        waitForUsable: false,
        topUpRetryIntervalMs: 60_000
      }),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    const [first, second, third] = await Promise.all([
      store.ensurePostageBatch(),
      store.ensurePostageBatch(),
      store.ensurePostageBatch()
    ]);

    expect(first.batchId).toBe(batch);
    expect(second.batchId).toBe(batch);
    expect(third.batchId).toBe(batch);
    expect(first.toppedUp).toBe(true);
    expect(bee.requests.filter((request) => request.method === "PATCH" && request.path.startsWith("/stamps/topup/")))
      .toHaveLength(1);

    await expect(store.ensurePostageBatch()).resolves.toMatchObject({ batchId: batch, toppedUp: true });
    expect(bee.requests.filter((request) => request.method === "PATCH" && request.path.startsWith("/stamps/topup/")))
      .toHaveLength(1);
  });

  it("rejects invalid auto postage policy values", async () => {
    const bee = createFakeBee({ existingPostageBatchId: null });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postage: autoPostage({
        amount: "0"
      }),
      privateByDefault: false,
      fetch: bee.fetch,
      now: () => new Date("2026-05-09T12:00:00.000Z")
    });

    await expect(store.ensurePostageBatch()).rejects.toBeInstanceOf(SwarmKvConfigError);
  });

  it("uses the raw Bee /bytes upload and /chunks read response shape", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);

    const put = await store.put("wire", "same contract");
    const fetched = await store.getString("wire");

    expect(fetched).toBe("same contract");
    expect(bee.requests.some((request) => request.method === "POST" && request.path === "/bytes")).toBe(true);
    expect(bee.requests.some((request) => request.method === "GET" && request.path === `/chunks/${put.reference}`))
      .toBe(true);
    expect(bee.getChunk(put.reference)?.byteLength).toBeGreaterThan(8);
  });
});

describe("Swarm KV modification-vector failures", () => {
  it("rejects a tampered immutable value root chunk after the index points at it", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);
    const put = await store.put("message", "untampered");

    bee.mutateChunk(put.reference, mutateLastByte);

    await expect(store.getString("message")).rejects.toBeInstanceOf(SwarmVerificationError);
  });

  it("rejects a tampered child chunk in a multi-chunk value", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);
    const put = await store.put("large", patternedBytes(4096 * 2 + 99));
    const upload = bee.uploads.find((candidate) => candidate.reference === put.reference);
    const childReference = upload?.leafReferences[1];

    if (!childReference) {
      throw new Error("Expected the large value to create a second leaf chunk.");
    }

    bee.mutateChunk(childReference, mutateLastByte);

    await expect(store.getBytes("large")).rejects.toBeInstanceOf(SwarmVerificationError);
  });

  it("rejects a tampered immutable index when reopening a store", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);

    await store.put("settings", { safe: true });

    if (!store.indexReference) {
      throw new Error("Expected store to have an index reference.");
    }

    bee.mutateChunk(store.indexReference, mutateLastByte);
    const reopened = createPublicStore(bee.fetch, store.indexReference);

    await expect(reopened.list()).rejects.toBeInstanceOf(SwarmVerificationError);
  });

  it("bubbles missing value chunks as gateway failures", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch);
    const put = await store.put("message", "missing soon");

    bee.removeChunk(put.reference);

    await expect(store.getString("message")).rejects.toBeInstanceOf(SwarmGatewayError);
  });

  it("enforces the configured verified chunk limit", async () => {
    const bee = createFakeBee();
    const store = createPublicStore(bee.fetch, null, { maxVerifiedChunks: 1 });

    await store.put("large", patternedBytes(4096 * 2 + 99));

    await expect(store.getBytes("large")).rejects.toBeInstanceOf(SwarmVerificationError);
  });
});

function createPublicStore(
  fetch: FetchLike,
  rootReference: string | null = null,
  extraOptions: Partial<SwarmKvClientOptions> = {}
): SwarmKvStore {
  return createSwarmKvStore({
    gatewayUrl: "https://gateway.test",
    beeApiUrl: "https://bee.test",
    postageBatchId: "a".repeat(64),
    owner: `0x${"1".repeat(40)}`,
    privateByDefault: false,
    fetch,
    now: () => new Date("2026-05-09T12:00:00.000Z"),
    ...(rootReference ? { rootReference } : {}),
    ...extraOptions
  });
}

function createFakeFeedWriter(bee: ReturnType<typeof createFakeBee>): SwarmKvFeedWriter {
  return {
    async updateReference(input) {
      bee.writeFeedReference(input.owner.slice(2), input.topic, input.reference);
      return {
        reference: input.reference
      };
    }
  };
}

function createCompareAndSwapFakeFeedWriter(bee: ReturnType<typeof createFakeBee>): SwarmKvFeedWriter {
  return {
    async updateReference(input) {
      const feedKey = `${input.owner.slice(2).toLowerCase()}:${input.topic.toLowerCase()}`;
      const currentReference = bee.feedUpdates.get(feedKey) ?? null;
      const expectedReference = input.previousIndexReference ?? null;

      if (currentReference !== expectedReference) {
        throw new SwarmKvConflictError(
          `Index feed moved before publish. Expected ${expectedReference ?? "empty"}, current ${
            currentReference ?? "empty"
          }.`
        );
      }

      bee.writeFeedReference(input.owner.slice(2), input.topic, input.reference);
      return {
        reference: input.reference
      };
    }
  };
}

function createFakeFeedReader(bee: ReturnType<typeof createFakeBee>): SwarmKvFeedReader {
  return {
    async readLatestReference(input) {
      const reference = bee.feedUpdates.get(`${input.owner.slice(2).toLowerCase()}:${input.topic.toLowerCase()}`);

      return {
        reference: reference ?? null,
        verified: true
      };
    }
  };
}

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

function createGate(): { entered: Deferred; release: Deferred } {
  return {
    entered: createDeferred(),
    release: createDeferred()
  };
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function sleepForTest(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
