import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { bytesToHex, keccak256 } from "@truth-market/swarm-verified-fetch";

import { createSwarmKvStore, type PutResult, type SwarmKvStore } from "../src/index.js";
import { byteLength, logE2eRead, logE2eStep, logE2eTestStart, traceE2ePut } from "./e2e-log.js";
import { patternedBytes } from "./fake-bee.js";
import { resolveLiveSwarmE2eConfig } from "./live-e2e-config.js";
import { logPublicGatewayFallback, waitForUsablePostageBatch, warnSkippedLiveBeeE2e } from "./live-bee.js";

const liveConfig = resolveLiveSwarmE2eConfig();
const beeApiUrl = liveConfig.beeApiUrl;
const gatewayUrl = liveConfig.gatewayUrl;
const postageBatchId = liveConfig.postageBatchId;
const outputPath = resolve(process.env["SWARM_E2E_REGISTRY_FIXTURE"] ?? ".e2e/live-registry-references.json");

warnSkippedLiveBeeE2e("local Bee e2e registry publishing through Swarm KV", liveConfig.missingConfig);

if (liveConfig.usingPublicGatewayFallback && beeApiUrl) {
  logPublicGatewayFallback("local Bee e2e registry publishing through Swarm KV", beeApiUrl);
}

const createdAt = new Date("2026-05-09T12:00:00.000Z").toISOString();
const packageMetadata = {
  schema: "truthmarket.swarm-registry.package.v1",
  name: "@truth-market/swarm-verified-fetch",
  description: "Fetch-shaped Swarm gateway reads with client-side verification.",
  tags: ["swarm", "verified-fetch", "gateway"],
  createdAt
};
const releaseMetadata = {
  schema: "truthmarket.swarm-registry.release.v1",
  name: "@truth-market/swarm-verified-fetch",
  version: "0.0.0-e2e",
  files: ["dist/index.js", "dist/index.d.ts"],
  createdAt
};
const readme = [
  "# Live Swarm Registry E2E",
  "",
  "This document was published through @truth-market/swarm-kv and verified through @truth-market/swarm-verified-fetch."
].join("\n");
const tarballBytes = patternedBytes(4096 * 4 + 123);

