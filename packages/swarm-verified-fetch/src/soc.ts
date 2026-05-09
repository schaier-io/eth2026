import { secp256k1 } from "@noble/curves/secp256k1.js";

import { cacReference, verifyContentAddressedChunk, type CacVerificationResult } from "./cac.js";
import { concatBytes, lengthFromSpanBytes, spanBytesFromLength } from "./bytes.js";
import { keccak256 } from "./crypto.js";
import { SwarmInputError, SwarmVerificationError } from "./errors.js";
import { bytesToHex, hexToBytes, normalizeHex } from "./hex.js";
import type { HexHash, SwarmReference } from "./fetch.js";

export const SOC_IDENTIFIER_SIZE = 32;
export const SOC_SIGNATURE_SIZE = 65;
export const SOC_SPAN_SIZE = 8;
export const SOC_OWNER_SIZE = 20;
export const SOC_HEADER_SIZE = SOC_IDENTIFIER_SIZE + SOC_SIGNATURE_SIZE;
export const SOC_MIN_CHUNK_SIZE = SOC_HEADER_SIZE + SOC_SPAN_SIZE;
export const FEED_INDEX_SIZE = 8;
export const FEED_REFERENCE_PAYLOAD_SIZE = 40;

export type HexInput = string | Uint8Array;
export type FeedIndexInput = number | bigint | string | Uint8Array;
export type FeedPayloadKind = "bytes" | "reference";

export interface VerifySingleOwnerChunkOptions {
  expectedIdentifier?: HexInput;
  expectedOwner?: HexInput;
  url?: string | undefined;
}

export interface SocVerificationResult {
  readonly verified: true;
  readonly reference: SwarmReference;
  readonly identifier: HexHash;
  readonly owner: `0x${string}`;
  readonly signature: `0x${string}`;
  readonly span: bigint;
  readonly payload: Uint8Array;
  readonly wrappedChunkBytes: Uint8Array;
  readonly wrappedChunkReference: SwarmReference;
  readonly wrappedChunkVerification: CacVerificationResult & {
    readonly verified: true;
    readonly mode: "cac";
  };
}

export interface VerifyFeedUpdateOptions extends VerifySingleOwnerChunkOptions {
  owner: HexInput;
  topic: HexInput;
  index: FeedIndexInput;
  payload?: FeedPayloadKind;
}

export interface FeedUpdateVerificationResult {
  readonly verified: true;
  readonly type: "sequence";
  readonly payloadKind: FeedPayloadKind;
  readonly owner: `0x${string}`;
  readonly topic: HexHash;
  readonly index: bigint;
  readonly identifier: HexHash;
  readonly reference: SwarmReference;
  readonly soc: SocVerificationResult;
  readonly timestamp?: number;
  readonly targetReference?: SwarmReference;
  readonly payload: Uint8Array;
}

export interface MakeSingleOwnerChunkOptions {
  owner?: HexInput;
}

const TEXT_ENCODER = new TextEncoder();
const ETHEREUM_SIGNED_32_PREFIX = TEXT_ENCODER.encode("\x19Ethereum Signed Message:\n32");
const UINT64_MAX = (1n << 64n) - 1n;

export function socAddress(identifier: HexInput, owner: HexInput): SwarmReference {
  const identifierBytes = normalizeFixedBytes(identifier, SOC_IDENTIFIER_SIZE, "SOC identifier");
  const ownerBytes = normalizeFixedBytes(owner, SOC_OWNER_SIZE, "SOC owner address");
  return bytesToHex(keccak256(concatBytes([identifierBytes, ownerBytes]))) as SwarmReference;
}

export function feedTopicFromString(topic: string): HexHash {
  return `0x${bytesToHex(keccak256(TEXT_ENCODER.encode(topic)))}` as HexHash;
}

