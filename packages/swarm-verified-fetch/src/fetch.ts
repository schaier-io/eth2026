import { verifyContentAddressedChunk, type CacVerificationResult } from "./cac.js";
import { concatBytes } from "./bytes.js";
import { createKeccak256, keccak256, type Keccak256Hasher } from "./crypto.js";
import {
  SwarmAbortError,
  SwarmGatewayError,
  SwarmInputError,
  SwarmJsonError,
  SwarmTimeoutError,
  SwarmVerificationError
} from "./errors.js";
import { bytesToHex, normalizeHex } from "./hex.js";
import {
  parseMantarayNode,
  resolveMantarayPath,
  type ResolvedMantarayPath
} from "./manifest.js";
import {
  feedUpdateReference,
  normalizeFeedTopic,
  verifyFeedUpdate,
  type FeedIndexInput,
  type FeedUpdateVerificationResult,
  type HexInput
} from "./soc.js";

export const SWARM_PUBLIC_GATEWAYS = {
  mainnet: {
    gatewayUrl: "https://download.gateway.ethswarm.org",
    gatewayUrls: ["https://download.gateway.ethswarm.org", "https://api.gateway.ethswarm.org"]
  },
  testnet: {
    gatewayUrl: "https://api.gateway.testnet.ethswarm.org",
    gatewayUrls: ["https://api.gateway.testnet.ethswarm.org", "https://download.gateway.testnet.ethswarm.org"]
  }
} as const;
export const DEFAULT_SWARM_NETWORK = "mainnet";
export const DEFAULT_SWARM_GATEWAY_URL = SWARM_PUBLIC_GATEWAYS[DEFAULT_SWARM_NETWORK].gatewayUrl;
export const DEFAULT_SWARM_TESTNET_GATEWAY_URL = SWARM_PUBLIC_GATEWAYS.testnet.gatewayUrl;
export const SWARM_REFERENCE_SIZE = 32;
export const SWARM_BRANCHING_FACTOR = 128;
export const SWARM_MAX_PAYLOAD_SIZE = 4096;

declare const swarmReferenceBrand: unique symbol;
declare const hexHashBrand: unique symbol;

export type SwarmReference = string & { readonly [swarmReferenceBrand]: true };
export type HexHash = `0x${string}` & { readonly [hexHashBrand]: true };
export type VerifiedFetchInput = string | URL;
export type VerifiedFetchResponseType = "buffer" | "stream";
export type GatewayStrategy = "failover" | "race";
export type SwarmNetwork = keyof typeof SWARM_PUBLIC_GATEWAYS;
export type CancellationListener = (reason?: unknown) => void;
export type CancellationSubscription =
  | void
  | (() => void)
  | {
      dispose(): void;
    }
  | {
      unsubscribe(): void;
    };

export type CancellationTokenLike =
  | PromiseLike<unknown>
  | {
      readonly aborted?: boolean;
      readonly canceled?: boolean;
      readonly cancelled?: boolean;
      readonly promise?: PromiseLike<unknown>;
      readonly reason?: unknown;
      onCancellationRequested?(listener: CancellationListener): CancellationSubscription;
      subscribe?(listener: CancellationListener): CancellationSubscription;
      throwIfRequested?(): void;
    };

export interface FetchOptions {
  method?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers?: Headers;
  arrayBuffer(): Promise<ArrayBuffer>;
  text?(): Promise<string>;
}

export type FetchLike = (input: string, init?: FetchOptions) => Promise<FetchResponseLike>;

export type VerifiedFetchProgressEvent =
  | {
      readonly type: "chunkFetched";
      readonly reference: SwarmReference;
      readonly url: string;
      readonly byteLength: number;
      readonly bytesVerified: number;
      readonly chunksFetched: number;
      readonly chunksVerified: number;
      readonly totalBytes?: number;
    }
  | {
      readonly type: "chunkVerified";
      readonly reference: SwarmReference;
      readonly url: string;
      readonly byteLength: number;
      readonly bytesVerified: number;
      readonly chunksFetched: number;
      readonly chunksVerified: number;
      readonly totalBytes?: number;
    }
  | {
      readonly type: "socVerified";
      readonly reference: SwarmReference;
      readonly url: string;
      readonly byteLength: number;
      readonly bytesVerified: number;
      readonly chunksFetched: number;
      readonly chunksVerified: number;
      readonly identifier: HexHash;
      readonly owner: `0x${string}`;
      readonly totalBytes?: number;
    }
  | {
      readonly type: "bytesEnqueued";
      readonly reference: SwarmReference;
      readonly byteLength: number;
      readonly bytesVerified: number;
      readonly chunksFetched: number;
      readonly chunksVerified: number;
      readonly totalBytes?: number;
    }
  | {
      readonly type: "complete";
      readonly reference: SwarmReference;
      readonly bytesVerified: number;
      readonly chunksFetched: number;
      readonly chunksVerified: number;
      readonly contentHash: HexHash;
      readonly totalBytes: number;
    };

export interface RetryOptions {
  readonly attempts?: number;
  readonly baseDelayMs?: number;
  readonly factor?: number;
  readonly jitter?: boolean;
  readonly maxDelayMs?: number;
}

export interface VerifiedFetchOptions {
  contentType?: string;
  fileName?: string;
  gatewayUrl?: string | URL;
  gateways?: Array<string | URL>;
  gatewayStrategy?: GatewayStrategy;
  network?: SwarmNetwork;
  fetch?: FetchLike;
  cancelToken?: CancellationTokenLike;
  headers?: HeadersInit;
  maxChunks?: number;
  method?: string;
  onProgress?: (event: VerifiedFetchProgressEvent) => void;
  retry?: RetryOptions;
  signal?: AbortSignal;
  timeoutMs?: number;
  expectedHash?: string;
  responseType?: VerifiedFetchResponseType;
}

export interface VerifiedFeedInput {
  owner: HexInput;
  topic: HexInput;
  index?: FeedIndexInput;
}

export type VerifiedFeedFetchInput = VerifiedFeedInput | string | URL;

export interface VerifiedFeedFetchOptions extends VerifiedFetchOptions {
  index?: FeedIndexInput;
}

export type VerifiedFeedUpdateOptions = Omit<VerifiedFeedFetchOptions, "expectedHash" | "responseType">;

export type VerifiedFeedBytesResponse = VerifiedBytesResponse & {
  readonly feed: FeedUpdateVerificationResult & {
    readonly payloadKind: "reference";
    readonly targetReference: SwarmReference;
  };
  readonly metadata: VerifiedBytesMetadata & {
    readonly feed: VerifiedFeedMetadata & {
      readonly targetReference: SwarmReference;
    };
  };
  readonly verification: VerifiedBytesResponse["verification"] & {
    readonly feed: VerifiedFeedMetadata & {
      readonly targetReference: SwarmReference;
    };
  };
};

export type VerifiedFeedByteStreamResponse = VerifiedByteStreamResponse & {
  readonly feed: FeedUpdateVerificationResult & {
    readonly payloadKind: "reference";
    readonly targetReference: SwarmReference;
  };
  readonly metadata: VerifiedByteStreamMetadata & {
    readonly feed: VerifiedFeedMetadata & {
      readonly targetReference: SwarmReference;
    };
  };
  readonly verification: VerifiedByteStreamResponse["verification"] & {
    readonly feed: VerifiedFeedMetadata & {
      readonly targetReference: SwarmReference;
    };
  };
};

export type VerifiedFeedFetchResponse = VerifiedFeedBytesResponse | VerifiedFeedByteStreamResponse;

export interface VerifyChunkOptions {
  signal?: AbortSignal;
  url?: string;
}

export type SwarmChunkSource = (reference: SwarmReference) => Uint8Array | Promise<Uint8Array>;

export interface VerifyBytesOptions {
  chunks?: ReadonlyMap<string, Uint8Array> | Record<string, Uint8Array>;
  expectedHash?: string;
  getChunk?: SwarmChunkSource;
  maxChunks?: number;
  signal?: AbortSignal;
}

export interface BytesHashVerificationResult {
  readonly verified: true;
  readonly algorithm: "keccak256";
  readonly expectedHash: HexHash;
  readonly computedHash: HexHash;
  readonly byteLength: number;
}

export interface VerifiedChunkResponse {
  readonly ok: true;
  readonly status: 200;
  readonly statusText: "OK";
  readonly url: string;
  readonly verified: true;
  readonly reference: SwarmReference;
  readonly bytes: Uint8Array;
  readonly payload: Uint8Array;
  readonly span: bigint;
  readonly verification: CacVerificationResult & {
    verified: true;
    mode: "cac";
  };
  readonly bodyUsed: false;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<TValue = unknown>(): Promise<TValue>;
  clone(): VerifiedChunkResponse;
}

export type VerifiedSwarmResponse = VerifiedBytesResponse | VerifiedByteStreamResponse;

export type VerifiedMediaType =
  | {
      readonly kind: "json";
      readonly extension?: string;
      readonly mimeType: string;
      readonly source: "content-type" | "file-name";
    }
  | {
      readonly kind: "text";
      readonly extension?: string;
      readonly mimeType: string;
      readonly source: "content-type" | "file-name";
    }
  | {
      readonly kind: "binary";
      readonly extension?: string;
      readonly mimeType: string;
      readonly source: "content-type" | "file-name";
    }
  | {
      readonly kind: "unknown";
      readonly source: "none";
    };

export interface VerifiedBytesMetadata {
  readonly kind: "bytes";
  readonly byteLength: number;
  readonly chunksVerified: number;
  readonly contentHash: HexHash;
  readonly feed?: VerifiedFeedMetadata;
  readonly fileName?: string;
  readonly lastModified?: string;
  readonly manifest?: VerifiedManifestMetadata;
  readonly mediaType: VerifiedMediaType;
  readonly mimeType?: string;
  readonly path?: string;
  readonly reference: SwarmReference;
  readonly span: bigint;
}

