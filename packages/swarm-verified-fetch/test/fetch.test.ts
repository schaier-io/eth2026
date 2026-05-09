import { describe, expect, it } from "vitest";

import {
  createSwarmVerifiedFetch,
  DEFAULT_SWARM_GATEWAY_URL,
  DEFAULT_SWARM_TESTNET_GATEWAY_URL,
  SWARM_PUBLIC_GATEWAYS,
  bytesToHex,
  hexToBytes,
  keccak256,
  makeContentAddressedChunk,
  SwarmAbortError,
  SwarmGatewayError,
  SwarmInputError,
  SwarmTimeoutError,
  SwarmVerificationError,
  resolveMantarayPath,
  verifiedFetch,
  verifyBytesHash,
  verifySwarmBytes,
  verifySwarmChunk,
  type FetchLike,
  type MantarayNode,
  type VerifiedFetchProgressEvent
} from "../src/index.js";
import {
  buildMantarayManifest,
  buildSwarmTree,
  bytesResponse,
  copyArrayBuffer,
  createMockChunkGateway,
  mutateLastByte,
  patternedBytes,
  readByteStream,
  textResponse
} from "./helpers.js";

describe("manual verification APIs", () => {
  it("verifies a raw chunk before exposing payload helpers", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode('{"ok":true}'));
    const response = verifySwarmChunk(chunk.reference, chunk.bytes);

    expect(response.verification.verified).toBe(true);
    expect(await response.text()).toBe('{"ok":true}');
    expect(await response.json<{ ok: boolean }>()).toEqual({ ok: true });
  });

  it("throws before returning tampered chunk bytes", () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("untampered"));
    const tampered = makeContentAddressedChunk(new TextEncoder().encode("tampered"));

    expect(() => verifySwarmChunk(chunk.reference, tampered.bytes)).toThrow(SwarmVerificationError);
  });

  it("reconstructs bytes from caller-provided chunks without fetching", async () => {
    const payload = patternedBytes(4096 * 2 + 13);
    const tree = buildSwarmTree(payload);

    const response = await verifySwarmBytes(tree.reference, {
      chunks: tree.chunks
    });

    expect(response.bytes).toEqual(payload);
    expect(response.metadata.kind).toBe("bytes");
    expect(response.chunksVerified).toBeGreaterThan(1);
  });

  it("verifies exact byte hashes for claim/rules hash checks", () => {
    const payload = new TextEncoder().encode('{"schema":"truthmarket.claimRules.v1"}');
    const hash = `0x${bytesToHex(keccak256(payload))}`;

    expect(verifyBytesHash(payload, hash).computedHash).toBe(hash);
  });
});