export function feedIndexBytes(index: FeedIndexInput): Uint8Array {
  if (index instanceof Uint8Array) {
    return normalizeFixedBytes(index, FEED_INDEX_SIZE, "feed index");
  }

  const value = feedIndexToBigInt(index);
  const output = new Uint8Array(FEED_INDEX_SIZE);
  let remaining = value;

  for (let offset = FEED_INDEX_SIZE - 1; offset >= 0; offset -= 1) {
    output[offset] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return output;
}

export function feedIdentifier(topic: HexInput, index: FeedIndexInput): HexHash {
  const topicBytes = normalizeFeedTopic(topic);
  return `0x${bytesToHex(keccak256(concatBytes([topicBytes, feedIndexBytes(index)])))}` as HexHash;
}

export function feedUpdateReference(owner: HexInput, topic: HexInput, index: FeedIndexInput): SwarmReference {
  return socAddress(feedIdentifier(topic, index), owner);
}

export function verifySingleOwnerChunk(
  reference: string,
  bytes: Uint8Array,
  options: VerifySingleOwnerChunkOptions = {}
): SocVerificationResult {
  const normalizedReference = normalizeReference(reference);

  if (bytes.byteLength < SOC_MIN_CHUNK_SIZE) {
    throw new SwarmVerificationError("A Single Owner Chunk must include identifier, signature, and wrapped CAC bytes.", {
      reference: normalizedReference,
      url: options.url
    });
  }

  const identifierBytes = bytes.slice(0, SOC_IDENTIFIER_SIZE);
  const signature = bytes.slice(SOC_IDENTIFIER_SIZE, SOC_HEADER_SIZE);
  const wrappedChunkBytes = bytes.slice(SOC_HEADER_SIZE);
  const spanBytes = wrappedChunkBytes.slice(0, SOC_SPAN_SIZE);
  const payload = wrappedChunkBytes.slice(SOC_SPAN_SIZE);
  const wrappedChunkReference = cacReference(spanBytes, payload) as SwarmReference;
  const wrappedChunkVerification = verifyContentAddressedChunk(wrappedChunkReference, wrappedChunkBytes);

  if (!wrappedChunkVerification.verified) {
    throw new SwarmVerificationError("Wrapped SOC CAC verification failed.", {
      reference: normalizedReference,
      url: options.url
    });
  }

  const ownerBytes = recoverSocOwner(identifierBytes, wrappedChunkReference, signature, {
    reference: normalizedReference,
    url: options.url
  });
  const computedReference = socAddress(identifierBytes, ownerBytes);

  if (computedReference !== normalizedReference) {
    throw new SwarmVerificationError(
      `SOC address mismatch: expected ${normalizedReference}, computed ${computedReference}.`,
      {
        reference: normalizedReference,
        url: options.url
      }
    );
  }

  assertExpectedBytes(options.expectedIdentifier, identifierBytes, "SOC identifier", normalizedReference, options.url);
  assertExpectedBytes(options.expectedOwner, ownerBytes, "SOC owner", normalizedReference, options.url);

  return {
    verified: true,
    reference: normalizedReference,
    identifier: hexHash(identifierBytes),
    owner: `0x${bytesToHex(ownerBytes)}`,
    signature: `0x${bytesToHex(signature)}`,
    span: lengthFromSpanBytes(spanBytes),
    payload,
    wrappedChunkBytes,
    wrappedChunkReference,
    wrappedChunkVerification: {
      ...wrappedChunkVerification,
      verified: true,
      mode: "cac"
    }
  };
}

export function verifyFeedUpdate(
  reference: string,
  bytes: Uint8Array,
  options: VerifyFeedUpdateOptions
): FeedUpdateVerificationResult {
  const ownerBytes = normalizeFixedBytes(options.owner, SOC_OWNER_SIZE, "feed owner address");
  const topicBytes = normalizeFeedTopic(options.topic);
  const indexBytes = feedIndexBytes(options.index);
  const index = feedIndexToBigInt(indexBytes);
  const identifier = feedIdentifier(topicBytes, indexBytes);
  const expectedReference = feedUpdateReference(ownerBytes, topicBytes, indexBytes);
  const normalizedReference = normalizeReference(reference);

  if (normalizedReference !== expectedReference) {
    throw new SwarmVerificationError(
      `Feed update reference mismatch: expected ${expectedReference}, got ${normalizedReference}.`,
      {
        reference: normalizedReference,
        url: options.url
      }
    );
  }

  const soc = verifySingleOwnerChunk(normalizedReference, bytes, {
    expectedIdentifier: identifier,
    expectedOwner: ownerBytes,
    url: options.url
  });
  const payloadKind = options.payload ?? "reference";

  if (payloadKind === "reference") {
    if (soc.payload.byteLength < FEED_REFERENCE_PAYLOAD_SIZE) {
      throw new SwarmVerificationError(
        `Feed reference update payload must contain an 8-byte timestamp and 32-byte reference, got ${soc.payload.byteLength} bytes.`,
        {
          reference: normalizedReference,
          url: options.url
        }
      );
    }

    const timestamp = Number(readUint64BE(soc.payload.slice(0, FEED_INDEX_SIZE)));

    if (!Number.isSafeInteger(timestamp)) {
      throw new SwarmVerificationError("Feed update timestamp exceeds Number.MAX_SAFE_INTEGER.", {
        reference: normalizedReference,
        url: options.url
      });
    }

    return {
      verified: true,
      type: "sequence",
      payloadKind,
      owner: `0x${bytesToHex(ownerBytes)}`,
      topic: hexHash(topicBytes),
      index,
      identifier,
      reference: normalizedReference,
      soc,
      timestamp,
      targetReference: bytesToHex(soc.payload.slice(FEED_INDEX_SIZE, FEED_REFERENCE_PAYLOAD_SIZE)) as SwarmReference,
      payload: soc.payload.slice(0, FEED_REFERENCE_PAYLOAD_SIZE)
    };
  }

  return {
    verified: true,
    type: "sequence",
    payloadKind,
    owner: `0x${bytesToHex(ownerBytes)}`,
    topic: hexHash(topicBytes),
    index,
    identifier,
    reference: normalizedReference,
    soc,
    payload: soc.payload.slice(0, safeNumberFromSpan(soc.span, normalizedReference, options.url))
  };
}

export function makeSingleOwnerChunk(
  privateKey: HexInput,
  identifier: HexInput,
  payload: Uint8Array,
  span: number | bigint = BigInt(payload.byteLength),
  options: MakeSingleOwnerChunkOptions = {}
): {
  readonly bytes: Uint8Array;
  readonly reference: SwarmReference;
  readonly owner: `0x${string}`;
  readonly identifier: HexHash;
  readonly signature: `0x${string}`;
  readonly wrappedChunkReference: SwarmReference;
} {
  const privateKeyBytes = normalizeFixedBytes(privateKey, 32, "private key");
  const identifierBytes = normalizeFixedBytes(identifier, SOC_IDENTIFIER_SIZE, "SOC identifier");
  const spanBytes = spanBytesFromLength(span);
  const wrappedChunkReference = cacReference(spanBytes, payload) as SwarmReference;
  const owner = privateKeyToAddress(privateKeyBytes);

  if (options.owner !== undefined && bytesToHex(normalizeFixedBytes(options.owner, SOC_OWNER_SIZE, "SOC owner address")) !== bytesToHex(owner)) {
    throw new SwarmInputError("SOC owner does not match the provided private key.");
  }

  const signature = signSocDigest(privateKeyBytes, identifierBytes, wrappedChunkReference);
  const bytes = concatBytes([identifierBytes, signature, spanBytes, payload]);

  return {
    bytes,
    reference: socAddress(identifierBytes, owner),
    owner: `0x${bytesToHex(owner)}`,
    identifier: hexHash(identifierBytes),
    signature: `0x${bytesToHex(signature)}`,
    wrappedChunkReference
  };
}

export function makeFeedReferenceUpdateChunk(input: {
  privateKey: HexInput;
  owner?: HexInput;
  topic: HexInput;
  index: FeedIndexInput;
  targetReference: HexInput;
  timestamp?: number | bigint;
}): ReturnType<typeof makeSingleOwnerChunk> & {
  readonly topic: HexHash;
  readonly index: bigint;
  readonly targetReference: SwarmReference;
} {
  const topicBytes = normalizeFeedTopic(input.topic);
  const indexBytes = feedIndexBytes(input.index);
  const timestampBytes = uint64BE(input.timestamp ?? BigInt(Math.floor(Date.now() / 1000)));
  const targetReferenceBytes = normalizeFixedBytes(input.targetReference, 32, "feed target reference");
  const chunk = makeSingleOwnerChunk(
    input.privateKey,
    feedIdentifier(topicBytes, indexBytes),
    concatBytes([timestampBytes, targetReferenceBytes]),
    FEED_REFERENCE_PAYLOAD_SIZE,
    input.owner === undefined ? {} : { owner: input.owner }
  );

  return {
    ...chunk,
    topic: hexHash(topicBytes),
    index: feedIndexToBigInt(indexBytes),
    targetReference: bytesToHex(targetReferenceBytes) as SwarmReference
  };
}

export function normalizeFeedTopic(topic: HexInput): Uint8Array {
  if (topic instanceof Uint8Array) {
    return normalizeFixedBytes(topic, 32, "feed topic");
  }

  const raw = topic.startsWith("0x") ? topic.slice(2) : topic;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const normalized = normalizeHex(topic);
    return hexToBytes(normalized);
  }

  return hexToBytes(feedTopicFromString(topic));
}

