import {
  concatBytes,
  hexToBytes,
  makeContentAddressedChunk,
  type ContentAddressedChunk,
  type FetchLike
} from "../src/index.js";

export const TEST_CHUNK_PAYLOAD_SIZE = 4096;
export const TEST_BRANCHING_FACTOR = 128;

export interface BuiltSwarmTree {
  reference: string;
  bytes: Uint8Array;
  chunks: Map<string, Uint8Array>;
  leafReferences: string[];
}

export interface MockChunkGateway {
  fetch: FetchLike;
  chunks: Map<string, Uint8Array>;
  requests: Array<{ method: string; path: string; url: string }>;
  getChunk(reference: string): Uint8Array | undefined;
  setChunk(reference: string, bytes: Uint8Array): void;
  removeChunk(reference: string): void;
  mutateChunk(reference: string, mutator: (bytes: Uint8Array) => Uint8Array): void;
}

export function buildSwarmTree(bytes: Uint8Array): BuiltSwarmTree {
  const chunks = new Map<string, Uint8Array>();
  const leafReferences: string[] = [];
  const root = buildNode(bytes, chunks, leafReferences);

  return {
    reference: root.reference,
    bytes: copyBytes(bytes),
    chunks,
    leafReferences
  };
}

export function createMockChunkGateway(initialChunks?: Map<string, Uint8Array>): MockChunkGateway {
  const chunks = new Map<string, Uint8Array>();
  const requests: Array<{ method: string; path: string; url: string }> = [];

  for (const [reference, bytes] of initialChunks ?? []) {
    chunks.set(reference, copyBytes(bytes));
  }

  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    requests.push({ method, path: url.pathname, url: input });

    if (url.pathname.startsWith("/chunks/") && method === "GET") {
      const reference = url.pathname.slice("/chunks/".length);
      const chunk = chunks.get(reference);

      if (!chunk) {
        return textResponse("missing chunk", 404, "Not Found");
      }

      return bytesResponse(chunk);
    }

    return textResponse(`unhandled ${method} ${url.pathname}`, 500, "Unhandled");
  };

  return {
    fetch,
    chunks,
    requests,
    getChunk(reference) {
      const chunk = chunks.get(reference);
      return chunk ? copyBytes(chunk) : undefined;
    },
    setChunk(reference, bytes) {
      chunks.set(reference, copyBytes(bytes));
    },
    removeChunk(reference) {
      chunks.delete(reference);
    },
    mutateChunk(reference, mutator) {
      const existing = chunks.get(reference);

      if (!existing) {
        throw new Error(`Unknown test chunk ${reference}`);
      }

      chunks.set(reference, mutator(copyBytes(existing)));
    }
  };
}

export function patternedBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    bytes[index] = (index * 31 + 17) % 256;
  }

  return bytes;
}

export function mutateLastByte(bytes: Uint8Array): Uint8Array {
  const mutated = copyBytes(bytes);
  const lastIndex = mutated.byteLength - 1;

  if (lastIndex >= 0) {
    mutated[lastIndex] = ((mutated[lastIndex] ?? 0) ^ 0xff) & 0xff;
  }

  return mutated;
}

export function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

export async function readByteStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const next = await reader.read();

    if (next.done) {
      break;
    }

    parts.push(next.value);
    total += next.value.byteLength;
  }

  const output = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function buildNode(
  bytes: Uint8Array,
  chunks: Map<string, Uint8Array>,
  leafReferences: string[]
): { reference: string; span: bigint } {
  if (bytes.byteLength <= TEST_CHUNK_PAYLOAD_SIZE) {
    const chunk = storeChunk(makeContentAddressedChunk(bytes, BigInt(bytes.byteLength)), chunks);
    leafReferences.push(chunk.reference);
    return { reference: chunk.reference, span: BigInt(bytes.byteLength) };
  }

  let nodes: Array<{ reference: string; span: bigint }> = [];

  for (let offset = 0; offset < bytes.byteLength; offset += TEST_CHUNK_PAYLOAD_SIZE) {
    nodes.push(buildNode(bytes.slice(offset, offset + TEST_CHUNK_PAYLOAD_SIZE), chunks, leafReferences));
  }

  while (nodes.length > 1) {
    const next: Array<{ reference: string; span: bigint }> = [];

    for (let offset = 0; offset < nodes.length; offset += TEST_BRANCHING_FACTOR) {
      const group = nodes.slice(offset, offset + TEST_BRANCHING_FACTOR);
      const childReferences = group.map((node) => hexToBytes(node.reference));
      const span = group.reduce((total, node) => total + node.span, 0n);
      const chunk = storeChunk(makeContentAddressedChunk(concatBytes(childReferences), span), chunks);
      next.push({ reference: chunk.reference, span });
    }

    nodes = next;
  }

  const root = nodes[0];

  if (!root) {
    throw new Error("Unable to build Swarm test tree.");
  }

  return root;
}

