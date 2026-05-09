import { describe, expect, it } from "vitest";

import {
  feedTopicFromString,
  makeFeedReferenceUpdateChunk,
  makeContentAddressedChunk,
  SwarmGatewayError,
  SwarmInputError,
  SwarmVerificationError,
  verifiedFetch,
  verifiedFetchFeed,
  type FetchLike
} from "../src/index.js";
import {
  buildMantarayManifest,
  buildSwarmTree,
  bytesResponse,
  createMockChunkGateway,
  mutateLastByte,
  patternedBytes,
  textResponse
} from "./helpers.js";
import { logE2e } from "./e2e-output.js";

describe("fake invalid gateway e2e verified fetch", () => {
  it("rejects tampered public chunk bytes before exposing a payload", async () => {
    const tree = buildSwarmTree(new TextEncoder().encode("public data"));
    const gateway = createMockChunkGateway(tree.chunks);
    gateway.mutateChunk(tree.reference, mutateLastByte);

    await expect(
      verifiedFetch(tree.reference, {
        gatewayUrl: "https://fake-public-gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toBeInstanceOf(SwarmVerificationError);
    logE2e("rejected fake gateway tampered root", { reference: tree.reference });
  });

  it("rejects a verified manifest path when the target chunk bytes are fake", async () => {
    const payload = new TextEncoder().encode('{"schema":"truthmarket.claimRules.v1"}');
    const file = buildSwarmTree(payload);
    const manifest = buildMantarayManifest("claim-rules.json", file.reference, {
      "Content-Length": String(payload.byteLength),
      "Content-Type": "application/json",
      Filename: "claim-rules.json"
    });
    const gateway = createMockChunkGateway(new Map([...file.chunks, ...manifest.chunks]));
    gateway.mutateChunk(file.reference, mutateLastByte);

    await expect(
      verifiedFetch(`bzz://${manifest.reference}/claim-rules.json`, {
        gatewayUrl: "https://fake-public-gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toBeInstanceOf(SwarmVerificationError);
    logE2e("rejected fake gateway tampered manifest target", {
      manifestReference: manifest.reference,
      targetReference: file.reference
    });
  });

  it("rejects verified manifest file-size metadata that disagrees with the verified byte tree", async () => {
    const payload = new TextEncoder().encode("hello public manifest");
    const file = buildSwarmTree(payload);
    const manifest = buildMantarayManifest("hello.txt", file.reference, {
      "Content-Length": String(payload.byteLength + 10),
      "Content-Type": "text/plain",
      Filename: "hello.txt"
    });
    const gateway = createMockChunkGateway(new Map([...file.chunks, ...manifest.chunks]));

    await expect(
      verifiedFetch(`bzz://${manifest.reference}/hello.txt`, {
        gatewayUrl: "https://fake-public-gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toThrow(/byte length mismatch/);
    logE2e("rejected fake gateway manifest size mismatch", { manifestReference: manifest.reference });
  });

  it("rejects missing paths from a verified manifest instead of trusting gateway path resolution", async () => {
    const file = buildSwarmTree(new TextEncoder().encode("present file"));
    const manifest = buildMantarayManifest("present.txt", file.reference, {
      "Content-Type": "text/plain",
      Filename: "present.txt"
    });
    const gateway = createMockChunkGateway(new Map([...file.chunks, ...manifest.chunks]));

    await expect(
      verifiedFetch(`bzz://${manifest.reference}/missing.txt`, {
        gatewayUrl: "https://fake-public-gateway.test",
        fetch: gateway.fetch
      })
    ).rejects.toBeInstanceOf(SwarmInputError);
    logE2e("rejected fake gateway missing manifest path", { manifestReference: manifest.reference });
  });

  it("fails over when the first gateway lies and the second gateway returns a verifiable chunk", async () => {
    const valid = makeContentAddressedChunk(new TextEncoder().encode("verified after failover"));
    const liar = makeContentAddressedChunk(new TextEncoder().encode("wrong public bytes"));
    const origins: string[] = [];
    const fetch: FetchLike = async (input) => {
      const url = new URL(input);
      origins.push(url.origin);
      return bytesResponse(url.origin === "https://liar.test" ? liar.bytes : valid.bytes);
    };

    const response = await verifiedFetch(valid.reference, {
      gatewayUrl: "https://liar.test",
      gateways: ["https://liar.test", "https://honest.test"],
      fetch
    });

    expect(origins).toEqual(["https://liar.test", "https://honest.test"]);
    expect(await response.text()).toBe("verified after failover");
    logE2e("accepted failover after lying gateway", {
      reference: valid.reference,
      origins,
      contentHash: response.contentHash
    });
  });

  it("rejects gateway racing when every racing gateway serves invalid bytes", async () => {
    const valid = makeContentAddressedChunk(new TextEncoder().encode("expected public bytes"));
    const liar = makeContentAddressedChunk(new TextEncoder().encode("wrong bytes"));
    const fetch: FetchLike = async () => bytesResponse(liar.bytes);

    await expect(
      verifiedFetch(valid.reference, {
        gatewayUrl: "https://liar-1.test",
        gateways: ["https://liar-1.test", "https://liar-2.test"],
        gatewayStrategy: "race",
        fetch
      })
    ).rejects.toBeInstanceOf(SwarmGatewayError);
    logE2e("rejected all-lying gateway race", { reference: valid.reference });
  });

  it("retries a transient invalid response but returns only the later verifiable chunk", async () => {
    const valid = makeContentAddressedChunk(patternedBytes(128));
    const stale = makeContentAddressedChunk(new TextEncoder().encode("stale"));
    let attempts = 0;
    const fetch: FetchLike = async () => {
      attempts += 1;

      if (attempts === 1) {
        return textResponse("temporary gateway failure", 503, "Service Unavailable");
      }

      if (attempts === 2) {
        return bytesResponse(stale.bytes);
      }

      return bytesResponse(valid.bytes);
    };

    const response = await verifiedFetch(valid.reference, {
      gatewayUrl: "https://flaky-public-gateway.test",
      fetch,
      retry: { attempts: 3, baseDelayMs: 0 }
    });

    expect(attempts).toBe(3);
    expect(response.bytes).toEqual(patternedBytes(128));
    logE2e("accepted retry after transient and stale responses", {
      reference: valid.reference,
      attempts,
      contentHash: response.contentHash
    });
  });

  it("rejects a tampered feed SOC before reading its target bytes", async () => {
    const target = buildSwarmTree(new TextEncoder().encode("unread target"));
    const feed = makeFeedReferenceUpdateChunk({
      privateKey: "0x2222222222222222222222222222222222222222222222222222222222222222",
      topic: feedTopicFromString("truthmarket.e2e.invalid.feed"),
      index: 0,
      targetReference: target.reference,
      timestamp: 1_800_100_000
    });
    const gateway = createMockChunkGateway(new Map([...target.chunks, [feed.reference, feed.bytes]]));
    gateway.mutateChunk(feed.reference, mutateLastByte);

    await expect(
      verifiedFetchFeed(
        {
          owner: feed.owner,
          topic: feed.topic,
          index: feed.index
        },
        {
          gatewayUrl: "https://fake-public-gateway.test",
          fetch: gateway.fetch
        }
      )
    ).rejects.toBeInstanceOf(SwarmVerificationError);
    expect(gateway.requests.some((request) => request.path.includes(target.reference))).toBe(false);
    logE2e("rejected fake gateway tampered feed SOC", {
      updateReference: feed.reference,
      targetReference: target.reference
    });
  });

  it("fails over when the first gateway serves an invalid feed SOC", async () => {
    const target = buildSwarmTree(new TextEncoder().encode("feed failover target"));
    const topic = feedTopicFromString("truthmarket.e2e.feed.failover");
    const feed = makeFeedReferenceUpdateChunk({
      privateKey: "0x3333333333333333333333333333333333333333333333333333333333333333",
      topic,
      index: 1,
      targetReference: target.reference,
      timestamp: 1_800_100_001
    });
    const origins: string[] = [];
    const fetch: FetchLike = async (input) => {
      const url = new URL(input);
      origins.push(url.origin);

      if (url.pathname === `/chunks/${feed.reference}` && url.origin === "https://liar.test") {
        return bytesResponse(mutateLastByte(feed.bytes));
      }

      if (url.pathname === `/chunks/${feed.reference}`) {
        return bytesResponse(feed.bytes);
      }

      const reference = url.pathname.slice("/chunks/".length);
      const chunk = target.chunks.get(reference);
      return chunk ? bytesResponse(chunk) : textResponse("missing", 404, "Not Found");
    };

    const response = await verifiedFetchFeed(
      {
        owner: feed.owner,
        topic,
        index: 1
      },
      {
        gatewayUrl: "https://liar.test",
        gateways: ["https://liar.test", "https://honest.test"],
        fetch
      }
    );

    expect(await response.text()).toBe("feed failover target");
    expect(origins).toContain("https://liar.test");
    expect(origins).toContain("https://honest.test");
    logE2e("accepted feed failover after lying gateway", {
      updateReference: feed.reference,
      targetReference: target.reference,
      origins,
      contentHash: response.contentHash
    });
  });
});