function recoverSocOwner(
  identifier: Uint8Array,
  wrappedChunkReference: string,
  signature: Uint8Array,
  options: { reference: SwarmReference; url?: string | undefined }
): Uint8Array {
  if (signature.byteLength !== SOC_SIGNATURE_SIZE) {
    throw new SwarmVerificationError("SOC signatures must be 65 bytes.", {
      reference: options.reference,
      url: options.url
    });
  }

  const digest = keccak256(concatBytes([identifier, hexToBytes(wrappedChunkReference)]));
  const ethereumHash = ethereumPersonalHash32(digest);
  const recovery = recoveryId(signature[SOC_SIGNATURE_SIZE - 1]);

  try {
    const recoveredSignature = concatBytes([Uint8Array.of(recovery), signature.slice(0, 64)]);
    const publicKey = secp256k1.recoverPublicKey(recoveredSignature, ethereumHash, { prehash: false });
    return publicKeyToAddress(publicKey);
  } catch (error) {
    throw new SwarmVerificationError("SOC signature recovery failed.", {
      cause: error,
      reference: options.reference,
      url: options.url
    });
  }
}

function signSocDigest(privateKey: Uint8Array, identifier: Uint8Array, wrappedChunkReference: string): Uint8Array {
  const digest = keccak256(concatBytes([identifier, hexToBytes(wrappedChunkReference)]));
  const signature = secp256k1.sign(ethereumPersonalHash32(digest), privateKey, {
    format: "recovered",
    prehash: false
  });
  const output = new Uint8Array(SOC_SIGNATURE_SIZE);
  output.set(signature.slice(1), 0);
  output[SOC_SIGNATURE_SIZE - 1] = (signature[0] ?? 0) + 27;
  return output;
}

