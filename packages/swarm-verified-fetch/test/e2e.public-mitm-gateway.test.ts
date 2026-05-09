import { describe, expect, it } from "vitest";

import {
  makeContentAddressedChunk,
  SwarmVerificationError,
  verifiedFetch,
  verifiedFetchFeed,
  type FetchLike,
  type FetchOptions,
  type FetchResponseLike
} from "../src/index.js";
import { copyArrayBuffer } from "./helpers.js";
import {
  loadConfiguredPublicGatewayFixture,
  mitmVerifiedFetchOptions,
  type PublicGatewayFixture,
  type PublicFeedCase,
  type PublicImmutableCase,
  type PublicManifestCase
} from "./public-gateway-fixture.js";
import { logE2e } from "./e2e-output.js";

const publicFixture = await loadConfiguredPublicGatewayFixture();
const hasPublicFixture = Boolean(publicFixture);

describe.skipIf(!hasPublicFixture)("public gateway MITM e2e verified fetch", () => {
  it("rejects multiple MITM mutations of a live immutable root chunk", async () => {
    if (!publicFixture) {
      throw new Error("Missing public gateway fixture.");
    }

    const testCase = firstImmutableCase(publicFixture);

    for (const mutation of mitmMutations()) {
      const mitm = createMitmFetch(mutation, {
        shouldMutate(event) {
          return event.reference === testCase.reference;
        }
      });

      await expect(
        verifiedFetch(testCase.reference, {
          ...mitmVerifiedFetchOptions(publicFixture, testCase),
          fetch: mitm.fetch
        })
      ).rejects.toBeInstanceOf(SwarmVerificationError);

      expect(mitm.mutatedReferences, mutation.name).toContain(testCase.reference);
      logE2e("rejected MITM immutable root mutation", {
        mutation: mutation.name,
        reference: testCase.reference,
        mutatedReferences: mitm.mutatedReferences
      });
    }
  }, 120_000);

  it("rejects MITM mutation of the first live non-root child chunk", async () => {
    if (!publicFixture) {
      throw new Error("Missing public gateway fixture.");
    }

    const testCase = multiChunkImmutableCase(publicFixture);

    const mitm = createMitmFetch(flipLastByteMutation, {
      shouldMutate(event) {
        return event.requestIndex === 2;
      }
    });

    await expect(
      verifiedFetch(testCase.reference, {
        ...mitmVerifiedFetchOptions(publicFixture, testCase),
        fetch: mitm.fetch
      })
    ).rejects.toBeInstanceOf(SwarmVerificationError);

    expect(mitm.mutatedReferences.length).toBe(1);
    expect(mitm.mutatedReferences[0]).not.toBe(testCase.reference);
    logE2e("rejected MITM immutable child mutation", {
      reference: testCase.reference,
      mutatedReferences: mitm.mutatedReferences
    });
  }, 120_000);

  it("rejects MITM mutations of the live manifest root before path resolution is trusted", async () => {
    if (!publicFixture) {
      throw new Error("Missing public gateway fixture.");
    }

    const testCase = firstManifestCase(publicFixture);

    for (const mutation of mitmMutations()) {
      const mitm = createMitmFetch(mutation, {
        shouldMutate(event) {
          return event.reference === testCase.manifestReference;
        }
      });

      await expect(
        verifiedFetch(`bzz://${testCase.manifestReference}/${testCase.path}`, {
          ...mitmVerifiedFetchOptions(publicFixture, testCase),
          fetch: mitm.fetch
        })
      ).rejects.toBeInstanceOf(SwarmVerificationError);

      expect(mitm.mutatedReferences, mutation.name).toContain(testCase.manifestReference);
      logE2e("rejected MITM manifest root mutation", {
        mutation: mutation.name,
        manifestReference: testCase.manifestReference,
        path: testCase.path,
        mutatedReferences: mitm.mutatedReferences
      });
    }
  }, 120_000);

  it("rejects MITM mutations of the live target after verified manifest path resolution", async () => {
    if (!publicFixture) {
      throw new Error("Missing public gateway fixture.");
    }

    const testCase = firstManifestCase(publicFixture);

    const clean = await verifiedFetch(`bzz://${testCase.manifestReference}/${testCase.path}`, {
      ...mitmVerifiedFetchOptions(publicFixture, testCase),
      responseType: "buffer"
    });

    for (const mutation of mitmMutations()) {
      const mitm = createMitmFetch(mutation, {
        shouldMutate(event) {
          return event.reference === clean.reference;
        }
      });

      await expect(
        verifiedFetch(`bzz://${testCase.manifestReference}/${testCase.path}`, {
          ...mitmVerifiedFetchOptions(publicFixture, testCase),
          fetch: mitm.fetch
        })
      ).rejects.toBeInstanceOf(SwarmVerificationError);

      expect(mitm.mutatedReferences, mutation.name).toContain(clean.reference);
      logE2e("rejected MITM manifest target mutation", {
        mutation: mutation.name,
        manifestReference: testCase.manifestReference,
        path: testCase.path,
        targetReference: clean.reference,
        mutatedReferences: mitm.mutatedReferences
      });
    }
  }, 120_000);

  it("rejects MITM mutations of a live feed SOC update", async () => {
    if (!publicFixture) {
      throw new Error("Missing public gateway fixture.");
    }

    const testCase = firstFeedCase(publicFixture);

    if (!testCase) {
      logE2e("skipped MITM feed SOC mutation because fixture has no feed cases");
      return;
    }

    for (const mutation of mitmMutations()) {
      const mitm = createMitmFetch(mutation, {
        shouldMutate(event) {
          return event.reference === testCase.updateReference;
        }
      });

      await expect(
        verifiedFetchFeed(
          {
            owner: testCase.owner,
            topic: testCase.topic,
            index: testCase.index
          },
          {
            ...mitmVerifiedFetchOptions(publicFixture, testCase),
            fetch: mitm.fetch
          }
        )
      ).rejects.toBeInstanceOf(SwarmVerificationError);

      expect(mitm.mutatedReferences, mutation.name).toContain(testCase.updateReference);
      logE2e("rejected MITM feed SOC mutation", {
        mutation: mutation.name,
        updateReference: testCase.updateReference,
        targetReference: testCase.targetReference,
        mutatedReferences: mitm.mutatedReferences
      });
    }
  }, 120_000);

  it("rejects MITM mutations of the live target after verified feed resolution", async () => {
    if (!publicFixture) {
      throw new Error("Missing public gateway fixture.");
    }

    const testCase = firstFeedCase(publicFixture);

    if (!testCase) {
      logE2e("skipped MITM feed target mutation because fixture has no feed cases");
      return;
    }

    const clean = await verifiedFetchFeed(
      {
        owner: testCase.owner,
        topic: testCase.topic,
        index: testCase.index
      },
      {
        ...mitmVerifiedFetchOptions(publicFixture, testCase),
        responseType: "buffer"
      }
    );

    for (const mutation of mitmMutations()) {
      const mitm = createMitmFetch(mutation, {
        shouldMutate(event) {
          return event.reference === clean.reference;
        }
      });

      await expect(
        verifiedFetchFeed(
          {
            owner: testCase.owner,
            topic: testCase.topic,
            index: testCase.index
          },
          {
            ...mitmVerifiedFetchOptions(publicFixture, testCase),
            fetch: mitm.fetch
          }
        )
      ).rejects.toBeInstanceOf(SwarmVerificationError);

      expect(mitm.mutatedReferences, mutation.name).toContain(clean.reference);
      logE2e("rejected MITM feed target mutation", {
        mutation: mutation.name,
        updateReference: testCase.updateReference,
        targetReference: clean.reference,
        mutatedReferences: mitm.mutatedReferences
      });
    }
  }, 120_000);
});

