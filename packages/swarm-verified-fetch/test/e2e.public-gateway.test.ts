import { describe, expect, it } from "vitest";

import { verifiedFetch, verifiedFetchFeed, verifiedFetchFeedUpdate, type VerifiedFetchProgressEvent } from "../src/index.js";
import {
  assertPublicBytes,
  loadConfiguredPublicGatewayFixture,
  normalizeMimeType,
  verifiedFetchOptions
} from "./public-gateway-fixture.js";
import { logE2e } from "./e2e-output.js";
import { readByteStream } from "./helpers.js";

const publicFixture = await loadConfiguredPublicGatewayFixture();
const hasPublicFixture = Boolean(publicFixture);

describe.skipIf(!hasPublicFixture)("public gateway e2e verified fetch", () => {
  it("verifies public immutable byte references through configured gateway chunks", async () => {
    if (!publicFixture) {
      throw new Error("Missing public gateway fixture.");
    }

    for (const testCase of publicFixture.immutable) {
      const events: VerifiedFetchProgressEvent[] = [];
      const response = await verifiedFetch(testCase.reference, {
        ...verifiedFetchOptions(publicFixture, testCase),
        responseType: "buffer",
        onProgress(event) {
          events.push(event);
        }
      });

      assertPublicBytes(testCase, response.bytes);
      logE2e("verified public immutable bytes", {
        name: testCase.name,
        reference: testCase.reference,
        bytes: response.bytes.byteLength,
        chunks: response.chunksVerified,
        contentHash: response.contentHash
      });
      expect(response.metadata.byteLength).toBe(response.bytes.byteLength);
      expect(response.metadata.fileName).toBe(testCase.fileName);

      if (testCase.contentType !== undefined) {
        expect(response.metadata.mimeType).toBe(normalizeMimeType(testCase.contentType));
      }

      expect(events.at(-1)).toMatchObject({
        type: "complete",
        bytesVerified: response.bytes.byteLength,
        totalBytes: response.bytes.byteLength,
        contentHash: response.contentHash
      });

      const streamResponse = await verifiedFetch(testCase.reference, {
        ...verifiedFetchOptions(publicFixture, testCase),
        responseType: "stream"
      });
      const streamed = await readByteStream(streamResponse.body);
      const completion = await streamResponse.completion;

      expect(streamed).toEqual(response.bytes);
      expect(completion.contentHash).toBe(response.contentHash);
      logE2e("verified public immutable stream", {
        name: testCase.name,
        reference: testCase.reference,
        bytes: streamed.byteLength,
        chunks: completion.chunksVerified,
        contentHash: completion.contentHash
      });
    }
  }, 120_000);

  it("verifies public Mantaray manifest paths and manifest-derived metadata", async () => {
    if (!publicFixture) {
      throw new Error("Missing public gateway fixture.");
    }

    for (const testCase of publicFixture.manifest) {
      const response = await verifiedFetch(`bzz://${testCase.manifestReference}/${testCase.path}`, {
        ...verifiedFetchOptions(publicFixture, testCase),
        responseType: "buffer"
      });

      assertPublicBytes(testCase, response.bytes);
      logE2e("verified public manifest path", {
        name: testCase.name,
        manifestReference: testCase.manifestReference,
        path: testCase.path,
        targetReference: response.reference,
        bytes: response.bytes.byteLength,
        chunks: response.chunksVerified,
        contentHash: response.contentHash
      });
      expect(response.metadata.path).toBe(testCase.path);
      expect(response.metadata.manifest).toMatchObject({
        path: testCase.path,
        reference: testCase.manifestReference
      });

      if (testCase.fileName !== undefined) {
        expect(response.metadata.fileName).toBe(testCase.fileName);
      }

      if (testCase.contentType !== undefined) {
        expect(response.metadata.mimeType).toBe(normalizeMimeType(testCase.contentType));
      }

      if (testCase.expectedByteLength !== undefined) {
        expect(response.metadata.byteLength).toBe(testCase.expectedByteLength);
      }
    }
  }, 120_000);

  it("verifies public SOC/feed updates and the immutable target they point to", async () => {
    if (!publicFixture) {
      throw new Error("Missing public gateway fixture.");
    }

    if (!publicFixture.feed?.length) {
      logE2e("skipped public feed verification because fixture has no feed cases");
      return;
    }

    for (const testCase of publicFixture.feed) {
      const update = await verifiedFetchFeedUpdate(
        {
          owner: testCase.owner,
          topic: testCase.topic,
          index: testCase.index
        },
        verifiedFetchOptions(publicFixture, testCase)
      );

      expect(update.reference).toBe(testCase.updateReference);
      expect(update.targetReference).toBe(testCase.targetReference);

      if (testCase.timestamp !== undefined) {
        expect(update.timestamp).toBe(testCase.timestamp);
      }

      const response = await verifiedFetchFeed(
        {
          owner: testCase.owner,
          topic: testCase.topic,
          index: testCase.index
        },
        {
          ...verifiedFetchOptions(publicFixture, testCase),
          responseType: "buffer"
        }
      );

      assertPublicBytes(testCase, response.bytes);
      expect(response.feed.reference).toBe(testCase.updateReference);
      expect(response.feed.targetReference).toBe(testCase.targetReference);
      expect(response.metadata.feed.targetReference).toBe(testCase.targetReference);
      logE2e("verified public feed reference", {
        name: testCase.name,
        owner: testCase.owner,
        topic: testCase.topic,
        index: testCase.index.toString(),
        updateReference: update.reference,
        targetReference: response.reference,
        bytes: response.bytes.byteLength,
        chunks: response.chunksVerified,
        contentHash: response.contentHash
      });
    }
  }, 120_000);
});