function ethereumPersonalHash32(digest: Uint8Array): Uint8Array {
  if (digest.byteLength !== 32) {
    throw new SwarmVerificationError("Ethereum personal SOC digests must be 32 bytes.");
  }

  return keccak256(concatBytes([ETHEREUM_SIGNED_32_PREFIX, digest]));
}

function publicKeyToAddress(publicKey: Uint8Array): Uint8Array {
  const uncompressed = publicKey.byteLength === 65 ? publicKey : secp256k1.Point.fromBytes(publicKey).toBytes(false);
  return keccak256(uncompressed.slice(1)).slice(12);
}

function privateKeyToAddress(privateKey: Uint8Array): Uint8Array {
  return publicKeyToAddress(secp256k1.getPublicKey(privateKey, false));
}

function recoveryId(value: number | undefined): number {
  if (value === undefined) {
    throw new SwarmVerificationError("SOC signature is missing a recovery id.");
  }

  if (value === 27 || value === 28) {
    return value - 27;
  }

  if (value >= 0 && value <= 3) {
    return value;
  }

  throw new SwarmVerificationError(`Invalid SOC signature recovery id ${value}.`);
}

function assertExpectedBytes(
  expected: HexInput | undefined,
  actual: Uint8Array,
  label: string,
  reference: SwarmReference,
  url: string | undefined
): void {
  if (expected === undefined) {
    return;
  }

  const expectedBytes = normalizeFixedBytes(expected, actual.byteLength, label);

  if (bytesToHex(expectedBytes) !== bytesToHex(actual)) {
    throw new SwarmVerificationError(`${label} mismatch.`, {
      reference,
      url
    });
  }
}