function firstImmutableCase(fixture: PublicGatewayFixture): PublicImmutableCase {
  const testCase = fixture.immutable[0];

  if (!testCase) {
    throw new Error("Public gateway fixture validation did not provide an immutable case.");
  }

  return testCase;
}

function multiChunkImmutableCase(fixture: PublicGatewayFixture): PublicImmutableCase {
  const testCase = fixture.immutable.find((candidate) => (candidate.expectedByteLength ?? 0) > 4096);

  if (!testCase) {
    throw new Error("Public gateway fixture validation did not provide a multi-chunk immutable case.");
  }

  return testCase;
}

function firstManifestCase(fixture: PublicGatewayFixture): PublicManifestCase {
  const testCase = fixture.manifest[0];

  if (!testCase) {
    throw new Error("Public gateway fixture validation did not provide a manifest case.");
  }

  return testCase;
}

function firstFeedCase(fixture: PublicGatewayFixture): PublicFeedCase | null {
  return fixture.feed?.[0] ?? null;
}

interface ChunkRequestEvent {
  reference: string;
  requestIndex: number;
  url: string;
}

interface MitmMutation {
  name: string;
  mutate(bytes: Uint8Array): Uint8Array;
}

interface MitmFetch {
  fetch: FetchLike;
  mutatedReferences: string[];
  requests: ChunkRequestEvent[];
}

