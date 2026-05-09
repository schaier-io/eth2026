import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSwarmKvStore, type SwarmKvStore } from "../src/index.js";
import { byteLength, logE2eRead, logE2eStep, logE2eTestStart, traceE2ePut } from "./e2e-log.js";
import { patternedBytes } from "./fake-bee.js";
import { FILE_TYPE_CASES, assertFileTypeRoundTrip } from "./file-type-fixtures.js";
import { resolveLiveSwarmE2eConfig } from "./live-e2e-config.js";
import { logPublicGatewayFallback, waitForUsablePostageBatch, warnSkippedLiveBeeE2e } from "./live-bee.js";

const liveConfig = resolveLiveSwarmE2eConfig();
const beeApiUrl = liveConfig.beeApiUrl;
const gatewayUrl = liveConfig.gatewayUrl;
const postageBatchId = liveConfig.postageBatchId;

warnSkippedLiveBeeE2e("local Bee e2e Swarm KV", liveConfig.missingConfig);

if (liveConfig.usingPublicGatewayFallback && beeApiUrl) {
  logPublicGatewayFallback("local Bee e2e Swarm KV", beeApiUrl);
}

describe.skipIf(!liveConfig.hasConfig)("local Bee e2e Swarm KV", () => {
  beforeEach((context) => {
    logE2eTestStart(context.task.name);
  });

  beforeAll(async () => {
    if (!beeApiUrl || !postageBatchId) {
      throw new Error("Missing local Bee e2e configuration.");
    }

    if (liveConfig.shouldCheckPostageBatch) {
      await waitForUsablePostageBatch(beeApiUrl, postageBatchId);
    }
  });

  it("publishes and verifies strings, JSON, binary values, large values, and a feed manifest", async () => {
    const store = createLiveStore("values");
    const large = patternedBytes(4096 * 3 + 777);

    await traceE2ePut(
      { key: "profile:name", valueType: "string", bytes: byteLength("Ada Lovelace") },
      () => store.put("profile:name", "Ada Lovelace")
    );
    await traceE2ePut(
      { key: "settings", valueType: "json", bytes: byteLength(JSON.stringify({ theme: "dark", compact: true })) },
      () => store.put("settings", { theme: "dark", compact: true })
    );
    await traceE2ePut(
      { key: "avatar", valueType: "Uint8Array", bytes: 6 },
      () => store.put("avatar", new Uint8Array([0, 1, 2, 253, 254, 255]))
    );
    await traceE2ePut(
      { key: "large", valueType: "Uint8Array", bytes: large.byteLength },
      () => store.put("large", large)
    );

    const name = await store.get("profile:name");
    const settings = await store.get("settings");
    const avatar = await store.get("avatar");
    const largeResult = await store.get("large");

    logE2eRead(name, { key: "profile:name", expectedKind: "string" });
    logE2eRead(settings, { key: "settings", expectedKind: "json" });
    logE2eRead(avatar, { key: "avatar", expectedKind: "bytes" });
    logE2eRead(largeResult, { key: "large", expectedKind: "bytes" });

    expect(name?.value).toBe("Ada Lovelace");
    expect(settings?.value).toEqual({ theme: "dark", compact: true });
    expect(avatar?.bytes).toEqual(new Uint8Array([0, 1, 2, 253, 254, 255]));
    expect(largeResult?.bytes).toEqual(large);

    const manifest = await store.createFeedManifest("settings");

    logE2eStep("feed-manifest:done", {
      key: "settings",
      reference: manifest.manifestReference,
      topic: manifest.topic
    });

    expect(manifest.manifestReference).toHaveLength(64);
  }, 240_000);

  describe("file content types", () => {
    for (const fileCase of FILE_TYPE_CASES) {
      it(`publishes and verifies ${fileCase.name}`, async () => {
        const store = createLiveStore(`file-${slug(fileCase.name)}`);

        await assertFileTypeRoundTrip(store, fileCase);
      }, 240_000);
    }
  });
});

function createLiveStore(namespaceSuffix: string): SwarmKvStore {
  if (!beeApiUrl || !gatewayUrl || !postageBatchId) {
    throw new Error("Missing local Bee e2e configuration.");
  }

  return createSwarmKvStore({
    gatewayUrl,
    beeApiUrl,
    postageBatchId,
    owner: `0x${"1".repeat(40)}`,
    privateByDefault: false,
    maxVerifiedChunks: 4096,
    namespace: `truthmarket:swarm-kv:e2e:${namespaceSuffix}`
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
