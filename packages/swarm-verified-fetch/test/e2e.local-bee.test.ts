import { describe, expect, it } from "vitest";

import { verifiedFetch } from "../src/index.js";
import { logE2e } from "./e2e-output.js";
import { patternedBytes } from "./helpers.js";
import { waitForUsablePostageBatch } from "./live-bee.js";

const beeApiUrl = normalizeOptionalUrl(process.env["SWARM_KV_BEE_API_URL"] ?? process.env["SWARM_E2E_BEE_API_URL"]);
const postageBatchId = process.env["SWARM_POSTAGE_BATCH_ID"];
const postagelessUploads = process.env["SWARM_E2E_POSTAGE_MODE"] === "none";
const hasUploadConfig = Boolean(beeApiUrl && (postageBatchId || postagelessUploads));

describe.skipIf(!hasUploadConfig)("Bee-compatible upload e2e verified fetch", () => {
  it("publishes and verifies immutable strings, JSON, binary bytes, and multi-chunk bytes", async () => {
    if (!beeApiUrl) {
      throw new Error("Missing Bee-compatible upload e2e configuration.");
    }

    if (!postagelessUploads) {
      if (!postageBatchId) {
        throw new Error("Missing postage batch id for Bee-compatible upload e2e.");
      }

      await waitForUsablePostageBatch(beeApiUrl, postageBatchId);
    }

    const cases = [
      {
        name: "string",
        bytes: new TextEncoder().encode("verified fetch e2e string"),
        contentType: "text/plain;charset=utf-8",
        assert(responseBytes: Uint8Array) {
          expect(new TextDecoder().decode(responseBytes)).toBe("verified fetch e2e string");
        }
      },
      {
        name: "json",
        bytes: new TextEncoder().encode(JSON.stringify({ kind: "json", ok: true })),
        contentType: "application/json",
        assert(responseBytes: Uint8Array) {
          expect(JSON.parse(new TextDecoder().decode(responseBytes)) as unknown).toEqual({
            kind: "json",
            ok: true
          });
        }
      },
      {
        name: "binary",
        bytes: new Uint8Array([0, 1, 2, 253, 254, 255]),
        contentType: "application/octet-stream",
        assert(responseBytes: Uint8Array) {
          expect(responseBytes).toEqual(new Uint8Array([0, 1, 2, 253, 254, 255]));
        }
      },
      {
        name: "multi-chunk",
        bytes: patternedBytes(4096 * 3 + 777),
        contentType: "application/octet-stream",
        assert(responseBytes: Uint8Array) {
          expect(responseBytes).toEqual(patternedBytes(4096 * 3 + 777));
        }
      }
    ];

    for (const testCase of cases) {
      const reference = await uploadBytes(
        beeApiUrl,
        postagelessUploads ? undefined : postageBatchId,
        testCase.bytes,
        testCase.contentType
      );
      const response = await verifiedFetch(reference, {
        gatewayUrl: beeApiUrl,
        maxChunks: 4096
      });

      testCase.assert(response.bytes);
      logE2e("verified Bee-compatible upload", {
        name: testCase.name,
        gatewayUrl: beeApiUrl,
        postageMode: postagelessUploads ? "none" : "batch",
        reference,
        bytes: response.bytes.byteLength,
        chunks: response.chunksVerified,
        contentHash: response.contentHash
      });

      if (testCase.name === "multi-chunk") {
        expect(response.chunksVerified).toBeGreaterThan(1);
      } else {
        expect(response.chunksVerified).toBe(1);
      }
    }
  }, 240_000);
});

async function uploadBytes(
  gatewayUrl: string,
  batchId: string | undefined,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const headers = new Headers({
    "Content-Type": contentType,
    "Swarm-Pin": "false"
  });

  if (batchId) {
    headers.set("Swarm-Postage-Batch-Id", batchId);
  }

  const response = await fetch(`${gatewayUrl}/bytes`, {
    method: "POST",
    headers,
    body: copyArrayBuffer(bytes)
  });

  if (!response.ok) {
    throw new Error(`Bee upload failed: ${response.status} ${response.statusText} - ${await response.text()}`);
  }

  const json = (await response.json()) as { reference?: string };

  if (!json.reference) {
    throw new Error("Bee upload response did not include reference.");
  }

  return json.reference;
}

function normalizeOptionalUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return new URL(value).toString().replace(/\/$/, "");
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}