function normalizeFixedBytes(value: HexInput, expectedLength: number, label: string): Uint8Array {
  const bytes = value instanceof Uint8Array ? value : hexToBytes(value);

  if (bytes.byteLength !== expectedLength) {
    throw new SwarmInputError(`${label} must be ${expectedLength} bytes.`);
  }

  return bytes;
}

function normalizeReference(reference: string): SwarmReference {
  const normalized = normalizeHex(reference);

  if (normalized.length !== 64) {
    throw new SwarmInputError("Swarm references must be 32 bytes.", { reference: normalized });
  }

  return normalized as SwarmReference;
}

function hexHash(bytes: Uint8Array): HexHash {
  return `0x${bytesToHex(bytes)}` as HexHash;
}

function feedIndexToBigInt(index: FeedIndexInput): bigint {
  if (index instanceof Uint8Array) {
    return readUint64BE(normalizeFixedBytes(index, FEED_INDEX_SIZE, "feed index"));
  }

  if (typeof index === "number") {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new SwarmInputError("feed index numbers must be non-negative safe integers.");
    }

    return BigInt(index);
  }

  if (typeof index === "bigint") {
    assertUint64(index, "feed index");
    return index;
  }

  const trimmed = index.trim();

  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    return parseUint64(BigInt(trimmed), "feed index");
  }

  if (/^[0-9]+$/.test(trimmed)) {
    return parseUint64(BigInt(trimmed), "feed index");
  }

  const normalized = normalizeHex(trimmed);

  if (normalized.length === 16) {
    return readUint64BE(hexToBytes(normalized));
  }

  throw new SwarmInputError("feed index must be a uint64 number, decimal string, 0x hex string, or 8-byte hex string.");
}

function readUint64BE(bytes: Uint8Array): bigint {
  let value = 0n;

  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }

  return parseUint64(value, "uint64");
}

function uint64BE(value: number | bigint): Uint8Array {
  const bigintValue = typeof value === "number" ? BigInt(value) : value;
  assertUint64(bigintValue, "uint64");
  return feedIndexBytes(bigintValue);
}

function parseUint64(value: bigint, label: string): bigint {
  assertUint64(value, label);
  return value;
}

function assertUint64(value: bigint, label: string): void {
  if (value < 0n || value > UINT64_MAX) {
    throw new SwarmInputError(`${label} must fit in uint64.`);
  }
}

function safeNumberFromSpan(span: bigint, reference: SwarmReference, url: string | undefined): number {
  if (span > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SwarmVerificationError(`SOC wrapped span ${span.toString()} exceeds Number.MAX_SAFE_INTEGER.`, {
      reference,
      url
    });
  }

  return Number(span);
}