function storeChunk(chunk: ContentAddressedChunk, chunks: Map<string, Uint8Array>): ContentAddressedChunk {
  chunks.set(chunk.reference, copyBytes(chunk.bytes));
  return chunk;
}

export function bytesResponse(bytes: Uint8Array) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async arrayBuffer() {
      return copyArrayBuffer(bytes);
    }
  };
}

export function textResponse(value: string, status = 200, statusText = "OK") {
  const bytes = new TextEncoder().encode(value);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async arrayBuffer() {
      return copyArrayBuffer(bytes);
    },
    async text() {
      return value;
    }
  };
}

export function buildMantarayManifest(
  path: string,
  targetReference: string,
  metadata: Record<string, string>
): { reference: string; chunks: Map<string, Uint8Array> } {
  const encodedPath = new TextEncoder().encode(path);
  const parts: Uint8Array[] = [];

  for (let offset = 0; offset < encodedPath.byteLength; offset += 30) {
    parts.push(encodedPath.slice(offset, offset + 30));
  }

  if (parts.length === 0) {
    throw new Error("Test manifest paths cannot be empty.");
  }

  let child = buildSwarmTree(marshalMantarayNode(targetReference, []));
  const chunks = new Map(child.chunks);

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];

    if (!part) {
      throw new Error("Missing test manifest path part.");
    }

    const node = buildSwarmTree(
      marshalMantarayNode("0000000000000000000000000000000000000000000000000000000000000000", [
        {
          metadata: index === parts.length - 1 ? metadata : null,
          prefix: part,
          reference: child.reference,
          type: index === parts.length - 1 ? 18 : 4
        }
      ])
    );

    for (const [reference, bytes] of node.chunks) {
      chunks.set(reference, bytes);
    }

    child = node;
  }

  return {
    reference: child.reference,
    chunks
  };
}

function marshalMantarayNode(
  targetReference: string,
  forks: Array<{ metadata: Record<string, string> | null; prefix: Uint8Array; reference: string; type: number }>
): Uint8Array {
  const obfuscationKey = new Uint8Array(32);
  const version = hexToBytes("5768b3b6a7db56d21d1abff40d41cebfc83448fed8d7e9b06ec0d3b073f28f7b");
  const target = hexToBytes(targetReference);
  const hasTarget = target.some((byte) => byte !== 0);
  const header = new Uint8Array(32);
  header.set(version);
  header[31] = hasTarget ? 32 : 0;
  const forkBitmap = new Uint8Array(32);
  const sortedForks = [...forks].sort((left, right) => (left.prefix[0] ?? 0) - (right.prefix[0] ?? 0));

  for (const fork of sortedForks) {
    const first = fork.prefix[0];

    if (first === undefined) {
      throw new Error("Test manifest fork prefixes cannot be empty.");
    }

    forkBitmap[Math.floor(first / 8)] = (forkBitmap[Math.floor(first / 8)] ?? 0) | (1 << (first % 8));
  }

  return concatBytes([
    obfuscationKey,
    header,
    hasTarget ? target : new Uint8Array(0),
    forkBitmap,
    ...sortedForks.map(marshalMantarayFork)
  ]);
}

function marshalMantarayFork(fork: {
  metadata: Record<string, string> | null;
  prefix: Uint8Array;
  reference: string;
  type: number;
}): Uint8Array {
  const paddedPrefix = new Uint8Array(30);
  paddedPrefix.set(fork.prefix);
  const base = [
    new Uint8Array([fork.type, fork.prefix.byteLength]),
    paddedPrefix,
    hexToBytes(fork.reference)
  ];

  if (!fork.metadata) {
    return concatBytes(base);
  }

  const json = new TextEncoder().encode(JSON.stringify(fork.metadata));
  const metadataLength = 2 + json.byteLength;
  const paddedMetadataLength = Math.ceil(metadataLength / 32) * 32;
  const metadata = new Uint8Array(paddedMetadataLength);
  metadata.fill(0x0a);
  metadata[0] = ((paddedMetadataLength - 2) >> 8) & 0xff;
  metadata[1] = (paddedMetadataLength - 2) & 0xff;
  metadata.set(json, 2);
  return concatBytes([...base, metadata]);
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
