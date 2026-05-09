import { gzipSync } from "node:zlib";

import { describe, expect, expectTypeOf, it } from "vitest";

import { makeContentAddressedChunk } from "@truth-market/swarm-verified-fetch";

import {
  DEFAULT_GATEWAY_URL,
  SwarmKvConflictError,
  SwarmKvCryptoError,
  SwarmKvGatewayError,
  createSwarmKvStore,
  type FetchLike,
  type GetResult,
  type JsonValue,
  type SwarmKvGetResult
} from "../src/index.js";

describe("createSwarmKvStore", () => {
  it("uses the public Swarm gateway as the default read path", () => {
    const store = createSwarmKvStore();

    expect(store.options.gatewayUrl).toBe(DEFAULT_GATEWAY_URL);
  });

  it("normalizes configured base URLs", () => {
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.ethswarm.org/",
      beeApiUrl: "http://localhost:1633/",
      privateByDefault: false
    });

    expect(store.options.gatewayUrl).toBe("https://gateway.ethswarm.org");
    expect(store.options.beeApiUrl).toBe("http://localhost:1633");
  });

  it("puts, verifies, gets, lists, iterates, and deletes public string values", async () => {
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postageBatchId: "a".repeat(64),
      privateByDefault: false,
      fetch: bee.fetch,
      now: fixedNow
    });

    const put = await store.put("profile:name", "Ada Lovelace");

    expect(put.verification.verified).toBe(true);
    expect(put.indexVerification.verified).toBe(true);
    expect(put.indexReference).toBe(store.indexReference);

    const fetched = await store.getString("profile:name");

    expect(fetched).toBe("Ada Lovelace");
    expect(await store.list()).toEqual(["profile:name"]);
    expect(await store.has("profile:name")).toBe(true);

    const iterated: string[] = [];

    for await (const entry of store.entries<string>()) {
      iterated.push(entry.value);
    }

    expect(iterated).toEqual(["Ada Lovelace"]);

    const deleted = await store.delete("profile:name");

    expect(deleted.deleted).toBe(true);
    expect(await store.get("profile:name")).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it("round-trips JSON and binary values", async () => {
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postageBatchId: "b".repeat(64),
      privateByDefault: false,
      fetch: bee.fetch,
      now: fixedNow
    });

    await store.put("settings", { theme: "dark", compact: true });
    await store.put("avatar", new Uint8Array([1, 2, 3, 4]));

    await expect(store.getJson<{ theme: string; compact: boolean }>("settings")).resolves.toEqual({
      theme: "dark",
      compact: true
    });
    await expect(store.getBytes("avatar")).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("returns a metadata-discriminated union from the general get method", async () => {
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postageBatchId: "b".repeat(64),
      privateByDefault: false,
      fetch: bee.fetch,
      now: fixedNow
    });

    await store.put("title", "Ada");
    await store.put("settings", { theme: "dark", compact: true });
    await store.put("avatar", new Uint8Array([1, 2, 3, 4]));

    const title = await store.get("title");

    expectTypeOf(title).toEqualTypeOf<SwarmKvGetResult | null>();
    expect(title?.kind).toBe("string");

    if (!title || title.kind !== "string") {
      throw new Error("Expected string metadata.");
    }

    expectTypeOf(title.value).toEqualTypeOf<string>();
    expect(title.value).toBe("Ada");

    const settings = await store.get("settings");

    expect(settings?.kind).toBe("json");

    if (!settings || settings.kind !== "json") {
      throw new Error("Expected JSON metadata.");
    }

    expectTypeOf(settings.value).toMatchTypeOf<JsonValue>();
    expect(settings.value).toEqual({ theme: "dark", compact: true });

    const avatar = await store.get("avatar");

    expect(avatar?.kind).toBe("bytes");

    if (!avatar || avatar.kind !== "bytes") {
      throw new Error("Expected bytes metadata.");
    }

    expectTypeOf(avatar.value).toEqualTypeOf<Uint8Array>();
    expect(avatar.value).toEqual(new Uint8Array([1, 2, 3, 4]));

    const typedSettings = await store.get<{ theme: string; compact: boolean }>("settings");

    expectTypeOf(typedSettings).toEqualTypeOf<GetResult<{ theme: string; compact: boolean }> | null>();
  });

  it("can opt into signer-derived encryption for deterministic signers", async () => {
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postageBatchId: "c".repeat(64),
      signer: testSigner,
      allowSignerDerivedEncryption: true,
      fetch: bee.fetch,
      now: fixedNow
    });

    const put = await store.put("secret", "private note");

    expect(put.encrypted).toBe(true);
    expect(decodeAllUploads(bee.uploads).join("\n")).not.toContain("private note");
    await expect(store.getString("secret")).resolves.toBe("private note");

    const reopened = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      rootReference: put.indexReference,
      postageBatchId: "c".repeat(64),
      signer: testSigner,
      allowSignerDerivedEncryption: true,
      fetch: bee.fetch,
      now: fixedNow
    });

    await expect(reopened.getString("secret")).resolves.toBe("private note");
  });

  it("rejects signer-derived private encryption unless it is explicitly enabled", async () => {
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postageBatchId: "c".repeat(64),
      signer: testSigner,
      fetch: bee.fetch,
      now: fixedNow
    });

    await expect(store.put("secret", "private note")).rejects.toBeInstanceOf(SwarmKvCryptoError);
  });

  it("supports explicit stable encryption key material for signers with non-deterministic signatures", async () => {
    const bee = createFakeBee();
    const signer = createNonDeterministicSigner();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postageBatchId: "c".repeat(64),
      owner: signer.address,
      signer,
      encryptionKey: "test-stable-kv-key",
      fetch: bee.fetch,
      now: fixedNow
    });

    const put = await store.put("secret", "private note");
    const reopened = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      rootReference: put.indexReference,
      postageBatchId: "c".repeat(64),
      owner: signer.address,
      signer,
      encryptionKey: "test-stable-kv-key",
      fetch: bee.fetch,
      now: fixedNow
    });

    await expect(reopened.getString("secret")).resolves.toBe("private note");
    expect(signer.signCount).toBe(0);
  });

  it("wraps signer-derived decrypt failures with a Swarm KV crypto error", async () => {
    const bee = createFakeBee();
    const firstSigner = createNonDeterministicSigner();
    const secondSigner = createNonDeterministicSigner(100);
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postageBatchId: "c".repeat(64),
      signer: firstSigner,
      allowSignerDerivedEncryption: true,
      fetch: bee.fetch,
      now: fixedNow
    });

    const put = await store.put("secret", "private note");
    const reopened = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      rootReference: put.indexReference,
      postageBatchId: "c".repeat(64),
      signer: secondSigner,
      allowSignerDerivedEncryption: true,
      fetch: bee.fetch,
      now: fixedNow
    });

    await expect(reopened.getString("secret")).rejects.toBeInstanceOf(SwarmKvCryptoError);
  });

  it("requires explicit public mode or stable private encryption configuration", async () => {
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postageBatchId: "d".repeat(64),
      fetch: bee.fetch,
      now: fixedNow
    });

    await expect(store.put("secret", "missing signer")).rejects.toBeInstanceOf(SwarmKvCryptoError);
  });

  it("discovers or buys postage before upload when no batch id is configured", async () => {
    const bee = createFakeBee({ existingPostageBatchId: null, purchasedPostageBatchId: "e".repeat(64) });
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      autoBuyPostageBatch: { amount: "1000", depth: 17, waitForUsable: false },
      privateByDefault: false,
      fetch: bee.fetch,
      now: fixedNow
    });

    const put = await store.put("costs", "covered");

    expect(put.postageBatch).toMatchObject({ batchId: "e".repeat(64), source: "purchased" });
    expect(bee.requestedPaths).toContain("/stamps/1000/17");
  });

  it("guards optimistic writes with the current index reference", async () => {
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      postageBatchId: "f".repeat(64),
      privateByDefault: false,
      fetch: bee.fetch,
      now: fixedNow
    });

    await store.put("first", "value");

    await expect(store.put("second", "value", { ifIndexReference: null })).rejects.toBeInstanceOf(
      SwarmKvConflictError
    );
  });

  it("creates a feed manifest for callers that want a stable Swarm pointer", async () => {
    const bee = createFakeBee();
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      owner: `0x${"1".repeat(40)}`,
      postageBatchId: "a".repeat(64),
      privateByDefault: false,
      fetch: bee.fetch,
      now: fixedNow
    });

    const manifest = await store.createFeedManifest();

    expect(manifest.owner).toBe(`0x${"1".repeat(40)}`);
    expect(manifest.topic).toHaveLength(64);
    expect(manifest.manifestReference).toHaveLength(64);
  });

  it("decodes gzipped Bee JSON responses without a content-encoding header by default", async () => {
    const reference = "b".repeat(64);
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      owner: `0x${"1".repeat(40)}`,
      postageBatchId: "a".repeat(64),
      privateByDefault: false,
      fetch: async (input, init) => {
        const url = new URL(input);

        if (url.pathname.startsWith("/feeds/") && init?.method === "POST") {
          return gzipJsonResponse({ reference });
        }

        return textResponse(`unhandled ${init?.method ?? "GET"} ${url.pathname}`, 500, "Unhandled");
      },
      now: fixedNow
    });

    await expect(store.createFeedManifest()).resolves.toMatchObject({
      manifestReference: reference
    });
  });

  it("can disable gzipped Bee JSON response decoding", async () => {
    const store = createSwarmKvStore({
      gatewayUrl: "https://gateway.test",
      beeApiUrl: "https://bee.test",
      owner: `0x${"1".repeat(40)}`,
      postageBatchId: "a".repeat(64),
      privateByDefault: false,
      decodeGzippedBeeJson: false,
      fetch: async (input, init) => {
        const url = new URL(input);

        if (url.pathname.startsWith("/feeds/") && init?.method === "POST") {
          return gzipJsonResponse({ reference: "b".repeat(64) });
        }

        return textResponse(`unhandled ${init?.method ?? "GET"} ${url.pathname}`, 500, "Unhandled");
      },
      now: fixedNow
    });

    await expect(store.createFeedManifest()).rejects.toBeInstanceOf(SwarmKvGatewayError);
  });
});