describe.skipIf(!liveConfig.hasConfig)("local Bee e2e registry publishing through Swarm KV", () => {
  let store: SwarmKvStore;
  let packagePut: PutResult | null = null;
  let releasePut: PutResult | null = null;
  let readmePut: PutResult | null = null;
  let tarballPut: PutResult | null = null;
  let feedManifestReference: string | null = null;

  beforeEach((context) => {
    logE2eTestStart(context.task.name);
  });

  beforeAll(async () => {
    if (!beeApiUrl || !gatewayUrl || !postageBatchId) {
      throw new Error("Missing local Bee registry e2e configuration.");
    }

    if (liveConfig.shouldCheckPostageBatch) {
      await waitForUsablePostageBatch(beeApiUrl, postageBatchId);
    }
    store = createSwarmKvStore({
      gatewayUrl,
      beeApiUrl,
      postageBatchId,
      owner: `0x${"1".repeat(40)}`,
      privateByDefault: false,
      maxVerifiedChunks: 4096,
      namespace: "truthmarket:swarm-registry:e2e"
    });
  });

  it("publishes registry package JSON metadata", async () => {
    await publishRegistryPackage();
  }, 240_000);

  it("publishes registry release JSON metadata", async () => {
    await publishRegistryRelease();
  }, 240_000);

  it("publishes registry README markdown", async () => {
    await publishRegistryReadme();
  }, 240_000);

  it("publishes registry tarball bytes", async () => {
    await publishRegistryTarball();
  }, 240_000);

  it("writes verifier reference for registry package JSON metadata", async () => {
    const artifact = await writeRegistryFixture();

    expect(artifact.values.package).toMatchObject({
      key: "registry:package",
      kind: "json",
      expected: packageMetadata
    });
  }, 240_000);

  it("writes verifier reference for registry release JSON metadata", async () => {
    const artifact = await writeRegistryFixture();

    expect(artifact.values.release).toMatchObject({
      key: "registry:release",
      kind: "json",
      expected: releaseMetadata
    });
  }, 240_000);

  it("writes verifier reference for registry README markdown", async () => {
    const artifact = await writeRegistryFixture();

    expect(artifact.values.readme).toMatchObject({
      key: "registry:readme",
      kind: "string",
      expected: readme
    });
  }, 240_000);

  it("writes verifier reference for registry tarball bytes", async () => {
    const artifact = await writeRegistryFixture();

    expect(artifact.values.tarball).toMatchObject({
      key: "registry:tarball",
      kind: "bytes",
      expectedLength: tarballBytes.byteLength,
      expectedMultiChunk: true
    });
  }, 240_000);

  async function writeRegistryFixture(): Promise<RegistryFixtureArtifact> {
    const artifact = await buildRegistryFixture();

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

    expect(artifact.indexReference).toHaveLength(64);
    expect(artifact.feedManifestReference).toHaveLength(64);

    logE2eStep("registry-fixture:written", {
      outputPath,
      indexReference: artifact.indexReference,
      feedManifestReference: artifact.feedManifestReference
    });

    return artifact;
  }

  async function buildRegistryFixture(): Promise<RegistryFixtureArtifact> {
    if (!beeApiUrl || !gatewayUrl) {
      throw new Error("Missing local Bee registry e2e configuration.");
    }

    const packageReference = await publishRegistryPackage();
    const releaseReference = await publishRegistryRelease();
    const readmeReference = await publishRegistryReadme();
    const tarballReference = await publishRegistryTarball();
    const manifestReference = await ensureRegistryFeedManifest();

    if (!store.indexReference) {
      throw new Error("Expected registry e2e store to have an index reference.");
    }

    return {
      schema: "truthmarket.swarm-kv.e2e-registry.v1",
      beeApiUrl,
      gatewayUrl,
      indexReference: store.indexReference,
      feedManifestReference: manifestReference,
      values: {
        package: jsonValue("registry:package", packageReference, packageMetadata),
        release: jsonValue("registry:release", releaseReference, releaseMetadata),
        readme: stringValue("registry:readme", readmeReference, readme),
        tarball: bytesValue("registry:tarball", tarballReference, tarballBytes, true)
      }
    };
  }

  async function ensureRegistryFeedManifest(): Promise<string> {
    if (feedManifestReference) {
      return feedManifestReference;
    }

    const manifest = await store.createFeedManifest("registry:index");
    feedManifestReference = manifest.manifestReference;

    logE2eStep("feed-manifest:done", {
      key: "registry:index",
      reference: manifest.manifestReference,
      topic: manifest.topic
    });

    return feedManifestReference;
  }

  async function publishRegistryPackage(): Promise<PutResult> {
    if (packagePut) {
      return packagePut;
    }

    packagePut = await traceE2ePut(
      {
        key: "registry:package",
        fileType: "registry package JSON",
        valueType: "json",
        bytes: byteLength(JSON.stringify(packageMetadata))
      },
      () => store.put("registry:package", packageMetadata)
    );

    const result = await store.get<typeof packageMetadata>("registry:package");

    logE2eRead(result, {
      key: "registry:package",
      fileType: "registry package JSON",
      expectedKind: "json"
    });
    expect(result?.value).toEqual(packageMetadata);

    return packagePut;
  }

  async function publishRegistryRelease(): Promise<PutResult> {
    if (releasePut) {
      return releasePut;
    }

    releasePut = await traceE2ePut(
      {
        key: "registry:release",
        fileType: "registry release JSON",
        valueType: "json",
        bytes: byteLength(JSON.stringify(releaseMetadata))
      },
      () => store.put("registry:release", releaseMetadata)
    );

    const result = await store.get<typeof releaseMetadata>("registry:release");

    logE2eRead(result, {
      key: "registry:release",
      fileType: "registry release JSON",
      expectedKind: "json"
    });
    expect(result?.value).toEqual(releaseMetadata);

    return releasePut;
  }

  async function publishRegistryReadme(): Promise<PutResult> {
    if (readmePut) {
      return readmePut;
    }

    readmePut = await traceE2ePut(
      {
        key: "registry:readme",
        fileType: "registry README markdown",
        valueType: "string",
        contentType: "text/markdown;charset=utf-8",
        bytes: byteLength(readme)
      },
      () =>
        store.put("registry:readme", readme, {
          contentType: "text/markdown;charset=utf-8"
        })
    );

    const result = await store.get<string>("registry:readme");

    logE2eRead(result, {
      key: "registry:readme",
      fileType: "registry README markdown",
      expectedContentType: "text/markdown;charset=utf-8",
      expectedKind: "string"
    });
    expect(result?.value).toBe(readme);

    return readmePut;
  }

  async function publishRegistryTarball(): Promise<PutResult> {
    if (tarballPut) {
      return tarballPut;
    }

    tarballPut = await traceE2ePut(
      {
        key: "registry:tarball",
        fileType: "registry tarball bytes",
        valueType: "Uint8Array",
        contentType: "application/octet-stream",
        bytes: tarballBytes.byteLength
      },
      () =>
        store.put("registry:tarball", tarballBytes, {
          contentType: "application/octet-stream"
        })
    );

    const result = await store.get<Uint8Array>("registry:tarball");

    logE2eRead(result, {
      key: "registry:tarball",
      fileType: "registry tarball bytes",
      expectedContentType: "application/octet-stream",
      expectedKind: "bytes"
    });
    expect(result?.bytes).toEqual(tarballBytes);

    return tarballPut;
  }
});

interface RegistryFixtureArtifact {
  schema: "truthmarket.swarm-kv.e2e-registry.v1";
  beeApiUrl: string;
  gatewayUrl: string;
  indexReference: string;
  feedManifestReference: string;
  values: {
    package: ReturnType<typeof jsonValue>;
    release: ReturnType<typeof jsonValue>;
    readme: ReturnType<typeof stringValue>;
    tarball: ReturnType<typeof bytesValue>;
  };
}

function jsonValue(key: string, put: PutResult, expected: unknown) {
  return {
    key,
    reference: put.reference,
    kind: "json" as const,
    expected
  };
}

function stringValue(key: string, put: PutResult, expected: string) {
  return {
    key,
    reference: put.reference,
    kind: "string" as const,
    expected
  };
}

function bytesValue(key: string, put: PutResult, bytes: Uint8Array, expectedMultiChunk: boolean) {
  return {
    key,
    reference: put.reference,
    kind: "bytes" as const,
    expectedLength: bytes.byteLength,
    expectedKeccak256: bytesToHex(keccak256(bytes)),
    expectedMultiChunk
  };
}