export interface VerifiedManifestMetadata {
  readonly metadata: Record<string, string> | null;
  readonly path: string;
  readonly reference: SwarmReference;
  readonly targetReference: SwarmReference;
  readonly chunksVerified: number;
}

export interface VerifiedFeedMetadata {
  readonly type: "sequence";
  readonly owner: `0x${string}`;
  readonly topic: HexHash;
  readonly index: bigint;
  readonly identifier: HexHash;
  readonly updateReference: SwarmReference;
  readonly targetReference?: SwarmReference;
  readonly timestamp?: number;
}

export interface VerifiedBytesResponse {
  readonly ok: true;
  readonly status: 200;
  readonly statusText: "OK";
  readonly delivery: "buffer";
  readonly kind: "bytes";
  readonly url: string;
  readonly verified: true;
  readonly reference: SwarmReference;
  readonly bytes: Uint8Array;
  readonly span: bigint;
  readonly chunksVerified: number;
  readonly contentHash: HexHash;
  readonly metadata: VerifiedBytesMetadata;
  readonly verification: {
    readonly verified: true;
    readonly reference: SwarmReference;
    readonly span: bigint;
    readonly chunksVerified: number;
    readonly mode: "cac-tree";
    readonly contentHash: HexHash;
    readonly expectedHash?: HexHash;
    readonly feed?: VerifiedFeedMetadata;
    readonly manifest?: VerifiedManifestMetadata;
  };
  readonly bodyUsed: false;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
  text(): Promise<string>;
  json<TValue = unknown>(): Promise<TValue>;
  clone(): VerifiedBytesResponse;
}

export interface VerifiedByteStreamMetadata {
  readonly kind: "bytes";
  readonly byteLength: number;
  readonly feed?: VerifiedFeedMetadata;
  readonly fileName?: string;
  readonly lastModified?: string;
  readonly manifest?: VerifiedManifestMetadata;
  readonly mediaType: VerifiedMediaType;
  readonly mimeType?: string;
  readonly path?: string;
  readonly reference: SwarmReference;
  readonly span: bigint;
}

export interface VerifiedByteStreamCompletion {
  readonly verified: true;
  readonly chunksVerified: number;
  readonly contentHash: HexHash;
  readonly expectedHash?: HexHash;
}

export interface VerifiedByteStreamResponse {
  readonly ok: true;
  readonly status: 200;
  readonly statusText: "OK";
  readonly delivery: "stream";
  readonly kind: "bytes";
  readonly url: string;
  readonly verified: "streaming";
  readonly reference: SwarmReference;
  readonly span: bigint;
  readonly metadata: VerifiedByteStreamMetadata;
  readonly verification: {
    readonly status: "streaming";
    readonly reference: SwarmReference;
    readonly span: bigint;
    readonly mode: "cac-tree-stream";
    readonly feed?: VerifiedFeedMetadata;
  };
  readonly body: ReadableStream<Uint8Array>;
  readonly completion: Promise<VerifiedByteStreamCompletion>;
  stream(): ReadableStream<Uint8Array>;
}

export interface SwarmVerifiedFetchClient {
  readonly gatewayUrl: string;
  readonly gatewayUrls: readonly string[];
  readonly network: SwarmNetwork;
  fetch(
    input: VerifiedFetchInput,
    options?: Omit<VerifiedFetchOptions, "fetch" | "gatewayUrl" | "network">
  ): Promise<VerifiedSwarmResponse>;
  fetchFeed(
    input: VerifiedFeedFetchInput,
    options?: Omit<VerifiedFeedFetchOptions, "fetch" | "gatewayUrl" | "network">
  ): Promise<VerifiedFeedFetchResponse>;
  fetchFeedUpdate(
    input: VerifiedFeedFetchInput,
    options?: Omit<VerifiedFeedUpdateOptions, "fetch" | "gatewayUrl" | "network">
  ): Promise<FeedUpdateVerificationResult>;
}

export function createSwarmVerifiedFetch(options: VerifiedFetchOptions = {}): SwarmVerifiedFetchClient {
  const network = normalizeSwarmNetwork(options.network);
  const gatewayUrl = resolvePrimaryGatewayUrl(options, network);
  const gatewayFallbacks = usesDefaultPublicGateways(options) ? defaultGatewayUrls(network) : undefined;
  const gatewayUrls = normalizeGatewayUrls(options.gateways ?? gatewayFallbacks, gatewayUrl);
  const fetchImpl = resolveFetch(options.fetch);

  return {
    gatewayUrl,
    gatewayUrls,
    network,
    async fetch(input, requestOptions = {}) {
      return verifiedFetchInternal(input, {
        ...options,
        ...requestOptions,
        gatewayUrl,
        gateways: requestOptions.gateways ?? options.gateways ?? gatewayUrls,
        network,
        fetch: fetchImpl
      });
    },
    async fetchFeed(input, requestOptions = {}) {
      return verifiedFetchFeed(input, {
        ...options,
        ...requestOptions,
        gatewayUrl,
        gateways: requestOptions.gateways ?? options.gateways ?? gatewayUrls,
        network,
        fetch: fetchImpl
      });
    },
    async fetchFeedUpdate(input, requestOptions = {}) {
      return verifiedFetchFeedUpdate(input, {
        ...options,
        ...requestOptions,
        gatewayUrl,
        gateways: requestOptions.gateways ?? options.gateways ?? gatewayUrls,
        network,
        fetch: fetchImpl
      });
    }
  };
}

export function verifiedFetch(
  input: VerifiedFetchInput,
  options?: VerifiedFetchOptions & { responseType?: "buffer" }
): Promise<VerifiedBytesResponse>;
export function verifiedFetch(
  input: VerifiedFetchInput,
  options: VerifiedFetchOptions & { responseType: "stream" }
): Promise<VerifiedByteStreamResponse>;
export async function verifiedFetch(
  input: VerifiedFetchInput,
  options: VerifiedFetchOptions = {}
): Promise<VerifiedSwarmResponse> {
  if (isFeedUrl(input)) {
    return verifiedFetchFeed(input, options);
  }

  return verifiedFetchInternal(input, options);
}

export function verifiedFetchFeed(
  input: VerifiedFeedFetchInput,
  options?: VerifiedFeedFetchOptions & { responseType?: "buffer" }
): Promise<VerifiedFeedBytesResponse>;
export function verifiedFetchFeed(
  input: VerifiedFeedFetchInput,
  options: VerifiedFeedFetchOptions & { responseType: "stream" }
): Promise<VerifiedFeedByteStreamResponse>;
export function verifiedFetchFeed(
  input: VerifiedFeedFetchInput,
  options?: VerifiedFeedFetchOptions
): Promise<VerifiedFeedFetchResponse>;
export async function verifiedFetchFeed(
  input: VerifiedFeedFetchInput,
  options: VerifiedFeedFetchOptions = {}
): Promise<VerifiedFeedFetchResponse> {
  assertGetMethod(options.method);
  const scope = createAbortScope(options);
  const parsed = parseFeedInput(input, options);
  const context = createGatewayContext(options, scope.signal);

  try {
    const update = await fetchVerifiedFeedUpdateWithContext(parsed, context);

    if (update.payloadKind !== "reference" || update.targetReference === undefined) {
      throw new SwarmVerificationError("verifiedFetchFeed requires a Bee reference feed update.", {
        reference: update.reference
      });
    }

    const feed = feedMetadataFromUpdate(update);
    const metadataHints = metadataHintsFromOptions(options, parsed.url);

    if (options.responseType === "stream") {
      const response = await fetchVerifiedStreamWithContext(update.targetReference, {
        ...options,
        cleanup: scope.cleanup,
        context,
        feed,
        metadataHints,
        url: parsed.url
      });
      return {
        ...response,
        feed: update as VerifiedFeedByteStreamResponse["feed"]
      } as VerifiedFeedByteStreamResponse;
    }

    const result = await fetchVerifiedTree(update.targetReference, context);
    const response = createVerifiedBytesResponse({
      ...result,
      ...(options.expectedHash === undefined ? {} : { expectedHash: options.expectedHash }),
      feed,
      metadataHints,
      reference: update.targetReference,
      url: parsed.url
    }) as VerifiedFeedBytesResponse;
    emitCompleteProgress(context, response);
    return {
      ...response,
      feed: update as VerifiedFeedBytesResponse["feed"]
    };
  } finally {
    if (options.responseType !== "stream") {
      scope.cleanup();
    }
  }
}

export async function verifiedFetchFeedUpdate(
  input: VerifiedFeedFetchInput,
  options: VerifiedFeedUpdateOptions = {}
): Promise<FeedUpdateVerificationResult> {
  assertGetMethod(options.method);
  const scope = createAbortScope(options);
  const parsed = parseFeedInput(input, options);
  const context = createGatewayContext(options, scope.signal);

  try {
    return await fetchVerifiedFeedUpdateWithContext(parsed, context);
  } finally {
    scope.cleanup();
  }
}

async function verifiedFetchInternal(
  input: VerifiedFetchInput,
  options: VerifiedFetchOptions = {}
): Promise<VerifiedSwarmResponse> {
  assertGetMethod(options.method);
  const target = fetchTargetFromInput(input, options);

  if (target.path.length > 0) {
    return fetchVerifiedManifestPath(target, options);
  }

  if (options.responseType === "stream") {
    return fetchVerifiedStream(target.reference, {
      ...options,
      gatewayUrl: target.gatewayUrl,
      useDefaultPublicGateways: target.useDefaultPublicGateways,
      expectedHash: options.expectedHash,
      metadataHints: metadataHintsFromOptions(options, target.url),
      url: target.url
    } as InternalFetchVerifiedStreamOptions);
  }

  return fetchBufferedResponse(target.reference, {
    ...options,
    gatewayUrl: target.gatewayUrl,
    useDefaultPublicGateways: target.useDefaultPublicGateways,
    expectedHash: options.expectedHash,
    metadataHints: metadataHintsFromOptions(options, target.url),
    url: target.url
  } as InternalFetchVerifiedBytesOptions);
}

