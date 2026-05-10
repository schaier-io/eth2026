import "server-only";

import { createSwarmKvStore, fixedPostage, type JsonValue } from "@truth-market/swarm-kv";
import { hexToBytes, isHex, toHex, type Hex } from "viem";

export const CLAIM_DOCUMENT_SCHEMA = "truthmarket.claim.v1";
export const CLAIM_DOCUMENT_NAMESPACE = "truthmarket:claim:v1";
export const PUBLIC_SWARM_PUBLISH_URL = "https://api.gateway.testnet.ethswarm.org";
export const PUBLIC_SWARM_DUMMY_POSTAGE_BATCH_ID = "0000000000000000000000000000000000000000000000000000000000000000";
export const DEFAULT_SWARM_GATEWAY_URL = PUBLIC_SWARM_PUBLISH_URL;
const DEFAULT_SWARM_IO_TIMEOUT_MS = 30_000;

export interface ClaimDocument {
  schema: typeof CLAIM_DOCUMENT_SCHEMA;
  title: string;
  context: string;
  tags: string[];
  createdAt: string;
}

export interface LoadedClaimDocument {
  document: ClaimDocument | null;
  reference: string | null;
  gatewayUrl: string;
  url: string | null;
  verified: boolean;
  error?: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function getSwarmGatewayUrl(): string {
  return (
    process.env.SWARM_GATEWAY_URL ||
    process.env.SWARM_KV_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_SWARM_GATEWAY_URL ||
    DEFAULT_SWARM_GATEWAY_URL
  ).replace(/\/$/, "");
}

function getSwarmBeeApiUrl(): string {
  return (process.env.SWARM_BEE_API_URL || process.env.BEE_API_URL || PUBLIC_SWARM_PUBLISH_URL).replace(/\/$/, "");
}

function getSwarmPostageBatchId(beeApiUrl: string): string | undefined {
  return (
    process.env.SWARM_POSTAGE_BATCH_ID ||
    process.env.BEE_POSTAGE_BATCH_ID ||
    (beeApiUrl === PUBLIC_SWARM_PUBLISH_URL ? PUBLIC_SWARM_DUMMY_POSTAGE_BATCH_ID : undefined)
  );
}

function getSwarmTimeoutMs(): number {
  const raw = process.env.SWARM_TIMEOUT_MS || process.env.SWARM_WRITE_TIMEOUT_MS;
  if (!raw) return DEFAULT_SWARM_IO_TIMEOUT_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SWARM_IO_TIMEOUT_MS;
}

export function encodeSwarmReference(reference: string): Hex {
  return toHex(textEncoder.encode(normalizeBzzReference(reference)));
}

export function decodeSwarmReference(referenceBytes: Hex | string | undefined): string | null {
  if (!referenceBytes || !isHex(referenceBytes)) return null;
  const bytes = hexToBytes(referenceBytes);
  if (bytes.length === 0) return null;

  const text = textDecoder.decode(bytes).trim();
  if (text && /^[\x20-\x7E]+$/.test(text)) return normalizeBzzReference(text);

  if (bytes.length === 32) return `bzz://${toHex(bytes).slice(2)}`;
  return null;
}

export function referenceToRoot(reference: string | null): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("bzz://") || trimmed.startsWith("swarm://")) {
    return new URL(trimmed).hostname.toLowerCase();
  }
  if (isHex(trimmed) && hexToBytes(trimmed).length === 32) return trimmed.slice(2).toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function referenceUrl(reference: string | null, gatewayUrl = getSwarmGatewayUrl()): string | null {
  const root = referenceToRoot(reference);
  return root ? `${gatewayUrl.replace(/\/$/, "")}/bzz/${root}/` : null;
}

export async function storeClaimDocument(input: {
  title: string;
  context: string;
  tags?: string[];
}): Promise<{ document: ClaimDocument; reference: string; referenceBytes: Hex; url: string }> {
  const beeApiUrl = getSwarmBeeApiUrl();
  const postageBatchId = getSwarmPostageBatchId(beeApiUrl);
  const gatewayUrl = getSwarmGatewayUrl();
  const timeoutMs = getSwarmTimeoutMs();

  if (!postageBatchId) {
    throw new Error(
      "Missing SWARM_POSTAGE_BATCH_ID or BEE_POSTAGE_BATCH_ID. Leave SWARM_BEE_API_URL unset to use the public testnet publish gateway, or set a local Bee postage batch.",
    );
  }

  const document: ClaimDocument = {
    schema: CLAIM_DOCUMENT_SCHEMA,
    title: input.title,
    context: input.context,
    tags: input.tags ?? [],
    createdAt: new Date().toISOString(),
  };

  const store = createSwarmKvStore({
    beeApiUrl,
    gatewayUrl,
    postage: fixedPostage(postageBatchId),
    privateByDefault: false,
    timeoutMs,
    namespace: CLAIM_DOCUMENT_NAMESPACE,
  });

  await store.put("claim", document as unknown as JsonValue, { timeoutMs });
  await store.put("title", document.title, { timeoutMs });

  if (!store.indexReference) throw new Error("Swarm KV write completed without an index reference.");

  const reference = `bzz://${store.indexReference}`;
  return {
    document,
    reference,
    referenceBytes: encodeSwarmReference(reference),
    url: referenceUrl(reference, gatewayUrl) ?? reference,
  };
}

export async function loadClaimDocument(referenceBytes: Hex | string | undefined): Promise<LoadedClaimDocument> {
  const gatewayUrl = getSwarmGatewayUrl();
  const timeoutMs = getSwarmTimeoutMs();
  const reference = decodeSwarmReference(referenceBytes);
  const rootReference = referenceToRoot(reference);
  const url = referenceUrl(reference, gatewayUrl);

  if (!rootReference) {
    return { document: null, reference, gatewayUrl, url, verified: false, error: "Missing or invalid Swarm reference." };
  }

  try {
    const store = createSwarmKvStore({
      gatewayUrl,
      rootReference,
      privateByDefault: false,
      timeoutMs,
      namespace: CLAIM_DOCUMENT_NAMESPACE,
    });
    const document = await store.getJson<ClaimDocument>("claim", { timeoutMs });
    if (isClaimDocument(document)) {
      return { document, reference, gatewayUrl, url, verified: true };
    }

    const title = await store.getString("title", { timeoutMs });
    if (title) {
      return {
        document: { schema: CLAIM_DOCUMENT_SCHEMA, title, context: "", tags: [], createdAt: "" },
        reference,
        gatewayUrl,
        url,
        verified: true,
      };
    }

    return { document: null, reference, gatewayUrl, url, verified: false, error: "Claim document is missing." };
  } catch (err) {
    return {
      document: null,
      reference,
      gatewayUrl,
      url,
      verified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normalizeBzzReference(reference: string): string {
  const trimmed = reference.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return `bzz://${trimmed.toLowerCase()}`;
  if (isHex(trimmed) && hexToBytes(trimmed).length === 32) return `bzz://${trimmed.slice(2).toLowerCase()}`;
  return trimmed;
}

function isClaimDocument(value: unknown): value is ClaimDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<ClaimDocument>;
  return (
    doc.schema === CLAIM_DOCUMENT_SCHEMA &&
    typeof doc.title === "string" &&
    typeof doc.context === "string" &&
    Array.isArray(doc.tags)
  );
}