describe("verifiedFetch", () => {
  it("reconstructs a verified single-chunk payload", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("single chunk"));
    const fetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      async arrayBuffer() {
        return copyArrayBuffer(chunk.bytes);
      }
    });

    const response = await verifiedFetch(chunk.reference, {
      gatewayUrl: "https://example.test",
      fetch
    });

    expect(await response.text()).toBe("single chunk");
    expect(response.kind).toBe("bytes");
    expect(response.metadata.byteLength).toBe("single chunk".length);
    expect(response.chunksVerified).toBe(1);
    expect(response.verification.mode).toBe("cac-tree");
  });

  it("reconstructs a verified multi-chunk immutable byte tree from raw /chunks responses", async () => {
    const payload = patternedBytes(4096 * 3 + 257);
    const tree = buildSwarmTree(payload);
    const gateway = createMockChunkGateway(tree.chunks);

    const response = await verifiedFetch(`https://gateway.test/bytes/${tree.reference}`, {
      gatewayUrl: "https://gateway.test",
      fetch: gateway.fetch
    });

    expect(response.bytes).toEqual(payload);
    expect(response.span).toBe(BigInt(payload.byteLength));
    expect(response.chunksVerified).toBeGreaterThan(1);
    expect(gateway.requests[0]).toEqual({
      method: "GET",
      path: `/chunks/${tree.reference}`,
      url: `https://gateway.test/chunks/${tree.reference}`
    });
  });

  it("rejects a tampered root chunk before reading any child references", async () => {
    const tree = buildSwarmTree(patternedBytes(4096 * 2 + 1));
    const gateway = createMockChunkGateway(tree.chunks);
    gateway.mutateChunk(tree.reference, mutateLastByte);

    await expect(
      verifiedFetch(tree.reference, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toBeInstanceOf(SwarmVerificationError);
  });

  it("rejects a tampered child chunk even when the root chunk is unchanged", async () => {
    const tree = buildSwarmTree(patternedBytes(4096 * 2 + 1));
    const gateway = createMockChunkGateway(tree.chunks);
    const childReference = tree.leafReferences[1];

    if (!childReference) {
      throw new Error("Expected the test tree to contain a second leaf.");
    }

    gateway.mutateChunk(childReference, mutateLastByte);

    await expect(
      verifiedFetch(tree.reference, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toBeInstanceOf(SwarmVerificationError);
  });

  it("bubbles missing child chunks as gateway failures", async () => {
    const tree = buildSwarmTree(patternedBytes(4096 * 2 + 1));
    const gateway = createMockChunkGateway(tree.chunks);
    const childReference = tree.leafReferences[0];

    if (!childReference) {
      throw new Error("Expected the test tree to contain a leaf.");
    }

    gateway.removeChunk(childReference);

    await expect(
      verifiedFetch(tree.reference, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toBeInstanceOf(SwarmGatewayError);
  });

  it("enforces the verified chunk limit", async () => {
    const tree = buildSwarmTree(patternedBytes(4096 * 2 + 1));
    const gateway = createMockChunkGateway(tree.chunks);

    await expect(
      verifiedFetch(tree.reference, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch,
        maxChunks: 1
      })
    ).rejects.toBeInstanceOf(SwarmVerificationError);
  });

  it("rejects intermediate chunks whose payload is not aligned to child references", async () => {
    const malformedRoot = makeContentAddressedChunk(new Uint8Array(31), 4097n);
    const gateway = createMockChunkGateway(new Map([[malformedRoot.reference, malformedRoot.bytes]]));

    await expect(
      verifiedFetch(malformedRoot.reference, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toThrow(/not aligned/);
  });

  it("rejects intermediate chunks with too few child references for their span", async () => {
    const malformedRoot = makeContentAddressedChunk(
      new Uint8Array(32),
      BigInt(4096 * 2)
    );
    const gateway = createMockChunkGateway(new Map([[malformedRoot.reference, malformedRoot.bytes]]));

    await expect(
      verifiedFetch(malformedRoot.reference, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toThrow(/expected exactly 2 children but contained 1/);
  });

  it("rejects intermediate chunks with extra child references for their span", async () => {
    const malformedRoot = makeContentAddressedChunk(
      new Uint8Array(32 * 3),
      BigInt(4096 * 2)
    );
    const gateway = createMockChunkGateway(new Map([[malformedRoot.reference, malformedRoot.bytes]]));

    await expect(
      verifiedFetch(malformedRoot.reference, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toThrow(/expected exactly 2 children but contained 3/);
  });

  it("rejects extra child references in streaming mode", async () => {
    const malformedRoot = makeContentAddressedChunk(
      new Uint8Array(32 * 3),
      BigInt(4096 * 2)
    );
    const gateway = createMockChunkGateway(new Map([[malformedRoot.reference, malformedRoot.bytes]]));

    const response = await verifiedFetch(malformedRoot.reference, {
      gatewayUrl: "https://gateway.test",
      fetch: gateway.fetch,
      responseType: "stream"
    });

    await expect(readByteStream(response.body)).rejects.toThrow(/expected exactly 2 children but contained 3/);
    await expect(response.completion).rejects.toThrow(/expected exactly 2 children but contained 3/);
  });

  it("accepts bzz references for fetch-shaped immutable byte reads", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("fetch shaped"));
    const fetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      async arrayBuffer() {
        return copyArrayBuffer(chunk.bytes);
      }
    });

    const response = await verifiedFetch(`bzz://${chunk.reference}`, {
      gatewayUrl: "https://example.test",
      fetch
    });

    expect(await response.text()).toBe("fetch shaped");
  });

  it("returns typed metadata and honors declared file type hints", async () => {
    const payload = new TextEncoder().encode('{"ok":true}');
    const tree = buildSwarmTree(payload);
    const gateway = createMockChunkGateway(tree.chunks);
    const expectedHash = `0x${bytesToHex(keccak256(payload))}`;

    const response = await verifiedFetch(tree.reference, {
      contentType: "application/json; charset=utf-8",
      expectedHash,
      fileName: "claim-rules.json",
      gatewayUrl: "https://gateway.test",
      fetch: gateway.fetch
    });

    expect(response.contentHash).toBe(expectedHash);
    expect(response.metadata.fileName).toBe("claim-rules.json");
    expect(response.metadata.mediaType).toMatchObject({
      kind: "json",
      mimeType: "application/json",
      source: "content-type"
    });
    expect(await response.json<{ ok: boolean }>()).toEqual({ ok: true });
  });

  it("reports progress for fetched chunks, verified chunks, enqueued bytes, and completion", async () => {
    const payload = patternedBytes(4096 * 2 + 7);
    const tree = buildSwarmTree(payload);
    const gateway = createMockChunkGateway(tree.chunks);
    const events: VerifiedFetchProgressEvent[] = [];

    const response = await verifiedFetch(tree.reference, {
      gatewayUrl: "https://gateway.test",
      fetch: gateway.fetch,
      onProgress(event) {
        events.push(event);
      }
    });

    expect(response.bytes).toEqual(payload);
    expect(events.some((event) => event.type === "chunkFetched")).toBe(true);
    expect(events.some((event) => event.type === "chunkVerified")).toBe(true);
    expect(events.some((event) => event.type === "bytesEnqueued")).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      bytesVerified: payload.byteLength,
      totalBytes: payload.byteLength,
      chunksVerified: response.chunksVerified,
      contentHash: response.contentHash
    });
  });

  it("retries transient gateway failures without accepting unverified bytes", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("retry works"));
    let attempts = 0;
    const fetch: FetchLike = async () => {
      attempts += 1;

      if (attempts === 1) {
        return textResponse("try again", 503, "Service Unavailable");
      }

      return bytesResponse(chunk.bytes);
    };

    const response = await verifiedFetch(chunk.reference, {
      gatewayUrl: "https://gateway.test",
      fetch,
      retry: { attempts: 2, baseDelayMs: 0 }
    });

    expect(attempts).toBe(2);
    expect(await response.text()).toBe("retry works");
  });

  it("fails over to another gateway and still verifies the returned chunk", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("failover works"));
    const origins: string[] = [];
    const fetch: FetchLike = async (input) => {
      const url = new URL(input);
      origins.push(url.origin);

      if (url.origin === "https://bad.test") {
        return textResponse("down", 502, "Bad Gateway");
      }

      return bytesResponse(chunk.bytes);
    };

    const response = await verifiedFetch(chunk.reference, {
      gatewayUrl: "https://bad.test",
      gateways: ["https://bad.test", "https://good.test"],
      fetch
    });

    expect(origins).toEqual(["https://bad.test", "https://good.test"]);
    expect(await response.text()).toBe("failover works");
  });

  it("uses the mainnet public gateway set when no gateway is configured", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("default public fallback"));
    const origins: string[] = [];
    const fetch: FetchLike = async (input) => {
      const url = new URL(input);
      origins.push(url.origin);

      if (url.origin === DEFAULT_SWARM_GATEWAY_URL) {
        return textResponse("primary public gateway unavailable", 503, "Service Unavailable");
      }

      return bytesResponse(chunk.bytes);
    };

    const response = await verifiedFetch(chunk.reference, { fetch });

    expect(origins).toEqual(SWARM_PUBLIC_GATEWAYS.mainnet.gatewayUrls);
    expect(await response.text()).toBe("default public fallback");
  });

  it("uses the testnet public gateway set when network is testnet and no gateway is configured", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("testnet public fallback"));
    const origins: string[] = [];
    const fetch: FetchLike = async (input) => {
      const url = new URL(input);
      origins.push(url.origin);

      if (url.origin === DEFAULT_SWARM_TESTNET_GATEWAY_URL) {
        return textResponse("primary testnet gateway unavailable", 503, "Service Unavailable");
      }

      return bytesResponse(chunk.bytes);
    };

    const response = await verifiedFetch(`bzz://${chunk.reference}`, {
      fetch,
      network: "testnet"
    });

    expect(origins).toEqual(SWARM_PUBLIC_GATEWAYS.testnet.gatewayUrls);
    expect(await response.text()).toBe("testnet public fallback");
  });

  it("does not add public fallback gateways when a gateway is explicitly configured", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("custom gateway only"));
    const origins: string[] = [];
    const fetch: FetchLike = async (input) => {
      const url = new URL(input);
      origins.push(url.origin);
      return bytesResponse(chunk.bytes);
    };

    const response = await verifiedFetch(chunk.reference, {
      gatewayUrl: "https://custom.test",
      fetch
    });

    expect(origins).toEqual(["https://custom.test"]);
    expect(await response.text()).toBe("custom gateway only");
  });

  it("creates testnet clients with the public testnet fallback gateways", async () => {
    const client = createSwarmVerifiedFetch({ network: "testnet" });

    expect(client.network).toBe("testnet");
    expect(client.gatewayUrl).toBe(DEFAULT_SWARM_TESTNET_GATEWAY_URL);
    expect(client.gatewayUrls).toEqual(SWARM_PUBLIC_GATEWAYS.testnet.gatewayUrls);
  });

  it("creates explicit-gateway clients without adding public fallback gateways", async () => {
    const client = createSwarmVerifiedFetch({ gatewayUrl: "https://custom.test" });

    expect(client.network).toBe("mainnet");
    expect(client.gatewayUrl).toBe("https://custom.test");
    expect(client.gatewayUrls).toEqual(["https://custom.test"]);
  });

  it("races gateways and rejects lying gateway bytes before using the valid chunk", async () => {
    const valid = makeContentAddressedChunk(new TextEncoder().encode("race works"));
    const liar = makeContentAddressedChunk(new TextEncoder().encode("wrong bytes"));
    const origins: string[] = [];
    const fetch: FetchLike = async (input) => {
      const url = new URL(input);
      origins.push(url.origin);

      return bytesResponse(url.origin === "https://bad.test" ? liar.bytes : valid.bytes);
    };

    const response = await verifiedFetch(valid.reference, {
      gatewayUrl: "https://bad.test",
      gateways: ["https://bad.test", "https://good.test"],
      gatewayStrategy: "race",
      fetch
    });

    expect(new Set(origins)).toEqual(new Set(["https://bad.test", "https://good.test"]));
    expect(await response.text()).toBe("race works");
  });

  it("resolves bzz manifest paths only after verifying manifest chunks", async () => {
    const payload = new TextEncoder().encode('{"schema":"truthmarket.claimRules.v1","title":"Verified"}');
    const file = buildSwarmTree(payload);
    const manifest = buildMantarayManifest("claim-rules.json", file.reference, {
      "Content-Length": String(payload.byteLength),
      "Content-Type": "application/json",
      Filename: "claim-rules.json",
      "Last-Modified": "2026-05-09T12:00:00.000Z"
    });
    const gateway = createMockChunkGateway(new Map([...file.chunks, ...manifest.chunks]));

    const response = await verifiedFetch(`bzz://${manifest.reference}/claim-rules.json`, {
      gatewayUrl: "https://gateway.test",
      fetch: gateway.fetch
    });

    expect(await response.json<{ title: string }>()).toMatchObject({ title: "Verified" });
    expect(response.reference).toBe(file.reference);
    expect(response.metadata.byteLength).toBe(payload.byteLength);
    expect(response.metadata.fileName).toBe("claim-rules.json");
    expect(response.metadata.lastModified).toBe("2026-05-09T12:00:00.000Z");
    expect(response.metadata.mediaType.kind).toBe("json");
    expect(response.metadata.mimeType).toBe("application/json");
    expect(response.metadata.path).toBe("claim-rules.json");
    expect(response.metadata.manifest).toMatchObject({
      path: "claim-rules.json",
      reference: manifest.reference,
      targetReference: file.reference
    });
    expect(gateway.requests.every((request) => request.path.startsWith("/chunks/"))).toBe(true);
  });

  it("rejects verified manifest file-size metadata that disagrees with verified bytes", async () => {
    const payload = new TextEncoder().encode("hello");
    const file = buildSwarmTree(payload);
    const manifest = buildMantarayManifest("hello.txt", file.reference, {
      "Content-Length": String(payload.byteLength + 1),
      "Content-Type": "text/plain",
      Filename: "hello.txt"
    });
    const gateway = createMockChunkGateway(new Map([...file.chunks, ...manifest.chunks]));

    await expect(
      verifiedFetch(`bzz://${manifest.reference}/hello.txt`, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toThrow(/byte length mismatch/);
  });

  it("rejects missing verified manifest paths", async () => {
    const payload = new TextEncoder().encode("hello");
    const file = buildSwarmTree(payload);
    const manifest = buildMantarayManifest("hello.txt", file.reference, {
      "Content-Type": "text/plain",
      Filename: "hello.txt"
    });
    const gateway = createMockChunkGateway(new Map([...file.chunks, ...manifest.chunks]));

    await expect(
      verifiedFetch(`bzz://${manifest.reference}/missing.txt`, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toBeInstanceOf(SwarmInputError);
  });

  it("rejects zero-length manifest forks that would not consume path bytes", async () => {
    const manifestBytes = marshalMantarayNodeForTest(
      "0000000000000000000000000000000000000000000000000000000000000000",
      [
        {
          metadata: null,
          prefix: new Uint8Array(0),
          reference: "0000000000000000000000000000000000000000000000000000000000000000",
          type: 4
        }
      ]
    );
    const manifest = buildSwarmTree(manifestBytes);
    const gateway = createMockChunkGateway(manifest.chunks);

    await expect(
      verifiedFetch(`bzz://${manifest.reference}/anything.txt`, {
        gatewayUrl: "https://gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toThrow(/prefix length must be greater than zero/);
  });

  it("rejects manifest cycles during verified path resolution", async () => {
    const root: MantarayNode = {
      forks: new Map([
        [
          "a".charCodeAt(0),
          {
            metadata: null,
            prefix: new TextEncoder().encode("a"),
            selfAddress: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          }
        ]
      ]),
      metadata: null,
      path: new Uint8Array(0),
      selfAddress: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      targetAddress: "0000000000000000000000000000000000000000000000000000000000000000"
    };
    const child: MantarayNode = {
      forks: new Map([
        [
          "a".charCodeAt(0),
          {
            metadata: null,
            prefix: new TextEncoder().encode("a"),
            selfAddress: root.selfAddress
          }
        ]
      ]),
      metadata: null,
      path: new Uint8Array(0),
      selfAddress: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      targetAddress: "0000000000000000000000000000000000000000000000000000000000000000"
    };

    await expect(
      resolveMantarayPath(root, "aa.txt", async (reference) => {
        if (reference === child.selfAddress) {
          return child;
        }

        if (reference === root.selfAddress) {
          return root;
        }

        throw new Error(`Unexpected manifest node ${reference}`);
      })
    ).rejects.toThrow(/cycle/);
  });

  it("streams bzz manifest path targets after verified local path resolution", async () => {
    const payload = patternedBytes(4096 * 2 + 99);
    const file = buildSwarmTree(payload);
    const manifest = buildMantarayManifest("folder/large.bin", file.reference, {
      "Content-Type": "application/octet-stream",
      Filename: "large.bin"
    });
    const gateway = createMockChunkGateway(new Map([...file.chunks, ...manifest.chunks]));

    const response = await verifiedFetch(`bzz://${manifest.reference}/folder/large.bin`, {
      gatewayUrl: "https://gateway.test",
      fetch: gateway.fetch,
      responseType: "stream"
    });

    const streamed = await readByteStream(response.body);
    const completion = await response.completion;

    expect(streamed).toEqual(payload);
    expect(completion.chunksVerified).toBeGreaterThan(1);
    expect(response.metadata.manifest).toMatchObject({
      path: "folder/large.bin",
      targetReference: file.reference
    });
  });

  it("can stream verified bytes without reconstructing the full payload before returning", async () => {
    const payload = patternedBytes(4096 * 3 + 257);
    const tree = buildSwarmTree(payload);
    const gateway = createMockChunkGateway(tree.chunks);
    const expectedHash = `0x${bytesToHex(keccak256(payload))}`;

    const response = await verifiedFetch(tree.reference, {
      expectedHash,
      gatewayUrl: "https://gateway.test",
      fetch: gateway.fetch,
      responseType: "stream"
    });

    expect(response.delivery).toBe("stream");
    expect(response.metadata.byteLength).toBe(payload.byteLength);
    expect(gateway.requests.length).toBeLessThan(tree.chunks.size);

    const streamed = await readByteStream(response.body);
    const completion = await response.completion;

    expect(streamed).toEqual(payload);
    expect(completion.contentHash).toBe(expectedHash);
    expect(completion.chunksVerified).toBeGreaterThan(1);
  });

  it("aborts before fetching when the signal is already cancelled", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("cancelled"));
    const controller = new AbortController();
    controller.abort("stop");
    const fetch: FetchLike = async () => {
      throw new Error("fetch should not be called");
    };

    await expect(
      verifiedFetch(chunk.reference, {
        gatewayUrl: "https://example.test",
        fetch,
        signal: controller.signal
      })
    ).rejects.toBeInstanceOf(SwarmAbortError);
  });

  it("supports timeout cancellation", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("timeout"));
    const fetch: FetchLike = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });

    await expect(
      verifiedFetch(chunk.reference, {
        gatewayUrl: "https://example.test",
        fetch,
        timeoutMs: 1
      })
    ).rejects.toBeInstanceOf(SwarmTimeoutError);
  });

  it("supports promise cancellation tokens", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("token"));
    let cancel!: (reason?: unknown) => void;
    const cancelToken = new Promise<unknown>((resolve) => {
      cancel = resolve;
    });
    const fetch: FetchLike = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });

    const pending = verifiedFetch(chunk.reference, {
      cancelToken,
      gatewayUrl: "https://example.test",
      fetch
    });

    cancel("cancelled by token");

    await expect(pending).rejects.toBeInstanceOf(SwarmAbortError);
  });

  it("supports subscription cancellation tokens", async () => {
    const chunk = makeContentAddressedChunk(new TextEncoder().encode("token subscription"));
    let listener: ((reason?: unknown) => void) | undefined;
    const cancelToken = {
      onCancellationRequested(callback: (reason?: unknown) => void) {
        listener = callback;
        return () => {
          listener = undefined;
        };
      }
    };
    const fetch: FetchLike = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });

    const pending = verifiedFetch(chunk.reference, {
      cancelToken,
      gatewayUrl: "https://example.test",
      fetch
    });

    listener?.("cancelled by subscription");

    await expect(pending).rejects.toBeInstanceOf(SwarmAbortError);
  });
});