function fixedNow(): Date {
  return new Date("2026-05-09T12:00:00.000Z");
}

const testSigner = {
  address: `0x${"1".repeat(40)}`,
  async signMessage(message: string): Promise<string> {
    return `0x${Buffer.from(`signed:${message}`).toString("hex").padEnd(130, "0").slice(0, 130)}`;
  }
};

function createNonDeterministicSigner(
  initialSignCount = 0
): { address: `0x${string}`; signCount: number; signMessage(message: string): Promise<string> } {
  return {
    address: `0x${"1".repeat(40)}`,
    signCount: initialSignCount,
    async signMessage(message: string): Promise<string> {
      this.signCount += 1;
      return `0x${Buffer.from(`signed:${this.signCount}:${message}`).toString("hex").padEnd(130, "0").slice(0, 130)}`;
    }
  };
}

interface FakeBeeOptions {
  existingPostageBatchId?: string | null;
  purchasedPostageBatchId?: string;
}

function createFakeBee(options: FakeBeeOptions = {}): {
  fetch: FetchLike;
  uploads: Uint8Array[];
  requestedPaths: string[];
} {
  const chunks = new Map<string, Uint8Array>();
  const uploads: Uint8Array[] = [];
  const requestedPaths: string[] = [];
  const existingPostageBatchId =
    options.existingPostageBatchId === undefined ? "0".repeat(64) : options.existingPostageBatchId;
  const purchasedPostageBatchId = options.purchasedPostageBatchId ?? "9".repeat(64);

  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    requestedPaths.push(url.pathname);

    if (url.pathname === "/stamps") {
      return jsonResponse({
        stamps: existingPostageBatchId ? [{ batchID: existingPostageBatchId, usable: true }] : []
      });
    }

    if (url.pathname.startsWith("/stamps/") && init?.method === "POST") {
      return jsonResponse({ batchID: purchasedPostageBatchId }, 201, "Created");
    }

    if (url.pathname === "/bytes" && init?.method === "POST") {
      const bytes = bodyToBytes(init.body);
      const chunk = makeContentAddressedChunk(bytes);
      chunks.set(chunk.reference, chunk.bytes);
      uploads.push(bytes);
      return jsonResponse({ reference: chunk.reference }, 201, "Created");
    }

    if (url.pathname.startsWith("/chunks/")) {
      const reference = url.pathname.split("/").at(-1) ?? "";
      const chunk = chunks.get(reference);

      if (!chunk) {
        return textResponse("missing chunk", 404, "Not Found");
      }

      return bytesResponse(chunk);
    }

    if (url.pathname.startsWith("/feeds/") && init?.method === "POST") {
      const chunk = makeContentAddressedChunk(new TextEncoder().encode("feed manifest"));
      chunks.set(chunk.reference, chunk.bytes);
      return jsonResponse({ reference: chunk.reference }, 201, "Created");
    }

    return textResponse(`unhandled ${init?.method ?? "GET"} ${url.pathname}`, 500, "Unhandled");
  };

  return {
    fetch,
    uploads,
    requestedPaths
  };
}

