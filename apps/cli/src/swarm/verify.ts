import { readFile } from "node:fs/promises";
import {
  type Hex,
  type PublicClient,
} from "viem";
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

const HEX_32_BYTES = /^[0-9a-f]{64}$/;

export async function readIpfsHash(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<Hex> {
  return (await client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "ipfsHash",
  })) as Hex;
}

export async function readClaimRulesHash(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<Hex> {
  return (await client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "claimRulesHash",
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
  ipfsHashHex: Hex;
  swarmReference: string;
  chunksVerified: number;
  remoteContentHash: Hex;
  remoteMatchesDocument: boolean;
}

export async function verifyLocalDocument(
  expectedClaimRulesHash: Hex,
  documentPath: string,
): Promise<{ match: boolean; expected: Hex; computed: Hex }> {
  const buf = await readFile(documentPath);
  const computed = hashBytes(new Uint8Array(buf));
  const expected = normalizeHashHex(expectedClaimRulesHash);
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
  const [ipfsHashHex, claimRulesHash] = await Promise.all([
    readIpfsHash(client, cfg),
    readClaimRulesHash(client, cfg),
  ]);
  const expected = normalizeHashHex(claimRulesHash);
  const documentBytes = new Uint8Array(await readFile(documentPath));
  const computed = hashBytes(documentBytes);

  if (computed !== expected) {
    return {
      match: false,
      expected,
      computed,
      ipfsHashHex,
      swarmReference: "",
      chunksVerified: 0,
      remoteContentHash: "0x",
      remoteMatchesDocument: false,
    };
  }

  const swarmReference = swarmReferenceFromIpfsHash(ipfsHashHex);
  const gatewayUrl = options.gatewayUrl ?? process.env.TM_SWARM_GATEWAY_URL;
  const response = await verifiedFetch(swarmReference, {
    expectedHash: expected,
    ...(gatewayUrl ? { gatewayUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const remoteMatchesDocument = bytesEqual(response.bytes, documentBytes);

  return {
    match: remoteMatchesDocument,
    expected,
    computed,
    ipfsHashHex,
    swarmReference,
    chunksVerified: response.chunksVerified,
    remoteContentHash: `0x${normalizeHex(response.contentHash)}` as Hex,
    remoteMatchesDocument,
  };
}

export function swarmReferenceFromIpfsHash(ipfsHash: Hex): string {
  const normalized = normalizeHex(stripHexPrefix(ipfsHash));
  if (!normalized) {
    throw new CliError("SWARM_REFERENCE_MISSING", "on-chain ipfsHash is empty");
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
    "on-chain ipfsHash must be a raw 32-byte Swarm reference, 64-hex reference text, or bzz:// reference",
  );
}

function hashBytes(bytes: Uint8Array): Hex {
  return `0x${bytesToHex(keccak256(bytes))}` as Hex;
}

function normalizeHashHex(value: Hex): Hex {
  const normalized = normalizeHex(stripHexPrefix(value));
  if (normalized.length !== 64) {
    throw new CliError("INVALID_CLAIM_RULES_HASH", "claimRulesHash must be a 32-byte hex value");
  }
  return `0x${normalized}` as Hex;
}

function stripHexPrefix(value: string): string {
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new CliError("INVALID_SWARM_REFERENCE", "on-chain ipfsHash hex has odd length");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new CliError("INVALID_SWARM_REFERENCE", "on-chain ipfsHash contains non-hex bytes");
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
