import { describe, expect, it } from "vitest";

import {
  feedIdentifier,
  feedTopicFromString,
  feedUpdateReference,
  makeFeedReferenceUpdateChunk,
  makeSingleOwnerChunk,
  SwarmVerificationError,
  verifiedFetch,
  verifiedFetchFeed,
  verifiedFetchFeedUpdate,
  verifyFeedUpdate,
  verifySingleOwnerChunk
} from "../src/index.js";
import {
  buildSwarmTree,
  bytesResponse,
  createMockChunkGateway,
  mutateLastByte,
  textResponse
} from "./helpers.js";

const TEST_PRIVATE_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111";
const TEST_TOPIC = feedTopicFromString("truthmarket.swarm-verified-fetch.soc-feed-test");
const TEST_INDEX = 7n;

describe("single owner chunk verification", () => {
  it("verifies a Bee-compatible SOC wrapper and exposes wrapped CAC metadata", () => {
    const payload = new TextEncoder().encode("soc payload");
    const identifier = feedIdentifier(TEST_TOPIC, TEST_INDEX);
    const soc = makeSingleOwnerChunk(TEST_PRIVATE_KEY, identifier, payload);

    const verified = verifySingleOwnerChunk(soc.reference, soc.bytes, {
      expectedIdentifier: identifier,
      expectedOwner: soc.owner
    });

    expect(verified.reference).toBe(soc.reference);
    expect(verified.owner).toBe(soc.owner);
    expect(verified.identifier).toBe(identifier);
    expect(verified.payload).toEqual(payload);
    expect(verified.span).toBe(BigInt(payload.byteLength));
    expect(verified.wrappedChunkReference).toBe(soc.wrappedChunkReference);
  });

  it("rejects SOC payload and signature tampering", () => {
    const soc = makeSingleOwnerChunk(
      TEST_PRIVATE_KEY,
      feedIdentifier(TEST_TOPIC, TEST_INDEX),
      new TextEncoder().encode("untampered")
    );
    const tamperedPayload = mutateLastByte(soc.bytes);
    const tamperedSignature = new Uint8Array(soc.bytes);
    tamperedSignature[40] = ((tamperedSignature[40] ?? 0) ^ 0x01) & 0xff;

    expect(() => verifySingleOwnerChunk(soc.reference, tamperedPayload)).toThrow(SwarmVerificationError);
    expect(() => verifySingleOwnerChunk(soc.reference, tamperedSignature)).toThrow(SwarmVerificationError);
  });
});