async function fetchVerifiedManifestPath(
  target: FetchTarget,
  options: VerifiedFetchOptions
): Promise<VerifiedSwarmResponse> {
  const scope = createAbortScope(options);
  const context = createGatewayContext(
    {
      ...options,
      gatewayUrl: target.gatewayUrl,
      useDefaultPublicGateways: target.useDefaultPublicGateways
    },
    scope.signal
  );

  try {
    const manifestStartChunks = context.chunksVerified;
    const loadedNodes = new Map<string, ReturnType<typeof parseMantarayNode>>();
    const loadManifestNode = async (reference: string) => {
      const normalizedReference = normalizeSwarmReference(reference);
      const cached = loadedNodes.get(normalizedReference);

      if (cached) {
        return cached;
      }

      const result = await fetchVerifiedTree(normalizedReference, context);
      const node = parseMantarayNode(result.bytes, normalizedReference);
      loadedNodes.set(normalizedReference, node);
      return node;
    };

    const root = await loadManifestNode(target.reference);
    const resolved = await resolveMantarayPath(root, target.path, loadManifestNode);
    const manifest: VerifiedManifestMetadata = {
      metadata: resolved.metadata,
      path: resolved.path,
      reference: target.reference,
      targetReference: normalizeSwarmReference(resolved.targetReference),
      chunksVerified: context.chunksVerified - manifestStartChunks
    };
    const metadataHints = metadataHintsFromOptionsAndManifest(options, target.url, resolved);

    if (options.responseType === "stream") {
      return fetchVerifiedStreamWithContext(manifest.targetReference, {
        ...options,
        useDefaultPublicGateways: target.useDefaultPublicGateways,
        cleanup: scope.cleanup,
        context,
        manifest,
        metadataHints,
        url: target.url
      });
    }

    const result = await fetchVerifiedTree(manifest.targetReference, context);
    const response = createVerifiedBytesResponse({
      ...result,
      ...(options.expectedHash === undefined ? {} : { expectedHash: options.expectedHash }),
      manifest,
      metadataHints,
      reference: manifest.targetReference,
      url: target.url
    });
    emitCompleteProgress(context, response);
    return response;
  } finally {
    if (options.responseType !== "stream") {
      scope.cleanup();
    }
  }
}

interface InternalFetchVerifiedBytesOptions extends VerifiedFetchOptions {
  metadataHints?: MetadataHints;
  useDefaultPublicGateways?: boolean;
  url?: string;
}

interface InternalFetchVerifiedStreamOptions extends VerifiedFetchOptions {
  cleanup?: () => void;
  context?: GatewayTreeContext;
  feed?: VerifiedFeedMetadata;
  manifest?: VerifiedManifestMetadata;
  metadataHints?: MetadataHints;
  useDefaultPublicGateways?: boolean;
  url?: string;
}

async function fetchBufferedResponse(
  reference: string,
  options: InternalFetchVerifiedBytesOptions = {}
): Promise<VerifiedBytesResponse> {
  assertGetMethod(options.method);
  const normalizedReference = normalizeSwarmReference(reference);
  const scope = createAbortScope(options);
  const context = createGatewayContext(options, scope.signal);

  try {
    const result = await fetchVerifiedTree(normalizedReference, context);
    const url = (options as { url?: string }).url ?? `${context.gatewayUrl}/bytes/${normalizedReference}`;
    const response = createVerifiedBytesResponse({
      ...result,
      ...(options.expectedHash === undefined ? {} : { expectedHash: options.expectedHash }),
      ...(options.metadataHints === undefined ? {} : { metadataHints: options.metadataHints }),
      reference: normalizedReference,
      url
    });
    emitCompleteProgress(context, response);
    return response;
  } finally {
    scope.cleanup();
  }
}

async function fetchVerifiedStream(
  reference: string,
  options: InternalFetchVerifiedStreamOptions
): Promise<VerifiedByteStreamResponse> {
  assertGetMethod(options.method);
  const normalizedReference = normalizeSwarmReference(reference);
  const scope = createAbortScope(options);
  const context = createGatewayContext(options, scope.signal);

  return fetchVerifiedStreamWithContext(normalizedReference, {
    ...options,
    cleanup: scope.cleanup,
    context
  });
}

async function fetchVerifiedStreamWithContext(
  reference: string,
  options: InternalFetchVerifiedStreamOptions & { context: GatewayTreeContext }
): Promise<VerifiedByteStreamResponse> {
  const normalizedReference = normalizeSwarmReference(reference);
  const context = options.context;
  const url = options.url ?? `${context.gatewayUrl}/bytes/${normalizedReference}`;
  let rootChunk: VerifiedChunkResponse;

  try {
    rootChunk = await fetchAndVerifyChunk(normalizedReference, context);
    context.chunksVerified += 1;
  } catch (error) {
    options.cleanup?.();
    throw error;
  }

  const span = rootChunk.verification.span;
  const byteLength = safeNumberFromSpan(span);
  assertByteLengthHint(options.metadataHints, byteLength, normalizedReference, url);
  resetProgressTree(context, normalizedReference, byteLength);
  emitChunkVerifiedProgress(context, normalizedReference, rootChunk);
  const mediaType = detectMediaType(options.metadataHints);
  const metadataDetails = metadataDetailsFromHints(options.metadataHints, mediaType);
  const metadata: VerifiedByteStreamMetadata = {
    kind: "bytes",
    byteLength,
    ...(options.feed === undefined ? {} : { feed: options.feed }),
    ...metadataDetails,
    ...(options.manifest === undefined ? {} : { manifest: options.manifest, path: options.manifest.path }),
    mediaType,
    reference: normalizedReference,
    span
  };
  const expectedHash = options.expectedHash === undefined ? undefined : normalizeHash(options.expectedHash);
  const hasher = createKeccak256();
  let resolveCompletion!: (value: VerifiedByteStreamCompletion) => void;
  let rejectCompletion!: (reason?: unknown) => void;
  const completion = new Promise<VerifiedByteStreamCompletion>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  const iterator = streamVerifiedTreeFromChunk(normalizedReference, rootChunk, context, hasher);
  let finished = false;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();

        if (!next.done) {
          controller.enqueue(next.value);
          return;
        }

        const contentHashValue = hexHashFromBytes(hasher.digest());

        if (expectedHash !== undefined && expectedHash !== contentHashValue) {
          throw new SwarmVerificationError(
            `Verified bytes hash mismatch: expected ${expectedHash}, computed ${contentHashValue}.`,
            {
              reference: normalizedReference,
              url
            }
          );
        }

        finished = true;
        options.cleanup?.();
        const result = {
          verified: true,
          chunksVerified: context.chunksVerified,
          contentHash: contentHashValue,
          ...(expectedHash === undefined ? {} : { expectedHash })
        } as const;
        emitCompleteProgress(context, {
          contentHash: contentHashValue,
          reference: normalizedReference
        });
        resolveCompletion(result);
        controller.close();
      } catch (error) {
        finished = true;
        options.cleanup?.();
        rejectCompletion(error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (!finished) {
        finished = true;
        options.cleanup?.();
        rejectCompletion(new SwarmAbortError("Swarm verified stream was cancelled.", { cause: reason }));
      }

      await iterator.return?.(undefined);
    }
  });

  return {
    ok: true,
    status: 200,
    statusText: "OK",
    delivery: "stream",
    kind: "bytes",
    url,
    verified: "streaming",
    reference: normalizedReference,
    span,
    metadata,
    verification: {
      status: "streaming",
      reference: normalizedReference,
      span,
      mode: "cac-tree-stream",
      ...(options.feed === undefined ? {} : { feed: options.feed })
    },
    body,
    completion,
    stream() {
      return body;
    }
  };
}

export function verifySwarmChunk(
  reference: string,
  bytes: Uint8Array,
  options: VerifyChunkOptions = {}
): VerifiedChunkResponse {
  const normalizedReference = normalizeSwarmReference(reference);
  throwIfAborted(options.signal);
  const verification = verifyContentAddressedChunk(normalizedReference, bytes);

  if (!verification.verified) {
    throw new SwarmVerificationError(
      `Swarm chunk verification failed: expected ${verification.expectedReference}, computed ${verification.computedReference}.`,
      {
        reference: normalizedReference,
        ...(options.url === undefined ? {} : { url: options.url })
      }
    );
  }

  return createVerifiedChunkResponse({
    bytes: copyBytes(bytes),
    reference: normalizedReference,
    url: options.url ?? `swarm-chunk://${normalizedReference}`,
    verification: {
      ...verification,
      verified: true,
      mode: "cac"
    }
  });
}

export async function verifySwarmBytes(
  reference: string,
  options: VerifyBytesOptions
): Promise<VerifiedBytesResponse> {
  const normalizedReference = normalizeSwarmReference(reference);
  const getChunk = chunkSourceFromOptions(options);
  const context: ManualTreeContext = {
    bytesVerified: 0,
    chunksFetched: 0,
    chunksVerified: 0,
    async readChunk(childReference) {
      throwIfAborted(options.signal);
      const bytes = await getChunk(childReference);
      return verifySwarmChunk(childReference, bytes, {
        ...(options.signal === undefined ? {} : { signal: options.signal })
      });
    }
  };

  if (options.maxChunks !== undefined) {
    context.maxChunks = options.maxChunks;
  }

  if (options.signal !== undefined) {
    context.signal = options.signal;
  }

  const result = await readVerifiedTree(normalizedReference, context);
  return createVerifiedBytesResponse({
    ...result,
    ...(options.expectedHash === undefined ? {} : { expectedHash: options.expectedHash }),
    metadataHints: {},
    reference: normalizedReference,
    url: `swarm://${normalizedReference}`
  });
}

