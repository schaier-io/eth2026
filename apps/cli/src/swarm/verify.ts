import { readFile } from "node:fs/promises";
import { type Hex, type PublicClient } from "viem";
import {
  bytesToHex,
  keccak256,
  normalizeHex,
  verifiedFetch,
  type FetchLike,
} from "@truth-market/swarm-verified-fetch";
import { truthMarketAbi } from "../abi.js";
import type { ResolvedConfig } from "../config.js";
import { CliError } from "../errors.js";
import {
  type ClaimDocument,
  decodeSwarmReference,
  loadClaimDocument,
} from "./claim-doc.js";

const HEX_32_BYTES = /^[0-9a-f]{64}$/;

export async function readSwarmReference(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<Hex> {
  return (await client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "swarmReference",
  })) as Hex;
}

export interface ClaimRulesVerificationOptions {
  gatewayUrl?: string;
  fetch?: FetchLike;
}

export interface ClaimRulesVerificationResult {
  match: boolean;
  expected: Hex;
  computed: Hex;
  swarmReferenceHex: Hex;
  swarmReference: string;
  mode: "swarm-kv" | "raw-bytes";
  document?: ClaimDocument;
  chunksVerified: number;
  remoteContentHash: Hex;
  remoteMatchesDocument: boolean;
}

export async function verifyLocalDocument(
  expectedContentHash: Hex,
  documentPath: string,
): Promise<{ match: boolean; expected: Hex; computed: Hex }> {
  const buf = await readFile(documentPath);
  const computed = hashBytes(new Uint8Array(buf));
  const expected = normalizeHashHex(expectedContentHash);
  return {
    match: computed === expected,
    expected,
    computed,
  };
}

export async function verifyOnchainClaimRulesDocument(
  client: PublicClient,
  cfg: ResolvedConfig,
  documentPath: string,
  options: ClaimRulesVerificationOptions = {},
): Promise<ClaimRulesVerificationResult> {
  const swarmReferenceHex = await readSwarmReference(client, cfg);
  const documentBytes = new Uint8Array(await readFile(documentPath));
  const computed = hashBytes(documentBytes);
  const swarmReference = swarmReferenceFromBytes(swarmReferenceHex);
  const gatewayUrl = options.gatewayUrl ?? process.env.TM_SWARM_GATEWAY_URL;

  const kv = await loadClaimDocument(swarmReferenceHex, {
    ...(gatewayUrl ? { gatewayUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch as typeof fetch } : {}),
  });
  if (kv.verified && kv.document) {
    const remoteBytes = new TextEncoder().encode(JSON.stringify(kv.document));
    const remoteContentHash = hashBytes(remoteBytes);
    const remoteMatchesDocument =
      bytesEqual(remoteBytes, documentBytes) ||
      sameJson(documentBytes, kv.document);

    return {
      match: remoteMatchesDocument,
      expected: remoteContentHash,
      computed,
      swarmReferenceHex,
      swarmReference: decodeSwarmReference(swarmReferenceHex) ?? swarmReference,
      mode: "swarm-kv",
      document: kv.document,
      chunksVerified: 0,
      remoteContentHash,
      remoteMatchesDocument,
    };
  }

  const response = await verifiedFetch(swarmReference, {
    ...(gatewayUrl ? { gatewayUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const remoteContentHash = `0x${normalizeHex(response.contentHash)}` as Hex;
  const remoteMatchesDocument = bytesEqual(response.bytes, documentBytes);

  return {
    match: remoteMatchesDocument,
    expected: remoteContentHash,
    computed,
    swarmReferenceHex,
    swarmReference,
    mode: "raw-bytes",
    chunksVerified: response.chunksVerified,
    remoteContentHash,
    remoteMatchesDocument,
  };
}

export function swarmReferenceFromBytes(referenceBytes: Hex): string {
  const normalized = normalizeHex(stripHexPrefix(referenceBytes));
  if (!normalized) {
    throw new CliError("SWARM_REFERENCE_MISSING", "on-chain swarmReference is empty");
  }

  const bytes = hexToBytes(normalized);
  if (bytes.byteLength === 32) {
    return normalized;
  }

  const text = new TextDecoder().decode(bytes).replace(/\0+$/g, "").trim();
  if (HEX_32_BYTES.test(text.toLowerCase())) {
    return text.toLowerCase();
  }
  if (text.startsWith("bzz://")) {
    return text;
  }
  if (text.startsWith("swarm://")) {
    return `bzz://${text.slice("swarm://".length)}`;
  }

  throw new CliError(
    "UNSUPPORTED_SWARM_REFERENCE",
    "on-chain swarmReference must be a raw 32-byte Swarm reference, 64-hex reference text, or bzz:// reference",
  );
}

function hashBytes(bytes: Uint8Array): Hex {
  return `0x${bytesToHex(keccak256(bytes))}` as Hex;
}

function normalizeHashHex(value: Hex): Hex {
  const normalized = normalizeHex(stripHexPrefix(value));
  if (normalized.length !== 64) {
    throw new CliError("INVALID_CONTENT_HASH", "content hash must be a 32-byte hex value");
  }
  return `0x${normalized}` as Hex;
}

function stripHexPrefix(value: string): string {
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new CliError("INVALID_SWARM_REFERENCE", "on-chain swarmReference hex has odd length");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new CliError("INVALID_SWARM_REFERENCE", "on-chain swarmReference contains non-hex bytes");
    }
    bytes[i] = byte;
  }
  return bytes;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameJson(bytes: Uint8Array, remote: ClaimDocument): boolean {
  try {
    const local = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return stableJson(local) === stableJson(remote);
  } catch {
    return false;
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