describe("sequence feed verification", () => {
  it("verifies a reference feed update and returns the immutable target reference", () => {
    const target = buildSwarmTree(new TextEncoder().encode("feed target"));
    const feed = makeFeedReferenceUpdateChunk({
      privateKey: TEST_PRIVATE_KEY,
      topic: TEST_TOPIC,
      index: TEST_INDEX,
      targetReference: target.reference,
      timestamp: 1_800_000_000
    });

    const verified = verifyFeedUpdate(feed.reference, feed.bytes, {
      owner: feed.owner,
      topic: TEST_TOPIC,
      index: TEST_INDEX
    });

    expect(verified.owner).toBe(feed.owner);
    expect(verified.topic).toBe(TEST_TOPIC);
    expect(verified.index).toBe(TEST_INDEX);
    expect(verified.reference).toBe(feedUpdateReference(feed.owner, TEST_TOPIC, TEST_INDEX));
    expect(verified.targetReference).toBe(target.reference);
    expect(verified.timestamp).toBe(1_800_000_000);
  });

  it("fetches and verifies a mutable feed target through the high-level API", async () => {
    const target = buildSwarmTree(new TextEncoder().encode("verified feed target bytes"));
    const feed = makeFeedReferenceUpdateChunk({
      privateKey: TEST_PRIVATE_KEY,
      topic: TEST_TOPIC,
      index: TEST_INDEX,
      targetReference: target.reference,
      timestamp: 1_800_000_001
    });
    const gateway = createMockChunkGateway(new Map([...target.chunks, [feed.reference, feed.bytes]]));

    const update = await verifiedFetchFeedUpdate(
      {
        owner: feed.owner,
        topic: TEST_TOPIC,
        index: TEST_INDEX
      },
      {
        gatewayUrl: "https://fake-public-gateway.test",
        fetch: gateway.fetch
      }
    );
    expect(update.targetReference).toBe(target.reference);

    const response = await verifiedFetchFeed(
      {
        owner: feed.owner,
        topic: TEST_TOPIC,
        index: TEST_INDEX
      },
      {
        gatewayUrl: "https://fake-public-gateway.test",
        fetch: gateway.fetch
      }
    );

    expect(await response.text()).toBe("verified feed target bytes");
    expect(response.feed.targetReference).toBe(target.reference);
    expect(response.metadata.feed.targetReference).toBe(target.reference);
    expect(response.verification.feed.updateReference).toBe(feed.reference);
  });

  it("supports feed:// URLs and probes a gateway-reported index before verifying the SOC", async () => {
    const target = buildSwarmTree(new TextEncoder().encode("latest feed target"));
    const feed = makeFeedReferenceUpdateChunk({
      privateKey: TEST_PRIVATE_KEY,
      topic: TEST_TOPIC,
      index: TEST_INDEX,
      targetReference: target.reference,
      timestamp: 1_800_000_002
    });
    const gateway = createMockChunkGateway(new Map([...target.chunks, [feed.reference, feed.bytes]]));
    const fetch = async (input: string, init?: { method?: string }) => {
      const url = new URL(input);

      if (url.pathname.startsWith("/feeds/")) {
        return {
          ...textResponse("gateway payload is ignored"),
          headers: new Headers({
            "swarm-feed-index": TEST_INDEX.toString(),
            "swarm-feed-index-next": (TEST_INDEX + 1n).toString()
          })
        };
      }

      return gateway.fetch(input, init);
    };

    const response = await verifiedFetch(`feed://${feed.owner}/${TEST_TOPIC}`, {
      gatewayUrl: "https://fake-public-gateway.test",
      fetch
    });

    expect(await response.text()).toBe("latest feed target");
  });

  it("rejects a feed SOC that points to a tampered immutable target", async () => {
    const target = buildSwarmTree(new TextEncoder().encode("honest target"));
    const feed = makeFeedReferenceUpdateChunk({
      privateKey: TEST_PRIVATE_KEY,
      topic: TEST_TOPIC,
      index: TEST_INDEX,
      targetReference: target.reference,
      timestamp: 1_800_000_003
    });
    const gateway = createMockChunkGateway(new Map([...target.chunks, [feed.reference, feed.bytes]]));
    gateway.mutateChunk(target.reference, mutateLastByte);

    await expect(
      verifiedFetchFeed(
        {
          owner: feed.owner,
          topic: TEST_TOPIC,
          index: TEST_INDEX
        },
        {
          gatewayUrl: "https://fake-public-gateway.test",
          fetch: gateway.fetch
        }
      )
    ).rejects.toBeInstanceOf(SwarmVerificationError);
  });

  it("does not trust gateway /feeds payload bytes when resolving latest", async () => {
    const target = buildSwarmTree(new TextEncoder().encode("feed target after ignored lie"));
    const feed = makeFeedReferenceUpdateChunk({
      privateKey: TEST_PRIVATE_KEY,
      topic: TEST_TOPIC,
      index: TEST_INDEX,
      targetReference: target.reference,
      timestamp: 1_800_000_004
    });
    const gateway = createMockChunkGateway(new Map([...target.chunks, [feed.reference, feed.bytes]]));
    const fetch = async (input: string, init?: { method?: string }) => {
      const url = new URL(input);

      if (url.pathname.startsWith("/feeds/")) {
        return {
          ...bytesResponse(new TextEncoder().encode("malicious gateway feed payload")),
          headers: new Headers({
            "swarm-feed-index": TEST_INDEX.toString()
          })
        };
      }

      return gateway.fetch(input, init);
    };

    const response = await verifiedFetchFeed(
      {
        owner: feed.owner,
        topic: TEST_TOPIC
      },
      {
        gatewayUrl: "https://fake-public-gateway.test",
        fetch
      }
    );

    expect(await response.text()).toBe("feed target after ignored lie");
  });
});
