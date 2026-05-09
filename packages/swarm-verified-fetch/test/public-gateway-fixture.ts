import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect } from "vitest";

import {
  bytesToHex,
  keccak256,
  type FeedIndexInput,
  type GatewayStrategy,
  type VerifiedFetchOptions
} from "../src/index.js";

export interface PublicGatewayFixture {
  schema: "truthmarket.swarm-verified-fetch.public-e2e.v1";
  gatewayUrls: string[];
  gatewayStrategy?: GatewayStrategy;
  immutable: PublicImmutableCase[];
  manifest: PublicManifestCase[];
  feed?: PublicFeedCase[];
}

export interface PublicCaseBase {
  name: string;
  contentType?: string;
  expectedByteLength?: number;
  expectedJson?: unknown;
  expectedKeccak256?: string;
  expectedText?: string;
  fileName?: string;
}

export interface PublicImmutableCase extends PublicCaseBase {
  reference: string;
}

export interface PublicManifestCase extends PublicCaseBase {
  manifestReference: string;
  path: string;
}

export interface PublicFeedCase extends PublicCaseBase {
  owner: string;
  topic: string;
  index: FeedIndexInput;
  updateReference: string;
  targetReference: string;
  timestamp?: number;
}

export const PUBLIC_GATEWAY_FIXTURE_ENV = "SWARM_PUBLIC_E2E_FIXTURE";
export const PUBLIC_GATEWAY_DEFAULT_FIXTURE_PATH = resolve("test/fixtures/public-gateway.fixture.json");
export const PUBLIC_GATEWAY_EXAMPLE_FIXTURE_PATH = "test/fixtures/public-gateway.example.json";

export async function loadConfiguredPublicGatewayFixture(): Promise<PublicGatewayFixture | null> {
  return loadPublicGatewayFixture(process.env[PUBLIC_GATEWAY_FIXTURE_ENV], PUBLIC_GATEWAY_DEFAULT_FIXTURE_PATH);
}

export function publicGatewayFixtureWarning(): string {
  return [
    "Public Swarm gateway e2e + MITM verification tests are not configured.",
    "Copy .env.e2e.example to .env.e2e to use the checked-in public testnet fixtures.",
    `Alternatively set ${PUBLIC_GATEWAY_FIXTURE_ENV}=<fixture-json-or-path>, or copy ${PUBLIC_GATEWAY_EXAMPLE_FIXTURE_PATH} to ${PUBLIC_GATEWAY_DEFAULT_FIXTURE_PATH}.`,
    "Without that fixture, default tests cannot verify real public gateway data."
  ].join(" ");
}

export function verifiedFetchOptions(
  fixture: PublicGatewayFixture,
  testCase: PublicCaseBase
): Omit<VerifiedFetchOptions, "responseType"> {
  const gatewayUrl = firstGatewayUrl(fixture);

  return {
    ...(testCase.contentType === undefined ? {} : { contentType: testCase.contentType }),
    ...(testCase.expectedKeccak256 === undefined ? {} : { expectedHash: normalizeHash(testCase.expectedKeccak256) }),
    ...(testCase.fileName === undefined ? {} : { fileName: testCase.fileName }),
    gatewayUrl,
    gateways: fixture.gatewayUrls,
    gatewayStrategy: fixture.gatewayStrategy ?? (fixture.gatewayUrls.length > 1 ? "race" : "failover"),
    retry: { attempts: 3, baseDelayMs: 250, maxDelayMs: 2_000 },
    timeoutMs: 30_000
  };
}

export function mitmVerifiedFetchOptions(
  fixture: PublicGatewayFixture,
  testCase: PublicCaseBase
): Omit<VerifiedFetchOptions, "fetch" | "responseType"> {
  const gatewayUrl = firstGatewayUrl(fixture);

  return {
    ...verifiedFetchOptions(fixture, testCase),
    gatewayUrl,
    gateways: [gatewayUrl],
    gatewayStrategy: "failover",
    retry: { attempts: 1 }
  };
}

export function assertPublicBytes(testCase: PublicCaseBase, bytes: Uint8Array): void {
  if (testCase.expectedByteLength !== undefined) {
    expect(bytes.byteLength, testCase.name).toBe(testCase.expectedByteLength);
  }

  if (testCase.expectedKeccak256 !== undefined) {
    expect(`0x${bytesToHex(keccak256(bytes))}`, testCase.name).toBe(normalizeHash(testCase.expectedKeccak256));
  }

  if (testCase.expectedText !== undefined) {
    expect(new TextDecoder().decode(bytes), testCase.name).toBe(testCase.expectedText);
  }

  if (testCase.expectedJson !== undefined) {
    expect(JSON.parse(new TextDecoder().decode(bytes)) as unknown, testCase.name).toEqual(testCase.expectedJson);
  }
}

export function normalizeMimeType(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? contentType;
}

async function loadPublicGatewayFixture(
  configuredFixture: string | undefined,
  fallbackPath: string
): Promise<PublicGatewayFixture | null> {
  if (configuredFixture?.trim().startsWith("{")) {
    return parsePublicFixture(configuredFixture);
  }

  const path = configuredFixture === undefined ? fallbackPath : resolve(configuredFixture);

  try {
    await access(path);
  } catch {
    return null;
  }

  return parsePublicFixture(await readFile(path, "utf8"));
}

function parsePublicFixture(raw: string): PublicGatewayFixture {
  const parsed = JSON.parse(raw) as Partial<PublicGatewayFixture>;

  if (parsed.schema !== "truthmarket.swarm-verified-fetch.public-e2e.v1") {
    throw new Error("Unsupported public gateway e2e fixture schema.");
  }

  if (!Array.isArray(parsed.gatewayUrls) || parsed.gatewayUrls.length === 0) {
    throw new Error("Public gateway e2e fixture must include at least one gateway URL.");
  }

  const immutable = parsed.immutable ?? [];
  const manifest = parsed.manifest ?? [];
  const feed = parsed.feed ?? [];

  if (immutable.length === 0) {
    throw new Error("Public gateway e2e fixture must include at least one immutable case.");
  }

  if (manifest.length === 0) {
    throw new Error("Public gateway e2e fixture must include at least one manifest case.");
  }

  if (!immutable.some((testCase) => (testCase.expectedByteLength ?? 0) > 4096)) {
    throw new Error("Public gateway e2e fixture must include at least one multi-chunk immutable case.");
  }

  return {
    schema: "truthmarket.swarm-verified-fetch.public-e2e.v1",
    ...(parsed.gatewayStrategy === undefined ? {} : { gatewayStrategy: parsed.gatewayStrategy }),
    ...(feed.length === 0 ? {} : { feed }),
    immutable,
    manifest,
    gatewayUrls: parsed.gatewayUrls.map((gatewayUrl) => new URL(gatewayUrl).toString().replace(/\/$/, ""))
  };
}

function firstGatewayUrl(fixture: PublicGatewayFixture): string {
  const gatewayUrl = fixture.gatewayUrls[0];

  if (gatewayUrl === undefined) {
    throw new Error("Public gateway e2e fixture must include at least one gateway URL.");
  }

  return gatewayUrl;
}

function normalizeHash(value: string): `0x${string}` {
  return (value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`) as `0x${string}`;
}