function marshalMantarayNodeForTest(
  targetReference: string,
  forks: Array<{ metadata: Record<string, string> | null; prefix: Uint8Array; reference: string; type: number }>
): Uint8Array {
  const obfuscationKey = new Uint8Array(32);
  const version = hexToBytes("5768b3b6a7db56d21d1abff40d41cebfc83448fed8d7e9b06ec0d3b073f28f7b");
  const target = hexToBytes(targetReference);
  const hasTarget = target.some((byte) => byte !== 0);
  const header = new Uint8Array(32);
  header.set(version);
  header[31] = hasTarget ? 32 : 0;
  const forkBitmap = new Uint8Array(32);
  const sortedForks = [...forks].sort((left, right) => (left.prefix[0] ?? 0) - (right.prefix[0] ?? 0));

  for (const fork of sortedForks) {
    const bitmapIndex = fork.prefix[0] ?? 0;
    forkBitmap[Math.floor(bitmapIndex / 8)] = (forkBitmap[Math.floor(bitmapIndex / 8)] ?? 0) | (1 << (bitmapIndex % 8));
  }

  return concatTestBytes(
    obfuscationKey,
    header,
    hasTarget ? target : new Uint8Array(0),
    forkBitmap,
    ...sortedForks.map(marshalMantarayForkForTest)
  );
}

function marshalMantarayForkForTest(fork: {
  metadata: Record<string, string> | null;
  prefix: Uint8Array;
  reference: string;
  type: number;
}): Uint8Array {
  const paddedPrefix = new Uint8Array(30);
  paddedPrefix.set(fork.prefix);
  const base = [
    new Uint8Array([fork.type, fork.prefix.byteLength]),
    paddedPrefix,
    hexToBytes(fork.reference)
  ];

  if (!fork.metadata) {
    return concatTestBytes(...base);
  }

  const json = new TextEncoder().encode(JSON.stringify(fork.metadata));
  const metadataLength = 2 + json.byteLength;
  const paddedMetadataLength = Math.ceil(metadataLength / 32) * 32;
  const metadata = new Uint8Array(paddedMetadataLength);
  metadata.fill(0x0a);
  metadata[0] = ((paddedMetadataLength - 2) >> 8) & 0xff;
  metadata[1] = (paddedMetadataLength - 2) & 0xff;
  metadata.set(json, 2);
  return concatTestBytes(...base, metadata);
}

function concatTestBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}
