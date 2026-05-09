import { SwarmInputError, SwarmVerificationError } from "./errors.js";
import { bytesToHex, hexToBytes } from "./hex.js";

const MANTARAY_VERSION_02_HASH = hexToBytes("5768b3b6a7db56d21d1abff40d41cebfc83448fed8d7e9b06ec0d3b073f28f7b");
const MANTARAY_VERSION_PREFIX_LENGTH = 31;
const MANTARAY_FORK_PREFIX_LIMIT = 30;
const MANTARAY_MAX_RESOLUTION_STEPS = 1024;
const ZERO_REFERENCE = "0000000000000000000000000000000000000000000000000000000000000000";

export interface MantarayFork {
  readonly metadata: Record<string, string> | null;
  readonly prefix: Uint8Array;
  readonly selfAddress: string;
}

export interface MantarayNode {
  readonly forks: Map<number, MantarayFork>;
  readonly metadata: Record<string, string> | null;
  readonly path: Uint8Array;
  readonly selfAddress: string;
  readonly targetAddress: string;
}

export interface ResolvedMantarayPath {
  readonly manifestReference: string;
  readonly metadata: Record<string, string> | null;
  readonly path: string;
  readonly targetReference: string;
}

export function parseMantarayNode(data: Uint8Array, selfAddress: string): MantarayNode {
  if (data.byteLength < 65) {
    throw new SwarmVerificationError("Mantaray manifest node is too short.");
  }

  const obfuscationKey = data.slice(0, 32);
  const decrypted = xorCypher(data.slice(32), obfuscationKey);
  const reader = new ByteReader(decrypted);
  const version = reader.read(MANTARAY_VERSION_PREFIX_LENGTH);

  if (!bytesEqual(version, MANTARAY_VERSION_02_HASH.slice(0, MANTARAY_VERSION_PREFIX_LENGTH))) {
    throw new SwarmVerificationError("Mantaray manifest version hash is not supported.");
  }

  const targetAddressLength = reader.readUint8();

  if (targetAddressLength !== 0 && targetAddressLength !== 32) {
    throw new SwarmVerificationError(`Mantaray target reference length ${targetAddressLength} is not supported.`);
  }

  const targetAddress = targetAddressLength === 0 ? ZERO_REFERENCE : bytesToHex(reader.read(targetAddressLength));
  const forkBitmap = reader.read(32);
  const forks = new Map<number, MantarayFork>();

  for (let index = 0; index < 256; index += 1) {
    if (getBitLE(forkBitmap, index)) {
      const fork = parseFork(reader, 32);
      forks.set(index, fork);
    }
  }

  return {
    forks,
    metadata: null,
    path: new Uint8Array(0),
    selfAddress,
    targetAddress
  };
}

export async function resolveMantarayPath(
  root: MantarayNode,
  path: string,
  loadNode: (reference: string) => Promise<MantarayNode>
): Promise<ResolvedMantarayPath> {
  const normalizedPath = normalizeManifestPath(path);
  const pathBytes = new TextEncoder().encode(normalizedPath);
  const resolved = await findMantarayNode(root, pathBytes, loadNode, {
    stepsRemaining: MANTARAY_MAX_RESOLUTION_STEPS,
    visited: new Set([root.selfAddress])
  });

  if (!resolved || isZeroReference(resolved.node.targetAddress)) {
    throw new SwarmInputError(`Verified Mantaray manifest does not contain "${normalizedPath}".`, {
      reference: root.selfAddress
    });
  }

  return {
    manifestReference: root.selfAddress,
    metadata: resolved.node.metadata,
    path: normalizedPath,
    targetReference: resolved.node.targetAddress
  };
}

export function isZeroReference(reference: string): boolean {
  return reference === ZERO_REFERENCE;
}

export function normalizeManifestPath(path: string): string {
  const decoded = safeDecodeURIComponent(path);
  return decoded.replace(/^\/+/, "");
}