function bodyToBytes(body: string | Uint8Array | ArrayBuffer | undefined): Uint8Array {
  if (!body) {
    return new Uint8Array();
  }

  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }

  if (body instanceof Uint8Array) {
    return new Uint8Array(body);
  }

  return new Uint8Array(body.slice(0));
}

function decodeAllUploads(uploads: Uint8Array[]): string[] {
  return uploads.map((bytes) => {
    try {
      return new TextDecoder().decode(bytes);
    } catch {
      return "";
    }
  });
}

function jsonResponse(value: unknown, status = 200, statusText = "OK") {
  const text = JSON.stringify(value);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async arrayBuffer() {
      return copyArrayBuffer(new TextEncoder().encode(text));
    },
    async text() {
      return text;
    },
    async json() {
      return value;
    }
  };
}

function gzipJsonResponse(value: unknown) {
  return bytesResponse(new Uint8Array(gzipSync(new TextEncoder().encode(JSON.stringify(value)))));
}

function textResponse(value: string, status = 200, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async arrayBuffer() {
      return copyArrayBuffer(new TextEncoder().encode(value));
    },
    async text() {
      return value;
    },
    async json() {
      return JSON.parse(value) as unknown;
    }
  };
}

function bytesResponse(bytes: Uint8Array) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async arrayBuffer() {
      return copyArrayBuffer(bytes);
    },
    async text() {
      return new TextDecoder().decode(bytes);
    },
    async json() {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    }
  };
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}