function createMitmFetch(
  mutation: MitmMutation,
  options: {
    shouldMutate(event: ChunkRequestEvent): boolean;
  }
): MitmFetch {
  const requests: ChunkRequestEvent[] = [];
  const mutatedReferences: string[] = [];

  return {
    async fetch(input: string, init?: FetchOptions): Promise<FetchResponseLike> {
      const response = await fetch(input, init);
      const reference = chunkReferenceFromUrl(input);

      if (reference === null || !response.ok) {
        return response;
      }

      const event = {
        reference,
        requestIndex: requests.length + 1,
        url: input
      };
      requests.push(event);

      if (!options.shouldMutate(event)) {
        return response;
      }

      const originalBytes = new Uint8Array(await response.arrayBuffer());
      const mutatedBytes = mutation.mutate(originalBytes);
      mutatedReferences.push(reference);

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        async arrayBuffer() {
          return copyArrayBuffer(mutatedBytes);
        },
        async text() {
          return new TextDecoder().decode(mutatedBytes);
        }
      };
    },
    mutatedReferences,
    requests
  };
}

const flipLastByteMutation: MitmMutation = {
  name: "flip last byte",
  mutate(bytes) {
    const copy = new Uint8Array(bytes);
    const lastIndex = copy.byteLength - 1;
    copy[lastIndex] = ((copy[lastIndex] ?? 0) ^ 0xff) & 0xff;
    return copy;
  }
};

function mitmMutations(): MitmMutation[] {
  return [
    flipLastByteMutation,
    {
      name: "flip span byte",
      mutate(bytes) {
        const copy = new Uint8Array(bytes);
        copy[0] = ((copy[0] ?? 0) ^ 0x01) & 0xff;
        return copy;
      }
    },
    {
      name: "truncate chunk",
      mutate(bytes) {
        return bytes.slice(0, Math.max(0, bytes.byteLength - 1));
      }
    },
    {
      name: "extend chunk",
      mutate(bytes) {
        const output = new Uint8Array(bytes.byteLength + 1);
        output.set(bytes);
        output[output.byteLength - 1] = 0xff;
        return output;
      }
    },
    {
      name: "replace with valid chunk for a different reference",
      mutate() {
        return makeContentAddressedChunk(new TextEncoder().encode("valid CAC, wrong reference")).bytes;
      }
    }
  ];
}

function chunkReferenceFromUrl(input: string): string | null {
  const url = new URL(input);
  const parts = url.pathname.split("/").filter(Boolean);
  const chunksIndex = parts.indexOf("chunks");
  return chunksIndex < 0 ? null : parts[chunksIndex + 1] ?? null;
}