async function findMantarayNode(
  node: MantarayNode,
  path: Uint8Array,
  loadNode: (reference: string) => Promise<MantarayNode>,
  guard: MantarayResolutionGuard
): Promise<{ node: MantarayNode; matched: Uint8Array } | null> {
  if (path.length === 0) {
    return {
      node,
      matched: new Uint8Array(0)
    };
  }

  const fork = node.forks.get(path[0] ?? -1);

  if (!fork || !startsWithBytes(path, fork.prefix)) {
    return null;
  }

  if (fork.prefix.byteLength === 0) {
    throw new SwarmVerificationError("Mantaray manifest resolution encountered a zero-length fork prefix.");
  }

  if (guard.stepsRemaining <= 0) {
    throw new SwarmVerificationError("Mantaray manifest resolution exceeded the maximum traversal depth.");
  }

  if (guard.visited.has(fork.selfAddress)) {
    throw new SwarmVerificationError("Mantaray manifest resolution encountered a cycle.");
  }

  const child = await loadNode(fork.selfAddress);
  const childWithForkData: MantarayNode = {
    forks: child.forks,
    metadata: fork.metadata,
    path: fork.prefix,
    selfAddress: fork.selfAddress,
    targetAddress: child.targetAddress
  };
  const remaining = path.slice(fork.prefix.length);
  const nextVisited = new Set(guard.visited);
  nextVisited.add(fork.selfAddress);
  const resolved = await findMantarayNode(childWithForkData, remaining, loadNode, {
    stepsRemaining: guard.stepsRemaining - 1,
    visited: nextVisited
  });

  if (!resolved) {
    return null;
  }

  return {
    node: resolved.node,
    matched: concatBytes(fork.prefix, resolved.matched)
  };
}

interface MantarayResolutionGuard {
  stepsRemaining: number;
  visited: Set<string>;
}

function parseFork(reader: ByteReader, addressLength: number): MantarayFork {
  const type = reader.readUint8();
  const prefixLength = reader.readUint8();

  if (prefixLength > MANTARAY_FORK_PREFIX_LIMIT) {
    throw new SwarmVerificationError(`Mantaray fork prefix length ${prefixLength} is not supported.`);
  }

  if (prefixLength === 0) {
    throw new SwarmVerificationError("Mantaray fork prefix length must be greater than zero.");
  }

  const prefix = reader.read(prefixLength);

  if (prefixLength < MANTARAY_FORK_PREFIX_LIMIT) {
    reader.read(MANTARAY_FORK_PREFIX_LIMIT - prefixLength);
  }

  const selfAddress = bytesToHex(reader.read(addressLength));
  const hasMetadata = (type & 16) === 16;
  let metadata: Record<string, string> | null = null;

  if (hasMetadata) {
    const metadataLength = reader.readUint16BE();
    const metadataBytes = reader.read(metadataLength);
    const parsed = JSON.parse(new TextDecoder().decode(metadataBytes)) as unknown;

    if (!isStringRecord(parsed)) {
      throw new SwarmVerificationError("Mantaray metadata must be a string record.");
    }

    metadata = parsed;
  }

  return {
    metadata,
    prefix,
    selfAddress
  };
}

class ByteReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  read(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.bytes.byteLength) {
      throw new SwarmVerificationError("Mantaray manifest node ended unexpectedly.");
    }

    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readUint8(): number {
    return this.read(1)[0] ?? 0;
  }

  readUint16BE(): number {
    const bytes = this.read(2);
    return ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  }
}

function xorCypher(bytes: Uint8Array, key: Uint8Array): Uint8Array {
  const output = new Uint8Array(bytes.byteLength);

  for (let index = 0; index < bytes.byteLength; index += 1) {
    output[index] = (bytes[index] ?? 0) ^ (key[index % key.byteLength] ?? 0);
  }

  return output;
}

function getBitLE(bytes: Uint8Array, index: number): boolean {
  const byte = bytes[Math.floor(index / 8)] ?? 0;
  return ((byte >> (index % 8)) & 1) === 1;
}

function startsWithBytes(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (prefix.byteLength > bytes.byteLength) {
    return false;
  }

  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (bytes[index] !== prefix[index]) {
      return false;
    }
  }

  return true;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const output = new Uint8Array(left.byteLength + right.byteLength);
  output.set(left, 0);
  output.set(right, left.byteLength);
  return output;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    throw new SwarmInputError("Manifest path is not valid URI-encoded text.", {
      cause: error
    });
  }
}