export function verifyBytesHash(bytes: Uint8Array, expectedHash: string): BytesHashVerificationResult {
  const expected = normalizeHash(expectedHash);
  const computed = contentHash(bytes);

  if (computed !== expected) {
    throw new SwarmVerificationError(
      `Verified bytes hash mismatch: expected ${expected}, computed ${computed}.`
    );
  }

  return {
    verified: true,
    algorithm: "keccak256",
    expectedHash: expected,
    computedHash: computed,
    byteLength: bytes.byteLength
  };
}

export const verifyChunk = verifySwarmChunk;
export const verifyBytes = verifySwarmBytes;

function normalizeBaseUrl(value: string | URL): string {
  const url = new URL(value);
  return url.toString().replace(/\/$/, "");
}

function normalizeSwarmReference(value: string): SwarmReference {
  const normalized = normalizeHex(value);

  if (normalized.length !== SWARM_REFERENCE_SIZE * 2) {
    throw new SwarmInputError(
      `Swarm references must be ${SWARM_REFERENCE_SIZE} bytes (${SWARM_REFERENCE_SIZE * 2} hex characters).`,
      { reference: normalized }
    );
  }

  return normalized as SwarmReference;
}

function normalizeHash(value: string): HexHash {
  const normalized = normalizeHex(value);

  if (normalized.length !== 64) {
    throw new SwarmInputError("Expected a 32-byte hex hash.", { reference: normalized });
  }

  return `0x${normalized}` as HexHash;
}

interface FetchTarget {
  gatewayUrl: string;
  path: string;
  reference: SwarmReference;
  useDefaultPublicGateways: boolean;
  url: string;
}

interface ParsedFeedTarget {
  owner: HexInput;
  topic: HexInput;
  index: FeedIndexInput | undefined;
  url: string;
}

