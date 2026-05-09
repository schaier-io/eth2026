import {
  concatBytes,
  hexToBytes,
  makeContentAddressedChunk,
  type ContentAddressedChunk
} from "@truth-market/swarm-verified-fetch";

import type { FetchLike, FetchOptions, FetchResponseLike } from "../src/index.js";

export const TEST_CHUNK_PAYLOAD_SIZE = 4096;
export const TEST_BRANCHING_FACTOR = 128;

export interface FakeBeeUpload {
  reference: string;
  bytes: Uint8Array;
  contentType: string;
  leafReferences: string[];
}

export interface FakeBeeFeedManifest {
  owner: string;
  topic: string;
  reference: string;
}

export interface FakeBeeOptions {
  existingPostageBatchId?: string | null;
  existingStamps?: Array<Partial<FakeBeeStamp> & { batchID: string }>;
  purchasedPostageBatchId?: string;
  corruptUploadReferences?: boolean;
  failStampList?: boolean;
}

export interface FakeBeeStamp {
  batchID: string;
  usable: boolean;
  exists: boolean;
  expired: boolean;
  depth: number;
  amount: string;
  batchTTL: number;
  utilization: number;
  label?: string;
}

export interface FakeBee {
  fetch: FetchLike;
  chunks: Map<string, Uint8Array>;
  uploads: FakeBeeUpload[];
  feedManifests: FakeBeeFeedManifest[];
  feedUpdates: Map<string, string>;
  stamps: FakeBeeStamp[];
  requests: Array<{ method: string; path: string; url: string; headers: Record<string, string> }>;
  getChunk(reference: string): Uint8Array | undefined;
  setStamp(batchID: string, patch: Partial<FakeBeeStamp>): void;
  writeFeedReference(owner: string, topic: string, reference: string): void;
  mutateChunk(reference: string, mutator: (bytes: Uint8Array) => Uint8Array): void;
  removeChunk(reference: string): void;
}

export function createFakeBee(options: FakeBeeOptions = {}): FakeBee {
  const chunks = new Map<string, Uint8Array>();
  const uploads: FakeBeeUpload[] = [];
  const feedManifests: FakeBeeFeedManifest[] = [];
  const feedUpdates = new Map<string, string>();
  const requests: Array<{ method: string; path: string; url: string; headers: Record<string, string> }> = [];
  const existingPostageBatchId =
    options.existingPostageBatchId === undefined ? "0".repeat(64) : options.existingPostageBatchId;
  const purchasedPostageBatchId = options.purchasedPostageBatchId ?? "9".repeat(64);
  const stamps: FakeBeeStamp[] = options.existingStamps
    ? options.existingStamps.map((stamp) => stampWithDefaults(stamp.batchID, stamp))
    : existingPostageBatchId
      ? [stampWithDefaults(existingPostageBatchId)]
      : [];

  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const headers = headersToRecord(init?.headers);
    requests.push({ method, path: url.pathname, url: input, headers });

    if (url.pathname === "/stamps" && method === "GET") {
      if (options.failStampList) {
        return textResponse("stamp list unavailable", 503, "Service Unavailable");
      }

      return jsonResponse({
        stamps
      });
    }

    if (url.pathname.startsWith("/stamps/") && method === "POST") {
      const [, , amount = "100000000", depth = "17"] = url.pathname.split("/");
      const label = url.searchParams.get("label");
      stamps.push(
        stampWithDefaults(purchasedPostageBatchId, {
          amount,
          depth: Number(depth),
          batchTTL: 3600,
          ...(label ? { label } : {})
        })
      );
      return jsonResponse({ batchID: purchasedPostageBatchId }, 201, "Created");
    }

    if (url.pathname.startsWith("/stamps/topup/") && method === "PATCH") {
      const [, , , batchId = "", amount = "0"] = url.pathname.split("/");
      const stamp = stamps.find((candidate) => candidate.batchID === batchId);

      if (!stamp) {
        return textResponse("missing stamp", 404, "Not Found");
      }

      stamp.amount = String(BigInt(stamp.amount || "0") + BigInt(amount));
      stamp.batchTTL += 3600;
      return jsonResponse({ batchID: stamp.batchID }, 200, "OK");
    }

    if (url.pathname === "/bytes" && method === "POST") {
      const bytes = bodyToBytes(init?.body);
      const tree = buildSwarmTree(bytes);
      mergeChunks(chunks, tree.chunks);
      const responseReference = options.corruptUploadReferences ? mutateReference(tree.reference) : tree.reference;
      uploads.push({
        reference: responseReference,
        bytes,
        contentType: headers["Content-Type"] ?? "application/octet-stream",
        leafReferences: tree.leafReferences
      });
      return jsonResponse({ reference: responseReference }, 201, "Created");
    }

    if (url.pathname.startsWith("/chunks/") && method === "GET") {
      const reference = url.pathname.slice("/chunks/".length);
      const chunk = chunks.get(reference);

      if (!chunk) {
        return textResponse("missing chunk", 404, "Not Found");
      }

      return bytesResponse(chunk);
    }

    if (url.pathname.startsWith("/feeds/") && method === "POST") {
      const [, , owner = "", topic = ""] = url.pathname.split("/");
      const manifestBytes = new TextEncoder().encode(
        JSON.stringify({
          owner,
          topic,
          type: url.searchParams.get("type") ?? "sequence"
        })
      );
      const tree = buildSwarmTree(manifestBytes);
      mergeChunks(chunks, tree.chunks);
      feedManifests.push({
        owner,
        topic,
        reference: tree.reference
      });
      return jsonResponse({ reference: tree.reference }, 201, "Created");
    }

    if (url.pathname.startsWith("/feeds/") && method === "GET") {
      const [, , owner = "", topic = ""] = url.pathname.split("/");
      const reference = feedUpdates.get(feedKey(owner, topic));

      if (!reference) {
        return textResponse("missing feed update", 404, "Not Found");
      }

      return bytesResponse(hexToBytes(reference));
    }

    return textResponse(`unhandled ${method} ${url.pathname}`, 500, "Unhandled");
  };

  return {
    fetch,
    chunks,
    uploads,
    feedManifests,
    feedUpdates,
    stamps,
    requests,
    getChunk(reference) {
      const chunk = chunks.get(reference);
      return chunk ? copyBytes(chunk) : undefined;
    },
    setStamp(batchID, patch) {
      const stamp = stamps.find((candidate) => candidate.batchID === batchID);

      if (!stamp) {
        throw new Error(`Unknown test stamp ${batchID}`);
      }

      Object.assign(stamp, patch);
    },
    writeFeedReference(owner, topic, reference) {
      feedUpdates.set(feedKey(owner, topic), reference);
    },
    mutateChunk(reference, mutator) {
      const chunk = chunks.get(reference);

      if (!chunk) {
        throw new Error(`Unknown test chunk ${reference}`);
      }

      chunks.set(reference, mutator(copyBytes(chunk)));
    },
    removeChunk(reference) {
      chunks.delete(reference);
    }
  };
}

