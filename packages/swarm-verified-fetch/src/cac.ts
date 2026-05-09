import { concatBytes, lengthFromSpanBytes, spanBytesFromLength } from "./bytes.js";
import { bmtHash, SWARM_CHUNK_PAYLOAD_SIZE, SWARM_SPAN_SIZE } from "./bmt.js";
import { SwarmVerificationError } from "./errors.js";
import { bytesToHex, normalizeHex } from "./hex.js";

export interface CacVerificationResult {
  verified: boolean;
  expectedReference: string;
  computedReference: string;
  span: bigint;
  payloadLength: number;
}

export interface ContentAddressedChunk {
  bytes: Uint8Array;
  payload: Uint8Array;
  reference: string;
}

export function cacReference(spanBytes: Uint8Array, payload: Uint8Array): string {
  return bytesToHex(bmtHash(spanBytes, payload));
}

export function makeContentAddressedChunk(payload: Uint8Array, span = BigInt(payload.length)): ContentAddressedChunk {
  if (payload.length > SWARM_CHUNK_PAYLOAD_SIZE) {
    throw new SwarmVerificationError("A Swarm chunk payload cannot exceed 4096 bytes.");
  }

  const spanBytes = spanBytesFromLength(span);
  const bytes = concatBytes([spanBytes, payload]);

  return {
    bytes,
    payload,
    reference: cacReference(spanBytes, payload)
  };
}

export function verifyContentAddressedChunk(
  expectedReference: string,
  chunkBytes: Uint8Array
): CacVerificationResult {
  if (chunkBytes.length < SWARM_SPAN_SIZE) {
    throw new SwarmVerificationError("A Swarm chunk must include an 8-byte span.");
  }

  const normalizedExpectedReference = normalizeHex(expectedReference);
  const spanBytes = chunkBytes.slice(0, SWARM_SPAN_SIZE);
  const payload = chunkBytes.slice(SWARM_SPAN_SIZE);

  if (payload.length > SWARM_CHUNK_PAYLOAD_SIZE) {
    throw new SwarmVerificationError("A Swarm chunk payload cannot exceed 4096 bytes.");
  }

  const computedReference = cacReference(spanBytes, payload);

  return {
    verified: computedReference === normalizedExpectedReference,
    expectedReference: normalizedExpectedReference,
    computedReference,
    span: lengthFromSpanBytes(spanBytes),
    payloadLength: payload.length
  };
}
