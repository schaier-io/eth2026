import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { bytesToHex, keccak256, verifiedFetch } from "../src/index.js";
import { logE2e } from "./e2e-output.js";

const fixturePath = resolve(
  process.env["SWARM_E2E_REGISTRY_FIXTURE"] ?? "../swarm-kv/.e2e/live-registry-references.json"
);
const registryFixture = await loadRegistryFixture(fixturePath);
const gatewayUrl = normalizeOptionalUrl(process.env["SWARM_E2E_GATEWAY_URL"]) ?? registryFixture?.gatewayUrl;
const hasRegistryFixture = Boolean(registryFixture && process.env["SWARM_E2E_GATEWAY_URL"] && gatewayUrl);

describe.skipIf(!hasRegistryFixture)("live registry gateway e2e verified fetch", () => {
  it("verifies KV-published live registry references through the configured gateway", async () => {
    if (!registryFixture || !gatewayUrl) {
      throw new Error("Missing live registry verifier e2e configuration.");
    }

    const index = await verifiedFetch(registryFixture.indexReference, {
      gatewayUrl,
      maxChunks: 4096
    });
    const indexJson = await index.json<{ entries?: Record<string, { reference?: string }> }>();
    logE2e("verified live registry index", {
      gatewayUrl,
      reference: registryFixture.indexReference,
      bytes: index.bytes.byteLength,
      chunks: index.chunksVerified,
      contentHash: index.contentHash
    });

    expect(indexJson.entries?.["registry:package"]?.reference).toBe(registryFixture.values.package.reference);
    expect(indexJson.entries?.["registry:release"]?.reference).toBe(registryFixture.values.release.reference);
    expect(indexJson.entries?.["registry:readme"]?.reference).toBe(registryFixture.values.readme.reference);
    expect(indexJson.entries?.["registry:tarball"]?.reference).toBe(registryFixture.values.tarball.reference);

    const packageBytes = await verifiedFetch(registryFixture.values.package.reference, {
      gatewayUrl,
      maxChunks: 4096
    });
    expect(await packageBytes.json()).toEqual(registryFixture.values.package.expected);
    logE2e("verified live registry package metadata", registryOutput(registryFixture.values.package, packageBytes));

    const releaseBytes = await verifiedFetch(registryFixture.values.release.reference, {
      gatewayUrl,
      maxChunks: 4096
    });
    expect(await releaseBytes.json()).toEqual(registryFixture.values.release.expected);
    logE2e("verified live registry release metadata", registryOutput(registryFixture.values.release, releaseBytes));

    const readmeBytes = await verifiedFetch(registryFixture.values.readme.reference, {
      gatewayUrl,
      maxChunks: 4096
    });
    expect(await readmeBytes.text()).toBe(registryFixture.values.readme.expected);
    logE2e("verified live registry readme", registryOutput(registryFixture.values.readme, readmeBytes));

    const tarballBytes = await verifiedFetch(registryFixture.values.tarball.reference, {
      gatewayUrl,
      maxChunks: 4096
    });
    expect(tarballBytes.bytes.byteLength).toBe(registryFixture.values.tarball.expectedLength);
    expect(bytesToHex(keccak256(tarballBytes.bytes))).toBe(registryFixture.values.tarball.expectedKeccak256);
    expect(tarballBytes.chunksVerified).toBeGreaterThan(1);
    logE2e("verified live registry tarball", registryOutput(registryFixture.values.tarball, tarballBytes));
  }, 90_000);
});

interface RegistryFixture {
  schema: "truthmarket.swarm-kv.e2e-registry.v1";
  gatewayUrl: string;
  indexReference: string;
  values: {
    package: JsonRegistryValue;
    release: JsonRegistryValue;
    readme: StringRegistryValue;
    tarball: BytesRegistryValue;
  };
}

interface JsonRegistryValue {
  key: string;
  reference: string;
  kind: "json";
  expected: unknown;
}

interface StringRegistryValue {
  key: string;
  reference: string;
  kind: "string";
  expected: string;
}

interface BytesRegistryValue {
  key: string;
  reference: string;
  kind: "bytes";
  expectedLength: number;
  expectedKeccak256: string;
  expectedMultiChunk: boolean;
}

function registryOutput(
  value: JsonRegistryValue | StringRegistryValue | BytesRegistryValue,
  response: { bytes: Uint8Array; chunksVerified: number; contentHash: string }
): Record<string, unknown> {
  return {
    key: value.key,
    reference: value.reference,
    kind: value.kind,
    bytes: response.bytes.byteLength,
    chunks: response.chunksVerified,
    contentHash: response.contentHash
  };
}

async function loadRegistryFixture(path: string): Promise<RegistryFixture | null> {
  try {
    await access(path);
  } catch {
    return null;
  }

  const parsed = JSON.parse(await readFile(path, "utf8")) as RegistryFixture;

  if (parsed.schema !== "truthmarket.swarm-kv.e2e-registry.v1") {
    throw new Error(`Unsupported live registry fixture schema in ${path}.`);
  }

  return parsed;
}

function normalizeOptionalUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return new URL(value).toString().replace(/\/$/, "");
}