function stampWithDefaults(batchID: string, overrides: Partial<FakeBeeStamp> = {}): FakeBeeStamp {
  return {
    batchID,
    usable: overrides.usable ?? true,
    exists: overrides.exists ?? true,
    expired: overrides.expired ?? false,
    depth: overrides.depth ?? 17,
    amount: overrides.amount ?? "100000000",
    batchTTL: overrides.batchTTL ?? 3600,
    utilization: overrides.utilization ?? 0,
    ...(overrides.label ? { label: overrides.label } : {})
  };
}

function feedKey(owner: string, topic: string): string {
  return `${owner.toLowerCase()}:${topic.toLowerCase()}`;
}

function mutateReference(reference: string): string {
  const last = reference.at(-1) ?? "0";
  return `${reference.slice(0, -1)}${last === "0" ? "1" : "0"}`;
}

export function patternedBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    bytes[index] = (index * 29 + 11) % 256;
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

interface BuiltSwarmTree {
  reference: string;
  chunks: Map<string, Uint8Array>;
  leafReferences: string[];
}

function buildSwarmTree(bytes: Uint8Array): BuiltSwarmTree {
  const chunks = new Map<string, Uint8Array>();
  const leafReferences: string[] = [];
  const root = buildNode(bytes, chunks, leafReferences);

  return {
    reference: root.reference,
    chunks,
    leafReferences
  };
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

function mergeChunks(target: Map<string, Uint8Array>, source: Map<string, Uint8Array>): void {
  for (const [reference, bytes] of source) {
    target.set(reference, copyBytes(bytes));
  }
}

function storeChunk(chunk: ContentAddressedChunk, chunks: Map<string, Uint8Array>): ContentAddressedChunk {
  chunks.set(chunk.reference, copyBytes(chunk.bytes));
  return chunk;
}

function bodyToBytes(body: FetchOptions["body"]): Uint8Array {
  if (!body) {
    return new Uint8Array();
  }

  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }

  if (body instanceof Uint8Array) {
    return copyBytes(body);
  }

  return new Uint8Array(body.slice(0));
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}

function jsonResponse(value: unknown, status = 200, statusText = "OK"): FetchResponseLike {
  const text = JSON.stringify(value);
  const bytes = new TextEncoder().encode(text);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async arrayBuffer() {
      return copyArrayBuffer(bytes);
    },
    async text() {
      return text;
    }
  };
}

function textResponse(value: string, status = 200, statusText = "OK"): FetchResponseLike {
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

function bytesResponse(bytes: Uint8Array): FetchResponseLike {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async arrayBuffer() {
      return copyArrayBuffer(bytes);
    },
    async text() {
      return new TextDecoder().decode(bytes);
    }
  };
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