function fetchTargetFromInput(input: VerifiedFetchInput, options: VerifiedFetchOptions): FetchTarget {
  const value = input.toString();
  const network = normalizeSwarmNetwork(options.network);

  if (value.startsWith("bzz://") || value.startsWith("swarm://")) {
    const url = new URL(value);
    const gatewayUrl = resolvePrimaryGatewayUrl(options, network);

    return {
      gatewayUrl,
      path: url.pathname.replace(/^\//, ""),
      reference: normalizeSwarmReference(url.hostname),
      useDefaultPublicGateways: usesDefaultPublicGateways(options),
      url: value
    };
  }

  if (isHttpUrl(value)) {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const endpointIndex = parts.findIndex((part) => part === "bzz" || part === "bytes" || part === "chunks");

    if (endpointIndex < 0) {
      throw new SwarmInputError(
        "Swarm gateway URLs must include /bzz/:reference, /bytes/:reference, or /chunks/:reference.",
        { url: value }
      );
    }

    const reference = parts[endpointIndex + 1];

    if (!reference) {
      throw new SwarmInputError("Swarm gateway URL is missing a reference.", { url: value });
    }

    return {
      gatewayUrl: normalizeBaseUrl(options.gatewayUrl ?? url.origin),
      path: parts.slice(endpointIndex + 2).join("/"),
      reference: normalizeSwarmReference(reference),
      useDefaultPublicGateways: false,
      url: value
    };
  }

  const reference = normalizeSwarmReference(value);
  const gatewayUrl = resolvePrimaryGatewayUrl(options, network);
  return {
    gatewayUrl,
    path: "",
    reference,
    useDefaultPublicGateways: usesDefaultPublicGateways(options),
    url: `swarm://${reference}`
  };
}

function isFeedUrl(input: VerifiedFetchInput | VerifiedFeedFetchInput): boolean {
  return typeof input !== "object" || input instanceof URL
    ? input.toString().startsWith("feed://")
    : false;
}

function parseFeedInput(input: VerifiedFeedFetchInput, options: VerifiedFeedFetchOptions): ParsedFeedTarget {
  if (typeof input === "object" && !(input instanceof URL)) {
    return {
      owner: input.owner,
      topic: input.topic,
      index: options.index ?? input.index,
      url: feedUrlFromParts(input.owner, input.topic, options.index ?? input.index)
    };
  }

  const value = input.toString();

  if (!value.startsWith("feed://")) {
    throw new SwarmInputError("Feed inputs must be feed://<owner>/<topic>?index=<uint64> or { owner, topic, index }.");
  }

  const url = new URL(value);
  const topic = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (!url.hostname || !topic) {
    throw new SwarmInputError("Feed URLs must include an owner host and topic path.", { url: value });
  }

  return {
    owner: url.hostname,
    topic,
    index: options.index ?? url.searchParams.get("index") ?? undefined,
    url: value
  };
}

function feedUrlFromParts(owner: HexInput, topic: HexInput, index: FeedIndexInput | undefined): string {
  const ownerPart = owner instanceof Uint8Array ? bytesToHex(owner) : owner.replace(/^0x/i, "");
  const topicPart = topic instanceof Uint8Array ? bytesToHex(topic) : encodeURIComponent(topic);
  const indexPart = index === undefined ? "" : `?index=${encodeURIComponent(index instanceof Uint8Array ? bytesToHex(index) : index.toString())}`;
  return `feed://${ownerPart}/${topicPart}${indexPart}`;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function normalizeSwarmNetwork(network: SwarmNetwork | undefined): SwarmNetwork {
  if (network === undefined) {
    return DEFAULT_SWARM_NETWORK;
  }

  if (network !== "mainnet" && network !== "testnet") {
    throw new SwarmInputError("Swarm network must be either \"mainnet\" or \"testnet\".", { cause: network });
  }

  return network;
}

function defaultGatewayUrl(network: SwarmNetwork): string {
  return SWARM_PUBLIC_GATEWAYS[network].gatewayUrl;
}

function defaultGatewayUrls(network: SwarmNetwork): string[] {
  return [...SWARM_PUBLIC_GATEWAYS[network].gatewayUrls];
}

function resolvePrimaryGatewayUrl(options: VerifiedFetchOptions, network: SwarmNetwork): string {
  if (options.gatewayUrl !== undefined) {
    return normalizeBaseUrl(options.gatewayUrl);
  }

  const firstGateway = options.gateways?.[0];

  if (firstGateway !== undefined) {
    return normalizeBaseUrl(firstGateway);
  }

  return normalizeBaseUrl(defaultGatewayUrl(network));
}

function usesDefaultPublicGateways(options: VerifiedFetchOptions): boolean {
  return options.gatewayUrl === undefined && (options.gateways?.length ?? 0) === 0;
}

interface GatewayTreeContext extends TreeContext {
  fetch: FetchLike;
  gatewayUrl: string;
  gatewayUrls: string[];
  gatewayStrategy: GatewayStrategy;
  headers?: HeadersInit;
  retry: Required<RetryOptions>;
}

interface ManualTreeContext extends TreeContext {
  readChunk(reference: SwarmReference): Promise<VerifiedChunkResponse>;
}

interface TreeContext {
  bytesVerified: number;
  chunksFetched: number;
  chunksVerified: number;
  maxChunks?: number;
  onProgress?: (event: VerifiedFetchProgressEvent) => void;
  signal?: AbortSignal;
  totalBytes?: number;
}

interface TreeFetchResult {
  bytes: Uint8Array;
  span: bigint;
  chunksVerified: number;
}

interface InternalGatewayOptions extends VerifiedFetchOptions {
  useDefaultPublicGateways?: boolean;
}

function createGatewayContext(options: InternalGatewayOptions, signal: AbortSignal | undefined): GatewayTreeContext {
  const network = normalizeSwarmNetwork(options.network);
  const gatewayUrl = resolvePrimaryGatewayUrl(options, network);
  const gatewayFallbacks = options.useDefaultPublicGateways ? defaultGatewayUrls(network) : undefined;
  const context: GatewayTreeContext = {
    bytesVerified: 0,
    chunksFetched: 0,
    chunksVerified: 0,
    fetch: resolveFetch(options.fetch),
    gatewayUrl,
    gatewayUrls: normalizeGatewayUrls(options.gateways ?? gatewayFallbacks, gatewayUrl),
    gatewayStrategy: options.gatewayStrategy ?? "failover",
    retry: normalizeRetryOptions(options.retry)
  };

  if (options.maxChunks !== undefined) {
    context.maxChunks = options.maxChunks;
  }

  if (options.headers !== undefined) {
    context.headers = options.headers;
  }

  if (options.onProgress !== undefined) {
    context.onProgress = options.onProgress;
  }

  if (signal !== undefined) {
    context.signal = signal;
  }

  return context;
}

function normalizeGatewayUrls(gateways: Array<string | URL> | undefined, fallbackGatewayUrl: string): string[] {
  const values = gateways?.length ? gateways : [fallbackGatewayUrl];
  const normalized: string[] = [];

  for (const value of values) {
    const gatewayUrl = normalizeBaseUrl(value);

    if (!normalized.includes(gatewayUrl)) {
      normalized.push(gatewayUrl);
    }
  }

  return normalized;
}

function normalizeRetryOptions(retry: RetryOptions | undefined): Required<RetryOptions> {
  const attempts = retry?.attempts ?? 1;
  const baseDelayMs = retry?.baseDelayMs ?? 250;
  const factor = retry?.factor ?? 2;
  const maxDelayMs = retry?.maxDelayMs ?? 2_000;

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new SwarmInputError("retry.attempts must be a positive integer.");
  }

  if (baseDelayMs < 0 || maxDelayMs < 0 || factor < 1) {
    throw new SwarmInputError("retry delay values must be non-negative and retry.factor must be at least 1.");
  }

  return {
    attempts,
    baseDelayMs,
    factor,
    jitter: retry?.jitter ?? false,
    maxDelayMs
  };
}

function resetProgressTree(context: TreeContext, reference: SwarmReference, totalBytes: number): void {
  context.bytesVerified = 0;
  context.totalBytes = totalBytes;
  void reference;
}

function emitChunkFetchedProgress(
  context: TreeContext,
  reference: SwarmReference,
  url: string,
  byteLength: number
): void {
  context.onProgress?.({
    type: "chunkFetched",
    reference,
    url,
    byteLength,
    bytesVerified: context.bytesVerified,
    chunksFetched: context.chunksFetched,
    chunksVerified: context.chunksVerified,
    ...(context.totalBytes === undefined ? {} : { totalBytes: context.totalBytes })
  });
}

function emitChunkVerifiedProgress(
  context: TreeContext,
  reference: SwarmReference,
  chunk: VerifiedChunkResponse
): void {
  context.onProgress?.({
    type: "chunkVerified",
    reference,
    url: chunk.url,
    byteLength: chunk.bytes.byteLength,
    bytesVerified: context.bytesVerified,
    chunksFetched: context.chunksFetched,
    chunksVerified: context.chunksVerified,
    ...(context.totalBytes === undefined ? {} : { totalBytes: context.totalBytes })
  });
}

function emitSocVerifiedProgress(
  context: TreeContext,
  reference: SwarmReference,
  url: string,
  byteLength: number,
  update: FeedUpdateVerificationResult
): void {
  context.onProgress?.({
    type: "socVerified",
    reference,
    url,
    byteLength,
    bytesVerified: context.bytesVerified,
    chunksFetched: context.chunksFetched,
    chunksVerified: context.chunksVerified,
    identifier: update.identifier,
    owner: update.owner,
    ...(context.totalBytes === undefined ? {} : { totalBytes: context.totalBytes })
  });
}

function emitBytesEnqueuedProgress(context: TreeContext, reference: SwarmReference, byteLength: number): void {
  context.bytesVerified += byteLength;
  context.onProgress?.({
    type: "bytesEnqueued",
    reference,
    byteLength,
    bytesVerified: context.bytesVerified,
    chunksFetched: context.chunksFetched,
    chunksVerified: context.chunksVerified,
    ...(context.totalBytes === undefined ? {} : { totalBytes: context.totalBytes })
  });
}

function emitCompleteProgress(
  context: TreeContext,
  response: { contentHash: HexHash; reference: SwarmReference }
): void {
  context.onProgress?.({
    type: "complete",
    reference: response.reference,
    bytesVerified: context.bytesVerified,
    chunksFetched: context.chunksFetched,
    chunksVerified: context.chunksVerified,
    contentHash: response.contentHash,
    totalBytes: context.totalBytes ?? context.bytesVerified
  });
}

async function fetchVerifiedTree(reference: SwarmReference, context: GatewayTreeContext): Promise<TreeFetchResult> {
  const treeContext = context as GatewayTreeContext & {
    readChunk(reference: SwarmReference): Promise<VerifiedChunkResponse>;
  };
  treeContext.readChunk = async (childReference) => fetchAndVerifyChunk(childReference, context);
  return readVerifiedTree(reference, treeContext);
}

async function fetchVerifiedFeedUpdateWithContext(
  target: ParsedFeedTarget,
  context: GatewayTreeContext
): Promise<FeedUpdateVerificationResult> {
  const topic = normalizeFeedTopic(target.topic);
  const index = target.index ?? (await fetchLatestFeedIndex(target.owner, topic, context));
  const reference = feedUpdateReference(target.owner, topic, index);
  return fetchAndVerifyFeedUpdate(reference, target.owner, topic, index, context);
}

async function fetchAndVerifyFeedUpdate(
  reference: SwarmReference,
  owner: HexInput,
  topic: Uint8Array,
  index: FeedIndexInput,
  context: GatewayTreeContext
): Promise<FeedUpdateVerificationResult> {
  if (context.gatewayStrategy === "race" && context.gatewayUrls.length > 1) {
    const race = createRaceAbortScope(context.signal);

    try {
      const update = await Promise.any(
        context.gatewayUrls.map((gatewayUrl) =>
          fetchAndVerifyFeedUpdateWithRetry(reference, owner, topic, index, context, gatewayUrl, race.signal)
        )
      );
      race.abort(new SwarmAbortError("A faster verified feed update was accepted."));
      return update;
    } catch (error) {
      const abortError = abortErrorFromSignal(context.signal);

      if (abortError) {
        throw abortError;
      }

      throw new SwarmGatewayError(`All Swarm gateways failed for feed update ${reference}.`, {
        cause: error,
        status: 0,
        statusText: "All Gateways Failed"
      });
    } finally {
      race.cleanup();
    }
  }

  let lastError: unknown;

  for (const gatewayUrl of context.gatewayUrls) {
    try {
      return await fetchAndVerifyFeedUpdateWithRetry(reference, owner, topic, index, context, gatewayUrl);
    } catch (error) {
      const abortError = abortErrorFromSignal(context.signal);

      if (abortError) {
        throw abortError;
      }

      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new SwarmGatewayError(`All Swarm gateways failed for feed update ${reference}.`, {
    cause: lastError,
    status: 0,
    statusText: "All Gateways Failed"
  });
}

async function fetchAndVerifyFeedUpdateWithRetry(
  reference: SwarmReference,
  owner: HexInput,
  topic: Uint8Array,
  index: FeedIndexInput,
  context: GatewayTreeContext,
  gatewayUrl: string,
  signal = context.signal
): Promise<FeedUpdateVerificationResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= context.retry.attempts; attempt += 1) {
    try {
      const raw = await fetchRawChunkOnce(reference, context, gatewayUrl, signal);
      const update = verifyFeedUpdate(reference, raw.bytes, {
        owner,
        topic,
        index,
        payload: "reference",
        url: raw.url
      });
      context.chunksVerified += 1;
      emitSocVerifiedProgress(context, reference, raw.url, raw.bytes.byteLength, update);
      return update;
    } catch (error) {
      const abortError = abortErrorFromSignal(signal);

      if (abortError) {
        throw abortError;
      }

      lastError = error;

      if (attempt < context.retry.attempts) {
        await sleep(retryDelay(context.retry, attempt), signal);
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new SwarmGatewayError(`Swarm gateway failed for feed update ${reference}.`, {
    cause: lastError,
    status: 0,
    statusText: "Gateway Failed",
    url: `${gatewayUrl}/chunks/${reference}`
  });
}

function feedMetadataFromUpdate(update: FeedUpdateVerificationResult): VerifiedFeedMetadata {
  return {
    type: update.type,
    owner: update.owner,
    topic: update.topic,
    index: update.index,
    identifier: update.identifier,
    updateReference: update.reference,
    ...(update.targetReference === undefined ? {} : { targetReference: update.targetReference }),
    ...(update.timestamp === undefined ? {} : { timestamp: update.timestamp })
  };
}

async function fetchLatestFeedIndex(
  owner: HexInput,
  topic: Uint8Array,
  context: GatewayTreeContext
): Promise<FeedIndexInput> {
  let lastError: unknown;

  for (const gatewayUrl of context.gatewayUrls) {
    try {
      return await fetchLatestFeedIndexWithRetry(owner, topic, context, gatewayUrl);
    } catch (error) {
      const abortError = abortErrorFromSignal(context.signal);

      if (abortError) {
        throw abortError;
      }

      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new SwarmGatewayError("All Swarm gateways failed while resolving the latest feed index.", {
    cause: lastError,
    status: 0,
    statusText: "All Gateways Failed"
  });
}

async function fetchLatestFeedIndexWithRetry(
  owner: HexInput,
  topic: Uint8Array,
  context: GatewayTreeContext,
  gatewayUrl: string
): Promise<FeedIndexInput> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= context.retry.attempts; attempt += 1) {
    try {
      return await fetchLatestFeedIndexOnce(owner, topic, context, gatewayUrl);
    } catch (error) {
      const abortError = abortErrorFromSignal(context.signal);

      if (abortError) {
        throw abortError;
      }

      lastError = error;

      if (attempt < context.retry.attempts) {
        await sleep(retryDelay(context.retry, attempt), context.signal);
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new SwarmGatewayError("Swarm gateway failed while resolving the latest feed index.", {
    cause: lastError,
    status: 0,
    statusText: "Gateway Failed"
  });
}

async function fetchLatestFeedIndexOnce(
  owner: HexInput,
  topic: Uint8Array,
  context: GatewayTreeContext,
  gatewayUrl: string
): Promise<FeedIndexInput> {
  throwIfAborted(context.signal);
  const ownerHex = owner instanceof Uint8Array ? bytesToHex(owner) : normalizeHex(owner);
  const topicHex = bytesToHex(topic);
  const url = `${gatewayUrl}/feeds/${ownerHex}/${topicHex}?Swarm-Only-Root-Chunk=true`;
  const init: FetchOptions = { method: "GET" };

  if (context.headers !== undefined) {
    init.headers = context.headers;
  }

  if (context.signal !== undefined) {
    init.signal = context.signal;
  }

  let response: FetchResponseLike;

  try {
    response = await context.fetch(url, init);
  } catch (error) {
    throw abortErrorFromSignal(context.signal) ?? new SwarmGatewayError(
      `Swarm feed gateway request failed for ${url}.`,
      {
        cause: error,
        status: 0,
        statusText: "Network Error",
        url
      }
    );
  }

  if (!response.ok) {
    throw new SwarmGatewayError(
      `Swarm gateway returned ${response.status} ${response.statusText} for ${url}.`,
      {
        ...previewOption(await responseBodyPreview(response)),
        status: response.status,
        statusText: response.statusText,
        url
      }
    );
  }

  const index = response.headers?.get("swarm-feed-index");

  if (!index) {
    throw new SwarmGatewayError("Swarm feed response did not include swarm-feed-index.", {
      status: response.status,
      statusText: response.statusText,
      url
    });
  }

  return index;
}

async function readVerifiedTree(
  reference: SwarmReference,
  context: TreeContext & { readChunk(reference: SwarmReference): Promise<VerifiedChunkResponse> },
  depth = 0
): Promise<TreeFetchResult> {
  enforceChunkLimit(context);
  throwIfAborted(context.signal);
  const chunk = await context.readChunk(reference);
  context.chunksVerified += 1;
  const span = chunk.verification.span;

  if (depth === 0) {
    resetProgressTree(context, reference, safeNumberFromSpan(span));
  }

  emitChunkVerifiedProgress(context, reference, chunk);

  if (span <= BigInt(SWARM_MAX_PAYLOAD_SIZE)) {
    const length = safeNumberFromSpan(span);

    if (chunk.payload.length < length) {
      throw new SwarmVerificationError(
        `Leaf chunk ${reference} has span ${span.toString()} but only ${chunk.payload.length} payload bytes.`,
        { reference }
      );
    }

    const bytes = chunk.payload.slice(0, length);
    emitBytesEnqueuedProgress(context, reference, bytes.byteLength);

    return {
      bytes,
      span,
      chunksVerified: context.chunksVerified
    };
  }

  if (chunk.payload.length % SWARM_REFERENCE_SIZE !== 0) {
    throw new SwarmVerificationError(
      `Intermediate chunk ${reference} payload is not aligned to 32-byte child references.`,
      { reference }
    );
  }

  const childCapacity = childSpanCapacity(span);
  const expectedChildren = safeNumberFromSpan(ceilDiv(span, childCapacity));
  const availableChildren = chunk.payload.length / SWARM_REFERENCE_SIZE;

  if (expectedChildren !== availableChildren) {
    throw new SwarmVerificationError(
      `Intermediate chunk ${reference} expected exactly ${expectedChildren} children but contained ${availableChildren}.`,
      { reference }
    );
  }

  const children = new Array<Uint8Array>(expectedChildren);

  for (let index = 0; index < expectedChildren; index += 1) {
    throwIfAborted(context.signal);
    const childReference = normalizeSwarmReference(
      bytesToHex(chunk.payload.slice(index * SWARM_REFERENCE_SIZE, (index + 1) * SWARM_REFERENCE_SIZE))
    );
    const child = await readVerifiedTree(childReference, context, depth + 1);
    children[index] = child.bytes;
  }

  const joined = concatBytes(children);
  const outputLength = safeNumberFromSpan(span);

  if (joined.length < outputLength) {
    throw new SwarmVerificationError(
      `Verified child chunks for ${reference} produced ${joined.length} bytes, expected ${span.toString()}.`,
      { reference }
    );
  }

  return {
    bytes: joined.slice(0, outputLength),
    span,
    chunksVerified: context.chunksVerified
  };
}

async function fetchAndVerifyChunk(
  reference: SwarmReference,
  context: GatewayTreeContext
): Promise<VerifiedChunkResponse> {
  if (context.gatewayStrategy === "race" && context.gatewayUrls.length > 1) {
    const race = createRaceAbortScope(context.signal);

    try {
      const chunk = await Promise.any(
        context.gatewayUrls.map((gatewayUrl) =>
          fetchAndVerifyChunkWithRetry(reference, context, gatewayUrl, race.signal)
        )
      );
      race.abort(new SwarmAbortError("A faster verified gateway response was accepted."));
      return chunk;
    } catch (error) {
      const abortError = abortErrorFromSignal(context.signal);

      if (abortError) {
        throw abortError;
      }

      throw new SwarmGatewayError(`All Swarm gateways failed for chunk ${reference}.`, {
        cause: error,
        status: 0,
        statusText: "All Gateways Failed"
      });
    } finally {
      race.cleanup();
    }
  }

  let lastError: unknown;

  for (const gatewayUrl of context.gatewayUrls) {
    try {
      return await fetchAndVerifyChunkWithRetry(reference, context, gatewayUrl);
    } catch (error) {
      const abortError = abortErrorFromSignal(context.signal);

      if (abortError) {
        throw abortError;
      }

      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new SwarmGatewayError(`All Swarm gateways failed for chunk ${reference}.`, {
    cause: lastError,
    status: 0,
    statusText: "All Gateways Failed"
  });
}

async function fetchAndVerifyChunkWithRetry(
  reference: SwarmReference,
  context: GatewayTreeContext,
  gatewayUrl: string,
  signal = context.signal
): Promise<VerifiedChunkResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= context.retry.attempts; attempt += 1) {
    try {
      return await fetchAndVerifyChunkOnce(reference, context, gatewayUrl, signal);
    } catch (error) {
      const abortError = abortErrorFromSignal(signal);

      if (abortError) {
        throw abortError;
      }

      lastError = error;

      if (attempt < context.retry.attempts) {
        await sleep(retryDelay(context.retry, attempt), signal);
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new SwarmGatewayError(`Swarm gateway failed for chunk ${reference}.`, {
    cause: lastError,
    status: 0,
    statusText: "Gateway Failed",
    url: `${gatewayUrl}/chunks/${reference}`
  });
}

function retryDelay(retry: Required<RetryOptions>, attempt: number): number {
  const exponentialDelay = retry.baseDelayMs * retry.factor ** (attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, retry.maxDelayMs);

  if (!retry.jitter || cappedDelay === 0) {
    return cappedDelay;
  }

  return Math.round(cappedDelay * (0.5 + Math.random() * 0.5));
}

async function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);

  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);

    const abort = () => {
      clearTimeout(timeout);
      reject(abortErrorFromSignal(signal));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function fetchAndVerifyChunkOnce(
  reference: SwarmReference,
  context: GatewayTreeContext,
  gatewayUrl: string,
  signal = context.signal
): Promise<VerifiedChunkResponse> {
  const raw = await fetchRawChunkOnce(reference, context, gatewayUrl, signal);
  return verifySwarmChunk(reference, raw.bytes, {
    ...(signal === undefined ? {} : { signal }),
    url: raw.url
  });
}

interface GatewayChunkBytes {
  bytes: Uint8Array;
  url: string;
}

async function fetchRawChunk(reference: SwarmReference, context: GatewayTreeContext): Promise<GatewayChunkBytes> {
  if (context.gatewayStrategy === "race" && context.gatewayUrls.length > 1) {
    const race = createRaceAbortScope(context.signal);

    try {
      const chunk = await Promise.any(
        context.gatewayUrls.map((gatewayUrl) =>
          fetchRawChunkWithRetry(reference, context, gatewayUrl, race.signal)
        )
      );
      race.abort(new SwarmAbortError("A faster gateway response was accepted."));
      return chunk;
    } catch (error) {
      const abortError = abortErrorFromSignal(context.signal);

      if (abortError) {
        throw abortError;
      }

      throw new SwarmGatewayError(`All Swarm gateways failed for chunk ${reference}.`, {
        cause: error,
        status: 0,
        statusText: "All Gateways Failed"
      });
    } finally {
      race.cleanup();
    }
  }

  let lastError: unknown;

  for (const gatewayUrl of context.gatewayUrls) {
    try {
      return await fetchRawChunkWithRetry(reference, context, gatewayUrl);
    } catch (error) {
      const abortError = abortErrorFromSignal(context.signal);

      if (abortError) {
        throw abortError;
      }

      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new SwarmGatewayError(`All Swarm gateways failed for chunk ${reference}.`, {
    cause: lastError,
    status: 0,
    statusText: "All Gateways Failed"
  });
}

async function fetchRawChunkWithRetry(
  reference: SwarmReference,
  context: GatewayTreeContext,
  gatewayUrl: string,
  signal = context.signal
): Promise<GatewayChunkBytes> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= context.retry.attempts; attempt += 1) {
    try {
      return await fetchRawChunkOnce(reference, context, gatewayUrl, signal);
    } catch (error) {
      const abortError = abortErrorFromSignal(signal);

      if (abortError) {
        throw abortError;
      }

      lastError = error;

      if (attempt < context.retry.attempts) {
        await sleep(retryDelay(context.retry, attempt), signal);
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new SwarmGatewayError(`Swarm gateway failed for chunk ${reference}.`, {
    cause: lastError,
    status: 0,
    statusText: "Gateway Failed",
    url: `${gatewayUrl}/chunks/${reference}`
  });
}

async function fetchRawChunkOnce(
  reference: SwarmReference,
  context: GatewayTreeContext,
  gatewayUrl: string,
  signal = context.signal
): Promise<GatewayChunkBytes> {
  throwIfAborted(signal);
  const url = `${gatewayUrl}/chunks/${reference}`;
  const init: FetchOptions = { method: "GET" };

  if (context.headers !== undefined) {
    init.headers = context.headers;
  }

  if (signal !== undefined) {
    init.signal = signal;
  }

  let response: FetchResponseLike;

  try {
    response = await context.fetch(url, init);
  } catch (error) {
    throw abortErrorFromSignal(signal) ?? new SwarmGatewayError(
      `Swarm gateway request failed for ${url}.`,
      {
        cause: error,
        status: 0,
        statusText: "Network Error",
        url
      }
    );
  }

  if (!response.ok) {
    throw new SwarmGatewayError(
      `Swarm gateway returned ${response.status} ${response.statusText} for ${url}.`,
      {
        ...previewOption(await responseBodyPreview(response)),
        status: response.status,
        statusText: response.statusText,
        url
      }
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  throwIfAborted(signal);
  context.chunksFetched += 1;
  emitChunkFetchedProgress(context, reference, url, bytes.byteLength);
  return { bytes, url };
}

async function* streamVerifiedTreeFromChunk(
  reference: SwarmReference,
  chunk: VerifiedChunkResponse,
  context: GatewayTreeContext,
  hasher: Keccak256Hasher
): AsyncGenerator<Uint8Array> {
  throwIfAborted(context.signal);
  const span = chunk.verification.span;

  if (span <= BigInt(SWARM_MAX_PAYLOAD_SIZE)) {
    const length = safeNumberFromSpan(span);

    if (chunk.payload.length < length) {
      throw new SwarmVerificationError(
        `Leaf chunk ${reference} has span ${span.toString()} but only ${chunk.payload.length} payload bytes.`,
        { reference }
      );
    }

    const bytes = chunk.payload.slice(0, length);
    hasher.update(bytes);
    emitBytesEnqueuedProgress(context, reference, bytes.byteLength);
    yield bytes;
    return;
  }

  if (chunk.payload.length % SWARM_REFERENCE_SIZE !== 0) {
    throw new SwarmVerificationError(
      `Intermediate chunk ${reference} payload is not aligned to 32-byte child references.`,
      { reference }
    );
  }

  const childCapacity = childSpanCapacity(span);
  const expectedChildren = safeNumberFromSpan(ceilDiv(span, childCapacity));
  const availableChildren = chunk.payload.length / SWARM_REFERENCE_SIZE;

  if (expectedChildren !== availableChildren) {
    throw new SwarmVerificationError(
      `Intermediate chunk ${reference} expected exactly ${expectedChildren} children but contained ${availableChildren}.`,
      { reference }
    );
  }

  for (let index = 0; index < expectedChildren; index += 1) {
    enforceChunkLimit(context);
    throwIfAborted(context.signal);
    const childReference = normalizeSwarmReference(
      bytesToHex(chunk.payload.slice(index * SWARM_REFERENCE_SIZE, (index + 1) * SWARM_REFERENCE_SIZE))
    );
    const child = await fetchAndVerifyChunk(childReference, context);
    context.chunksVerified += 1;
    emitChunkVerifiedProgress(context, childReference, child);
    yield* streamVerifiedTreeFromChunk(childReference, child, context, hasher);
  }
}

function createVerifiedChunkResponse(input: {
  bytes: Uint8Array;
  reference: SwarmReference;
  url: string;
  verification: CacVerificationResult & { verified: true; mode: "cac" };
}): VerifiedChunkResponse {
  const payload = input.bytes.slice(8);

  const response: VerifiedChunkResponse = {
    ok: true,
    status: 200,
    statusText: "OK",
    url: input.url,
    verified: true,
    reference: input.reference,
    bytes: input.bytes,
    payload,
    span: input.verification.span,
    verification: input.verification,
    bodyUsed: false,
    async arrayBuffer() {
      return copyArrayBuffer(payload);
    },
    async text() {
      return new TextDecoder().decode(payload);
    },
    async json<TValue = unknown>() {
      return parseJson<TValue>(await response.text(), {
        reference: input.reference,
        url: input.url
      });
    },
    clone() {
      return createVerifiedChunkResponse(input);
    }
  };

  return response;
}

function createVerifiedBytesResponse(input: {
  bytes: Uint8Array;
  chunksVerified: number;
  expectedHash?: string;
  feed?: VerifiedFeedMetadata;
  manifest?: VerifiedManifestMetadata;
  metadataHints?: MetadataHints;
  reference: SwarmReference;
  span: bigint;
  url: string;
}): VerifiedBytesResponse {
  const bytes = copyBytes(input.bytes);
  const content = contentHash(bytes);
  const expectedHash = input.expectedHash === undefined ? undefined : normalizeHash(input.expectedHash);
  assertByteLengthHint(input.metadataHints, bytes.byteLength, input.reference, input.url);

  if (expectedHash !== undefined && expectedHash !== content) {
    throw new SwarmVerificationError(
      `Verified bytes hash mismatch: expected ${expectedHash}, computed ${content}.`,
      {
        reference: input.reference,
        url: input.url
      }
    );
  }

  const verification = {
    verified: true,
    reference: input.reference,
    span: input.span,
    chunksVerified: input.chunksVerified,
    mode: "cac-tree",
    contentHash: content,
    ...(expectedHash === undefined ? {} : { expectedHash }),
    ...(input.feed === undefined ? {} : { feed: input.feed }),
    ...(input.manifest === undefined ? {} : { manifest: input.manifest })
  } as const;
  const mediaType = detectMediaType(input.metadataHints);
  const metadataDetails = metadataDetailsFromHints(input.metadataHints, mediaType);
  const metadata: VerifiedBytesMetadata = {
    kind: "bytes",
    byteLength: bytes.byteLength,
    chunksVerified: input.chunksVerified,
    contentHash: content,
    ...(input.feed === undefined ? {} : { feed: input.feed }),
    ...metadataDetails,
    ...(input.manifest === undefined ? {} : { manifest: input.manifest, path: input.manifest.path }),
    mediaType,
    reference: input.reference,
    span: input.span
  };

  const response: VerifiedBytesResponse = {
    ok: true,
    status: 200,
    statusText: "OK",
    delivery: "buffer",
    kind: "bytes",
    url: input.url,
    verified: true,
    reference: input.reference,
    bytes,
    span: input.span,
    chunksVerified: input.chunksVerified,
    contentHash: content,
    metadata,
    verification,
    bodyUsed: false,
    async arrayBuffer() {
      return copyArrayBuffer(bytes);
    },
    async blob() {
      return new Blob([copyArrayBuffer(bytes)], {
        type: mediaType.kind === "unknown" ? "" : mediaType.mimeType
      });
    },
    async text() {
      return new TextDecoder().decode(bytes);
    },
    async json<TValue = unknown>() {
      return parseJson<TValue>(await response.text(), {
        reference: input.reference,
        url: input.url
      });
    },
    clone() {
      return createVerifiedBytesResponse(input);
    }
  };

  return response;
}

function parseJson<TValue>(text: string, options: { reference: SwarmReference; url: string }): TValue {
  try {
    return JSON.parse(text) as TValue;
  } catch (error) {
    throw new SwarmJsonError("Verified Swarm response body is not valid JSON.", {
      cause: error,
      reference: options.reference,
      url: options.url
    });
  }
}

interface MetadataHints {
  byteLength?: number;
  contentType?: string;
  fileName?: string;
  lastModified?: string;
  url?: string;
}

function metadataHintsFromOptions(options: VerifiedFetchOptions, url: string): MetadataHints {
  return {
    ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
    ...(options.fileName === undefined ? {} : { fileName: options.fileName }),
    url
  };
}

function metadataHintsFromOptionsAndManifest(
  options: VerifiedFetchOptions,
  url: string,
  resolved: ResolvedMantarayPath
): MetadataHints {
  const contentType =
    options.contentType ??
    resolved.metadata?.["Content-Type"] ??
    resolved.metadata?.["content-type"];
  const fileName =
    options.fileName ??
    resolved.metadata?.["Filename"] ??
    resolved.metadata?.["filename"] ??
    resolved.path.split("/").filter(Boolean).at(-1);
  const lastModified =
    resolved.metadata?.["Last-Modified"] ??
    resolved.metadata?.["last-modified"] ??
    resolved.metadata?.["mtime"] ??
    resolved.metadata?.["createdAt"] ??
    resolved.metadata?.["updatedAt"];
  const byteLength = byteLengthFromManifestMetadata(resolved.metadata);

  return {
    ...(byteLength === undefined ? {} : { byteLength }),
    ...(contentType === undefined ? {} : { contentType }),
    ...(fileName === undefined ? {} : { fileName }),
    ...(lastModified === undefined ? {} : { lastModified }),
    url
  };
}

function byteLengthFromManifestMetadata(metadata: Record<string, string> | null): number | undefined {
  const raw =
    metadata?.["Content-Length"] ??
    metadata?.["content-length"] ??
    metadata?.["Size"] ??
    metadata?.["size"] ??
    metadata?.["FileSize"] ??
    metadata?.["fileSize"] ??
    metadata?.["filesize"];

  if (raw === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(raw)) {
    throw new SwarmVerificationError(`Verified manifest declared invalid byte length metadata: ${raw}.`);
  }

  const byteLength = Number(raw);

  if (!Number.isSafeInteger(byteLength)) {
    throw new SwarmVerificationError(`Verified manifest byte length metadata exceeds Number.MAX_SAFE_INTEGER: ${raw}.`);
  }

  return byteLength;
}

function assertByteLengthHint(
  hints: MetadataHints | undefined,
  actualByteLength: number,
  reference: SwarmReference,
  url: string
): void {
  if (hints?.byteLength === undefined || hints.byteLength === actualByteLength) {
    return;
  }

  throw new SwarmVerificationError(
    `Verified manifest byte length mismatch: manifest declared ${hints.byteLength}, target verified ${actualByteLength}.`,
    {
      reference,
      url
    }
  );
}

function metadataDetailsFromHints(
  hints: MetadataHints | undefined,
  mediaType: VerifiedMediaType
): {
  fileName?: string;
  lastModified?: string;
  mimeType?: string;
} {
  return {
    ...(hints?.fileName === undefined ? {} : { fileName: hints.fileName }),
    ...(hints?.lastModified === undefined ? {} : { lastModified: hints.lastModified }),
    ...(mediaType.kind === "unknown" ? {} : { mimeType: mediaType.mimeType })
  };
}

function detectMediaType(hints: MetadataHints | undefined): VerifiedMediaType {
  const contentType = normalizeContentType(hints?.contentType);

  if (contentType !== undefined) {
    return classifyMimeType(contentType, "content-type");
  }

  const fileName = hints?.fileName ?? fileNameFromUrl(hints?.url);
  const extension = extensionFromFileName(fileName);
  const mimeType = extension === undefined ? undefined : mimeTypeFromExtension(extension);

  if (mimeType === undefined) {
    return {
      kind: "unknown",
      source: "none"
    };
  }

  return classifyMimeType(mimeType, "file-name", extension);
}

function classifyMimeType(
  mimeType: string,
  source: "content-type" | "file-name",
  extension?: string
): Exclude<VerifiedMediaType, { kind: "unknown" }> {
  const normalized = mimeType.toLowerCase();
  const details = {
    ...(extension === undefined ? {} : { extension }),
    mimeType,
    source
  };

  if (normalized === "application/json" || normalized.endsWith("+json")) {
    return {
      ...details,
      kind: "json"
    };
  }

  if (
    normalized.startsWith("text/") ||
    normalized === "application/javascript" ||
    normalized === "application/xml" ||
    normalized.endsWith("+xml")
  ) {
    return {
      ...details,
      kind: "text"
    };
  }

  return {
    ...details,
    kind: "binary"
  };
}

function normalizeContentType(contentType: string | undefined): string | undefined {
  if (contentType === undefined) {
    return undefined;
  }

  const [mimeType] = contentType.split(";");
  const normalized = mimeType?.trim().toLowerCase();
  return normalized === "" || normalized === undefined ? undefined : normalized;
}

function fileNameFromUrl(value: string | undefined): string | undefined {
  if (value === undefined || !isHttpUrl(value)) {
    return undefined;
  }

  const url = new URL(value);
  const last = url.pathname.split("/").filter(Boolean).at(-1);
  return last && last.includes(".") ? last : undefined;
}

function extensionFromFileName(fileName: string | undefined): string | undefined {
  if (fileName === undefined) {
    return undefined;
  }

  const lastDot = fileName.lastIndexOf(".");

  if (lastDot < 0 || lastDot === fileName.length - 1) {
    return undefined;
  }

  return fileName.slice(lastDot + 1).toLowerCase();
}

function mimeTypeFromExtension(extension: string): string | undefined {
  switch (extension) {
    case "json":
      return "application/json";
    case "txt":
      return "text/plain";
    case "md":
    case "markdown":
      return "text/markdown";
    case "html":
      return "text/html";
    case "css":
      return "text/css";
    case "csv":
      return "text/csv";
    case "js":
    case "mjs":
      return "application/javascript";
    case "svg":
      return "image/svg+xml";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return undefined;
  }
}

function contentHash(bytes: Uint8Array): HexHash {
  return hexHashFromBytes(keccak256(bytes));
}

function hexHashFromBytes(bytes: Uint8Array): HexHash {
  return `0x${bytesToHex(bytes)}` as HexHash;
}

function chunkSourceFromOptions(options: VerifyBytesOptions): SwarmChunkSource {
  if (options.getChunk !== undefined) {
    return options.getChunk;
  }

  const chunks = options.chunks;

  if (chunks === undefined) {
    throw new SwarmInputError("verifySwarmBytes requires options.getChunk or options.chunks.");
  }

  return async (reference) => {
    const chunk = isChunkMap(chunks) ? chunks.get(reference) : chunks[reference];

    if (!chunk) {
      throw new SwarmGatewayError(`Manual chunk source did not include ${reference}.`, {
        status: 404,
        statusText: "Missing Chunk",
        reference,
        url: `swarm-chunk://${reference}`
      });
    }

    return chunk;
  };
}

function isChunkMap(value: VerifyBytesOptions["chunks"]): value is ReadonlyMap<string, Uint8Array> {
  return typeof (value as ReadonlyMap<string, Uint8Array>).get === "function";
}

function childSpanCapacity(span: bigint): bigint {
  let capacity = BigInt(SWARM_MAX_PAYLOAD_SIZE);

  while (span > capacity) {
    capacity *= BigInt(SWARM_BRANCHING_FACTOR);
  }

  return capacity / BigInt(SWARM_BRANCHING_FACTOR);
}

function ceilDiv(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

function safeNumberFromSpan(span: bigint): number {
  if (span > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SwarmVerificationError(`Span ${span.toString()} exceeds Number.MAX_SAFE_INTEGER.`);
  }

  return Number(span);
}

function enforceChunkLimit(context: TreeContext): void {
  const maxChunks = context.maxChunks ?? 4096;

  if (context.chunksVerified >= maxChunks) {
    throw new SwarmVerificationError(`Verified chunk limit exceeded (${maxChunks}).`);
  }
}

function resolveFetch(fetchImpl: FetchLike | undefined): FetchLike {
  const resolved = fetchImpl ?? globalThis.fetch?.bind(globalThis);

  if (!resolved) {
    throw new SwarmInputError("No fetch implementation available. Pass options.fetch explicitly.");
  }

  return resolved as FetchLike;
}

function assertGetMethod(method: string | undefined): void {
  if (method !== undefined && method.toUpperCase() !== "GET") {
    throw new SwarmInputError("Swarm verified fetch only supports GET requests.");
  }
}

interface AbortScope {
  cleanup(): void;
  signal?: AbortSignal;
}

interface RaceAbortScope {
  abort(reason?: unknown): void;
  cleanup(): void;
  signal: AbortSignal;
}

function createAbortScope(options: VerifiedFetchOptions): AbortScope {
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new SwarmInputError("timeoutMs must be a positive number.");
  }

  if (options.signal === undefined && options.timeoutMs === undefined && options.cancelToken === undefined) {
    return {
      cleanup() {
        // Nothing to clean up.
      }
    };
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cleanups: Array<() => void> = [];

  const abortWith = (reason?: unknown) => {
    if (!controller.signal.aborted) {
      controller.abort(normalizeCancellationReason(reason));
    }
  };

  const abortFromSignal = () => {
    abortWith(options.signal?.reason);
  };

  if (options.signal?.aborted) {
    abortFromSignal();
  } else {
    options.signal?.addEventListener("abort", abortFromSignal, { once: true });
    cleanups.push(() => options.signal?.removeEventListener("abort", abortFromSignal));
  }

  wireCancelToken(options.cancelToken, abortWith, cleanups);

  if (options.timeoutMs !== undefined) {
    timeout = setTimeout(() => {
      abortWith(new SwarmTimeoutError(options.timeoutMs as number));
    }, options.timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    }
  };
}

function createRaceAbortScope(parent: AbortSignal | undefined): RaceAbortScope {
  const controller = new AbortController();

  const abortFromParent = () => {
    if (!controller.signal.aborted) {
      controller.abort(parent?.reason);
    }
  };

  if (parent?.aborted) {
    abortFromParent();
  } else {
    parent?.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    abort(reason?: unknown) {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    },
    cleanup() {
      parent?.removeEventListener("abort", abortFromParent);
    },
    signal: controller.signal
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  const error = abortErrorFromSignal(signal);

  if (error) {
    throw error;
  }
}

function abortErrorFromSignal(signal: AbortSignal | undefined): SwarmAbortError | SwarmTimeoutError | undefined {
  if (!signal?.aborted) {
    return undefined;
  }

  if (signal.reason instanceof SwarmTimeoutError) {
    return signal.reason;
  }

  if (signal.reason instanceof SwarmAbortError) {
    return signal.reason;
  }

  return new SwarmAbortError("Swarm verified fetch was aborted.", {
    cause: signal.reason
  });
}

function wireCancelToken(
  token: CancellationTokenLike | undefined,
  abort: CancellationListener,
  cleanups: Array<() => void>
): void {
  if (token === undefined) {
    return;
  }

  if (isPromiseLike(token)) {
    void token.then(abort, abort);
    return;
  }

  try {
    token.throwIfRequested?.();
  } catch (error) {
    abort(error);
    return;
  }

  if (token.aborted === true || token.canceled === true || token.cancelled === true) {
    abort(token.reason);
    return;
  }

  const promise = token.promise;

  if (promise !== undefined) {
    void promise.then(abort, abort);
  }

  cleanups.push(cleanupFromSubscription(token.onCancellationRequested?.(abort)));
  cleanups.push(cleanupFromSubscription(token.subscribe?.(abort)));
}

function cleanupFromSubscription(subscription: CancellationSubscription): () => void {
  if (typeof subscription === "function") {
    return subscription;
  }

  if (subscription === undefined) {
    return () => {
      // No subscription was registered.
    };
  }

  if ("dispose" in subscription) {
    return () => subscription.dispose();
  }

  return () => subscription.unsubscribe();
}

function normalizeCancellationReason(reason: unknown): SwarmAbortError | SwarmTimeoutError {
  if (reason instanceof SwarmTimeoutError) {
    return reason;
  }

  if (reason instanceof SwarmAbortError) {
    return reason;
  }

  return new SwarmAbortError("Swarm verified fetch was aborted.", {
    cause: reason
  });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown>).then === "function";
}

async function responseBodyPreview(response: FetchResponseLike): Promise<string | undefined> {
  try {
    if (response.text !== undefined) {
      return truncatePreview(await response.text());
    }

    return truncatePreview(new TextDecoder().decode(await response.arrayBuffer()));
  } catch {
    return undefined;
  }
}

function truncatePreview(value: string): string {
  return value.length <= 512 ? value : `${value.slice(0, 512)}...`;
}

function previewOption(bodyPreview: string | undefined): { bodyPreview?: string } {
  return bodyPreview === undefined ? {} : { bodyPreview };
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output;
}
