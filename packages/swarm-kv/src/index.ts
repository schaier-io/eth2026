import {
  DEFAULT_SWARM_GATEWAY_URL,
  bytesToHex,
  createSwarmVerifiedFetch,
  hexToBytes,
  keccak256,
  makeContentAddressedChunk,
  normalizeHex,
  type SwarmVerifiedFetchClient,
  type VerifiedBytesResponse
} from "@truth-market/swarm-verified-fetch";

import {
  SwarmKvAbortError,
  SwarmKvConfigError,
  SwarmKvConflictError,
  SwarmKvCryptoError,
  SwarmKvError,
  SwarmKvFeedError,
  SwarmKvGatewayError,
  SwarmKvIndexError,
  SwarmKvPayloadError,
  SwarmKvPostageError,
  SwarmKvTimeoutError,
  SwarmKvVerificationError
} from "./errors.js";

export {
  SwarmKvAbortError,
  SwarmKvConfigError,
  SwarmKvConflictError,
  SwarmKvCryptoError,
  SwarmKvError,
  SwarmKvFeedError,
  SwarmKvGatewayError,
  SwarmKvIndexError,
  SwarmKvPayloadError,
  SwarmKvPostageError,
  SwarmKvTimeoutError,
  SwarmKvVerificationError
} from "./errors.js";

export const DEFAULT_GATEWAY_URL = DEFAULT_SWARM_GATEWAY_URL;
export const DEFAULT_NAMESPACE = "swarm-kv:v1";
export const INDEX_KEY = "__swarm_kv_index__";
export const INDEX_SCHEMA = "swarm-kv.index.v1";
export const ENCRYPTED_VALUE_SCHEMA = "swarm-kv.encrypted.v1";

const DEFAULT_POSTAGE_AMOUNT = "100000000";
const DEFAULT_POSTAGE_DEPTH = 17;
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;
const DEFAULT_POSTAGE_WAIT_TIMEOUT_MS = 180_000;
const DEFAULT_POSTAGE_WAIT_INTERVAL_MS = 5_000;
const DEFAULT_POSTAGE_TOP_UP_RETRY_INTERVAL_MS = 120_000;
const SWARM_CHUNK_PAYLOAD_SIZE = 4096;
const SWARM_BRANCHING_FACTOR = 128;

export type SwarmReference = string;
export type SwarmKvKey = string;
export type EthereumAddress = `0x${string}`;
export type SwarmKvValue = string | JsonValue | Uint8Array | ArrayBuffer | Blob;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type SwarmKvValueKind = "string" | "json" | "bytes";
export type SwarmKvEncoding = "utf-8" | "json" | "binary";

export interface FetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: string | Uint8Array | ArrayBuffer;
  signal?: AbortSignal;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export type FetchLike = (input: string, init?: FetchOptions) => Promise<FetchResponseLike>;

export interface SwarmKvSigner {
  readonly address?: string;
  getAddress?(): Promise<string> | string;
  signMessage(message: string): Promise<string> | string;
}

export interface PostageBatchPurchaseOptions {
  /**
   * Bee stamp amount passed to POST /stamps/:amount/:depth when no usable
   * configured/local stamp exists.
   */
  amount?: string;
  /**
   * Bee stamp depth passed to POST /stamps/:amount/:depth.
   */
  depth?: number;
  /**
   * Minimum depth for auto-selected existing batches.
   */
  minDepth?: number;
  /**
   * Minimum remaining TTL in seconds for auto-selected existing batches.
   */
  minBatchTTL?: number;
  /**
   * Only auto-select existing batches with this exact Bee label. Also applied
   * as the label query parameter when the library buys a new batch.
   */
  label?: string;
  /**
   * Only auto-select existing batches whose Bee label starts with this prefix.
   */
  labelPrefix?: string;
  /**
   * Last-mile selector for application-owned batches. Return false to exclude
   * a stamp from auto-selection.
   */
  selectBatch?: (stamp: SwarmKvPostageBatchInfo) => boolean;
  /**
   * Top up an otherwise usable batch when its TTL is below this threshold.
   */
  topUpBelowTTL?: number;
  /**
   * Amount passed to PATCH /stamps/topup/:batchID/:amount.
   */
  topUpAmount?: string;
  /**
   * Wait for newly purchased or topped-up batches to become usable.
   */
  waitForUsable?: boolean | { timeoutMs?: number; intervalMs?: number };
  /**
   * Minimum delay before another automatic top-up is attempted for the same
   * batch after Bee accepted one. Prevents duplicate onchain top-up requests
   * while the previous top-up is still propagating.
   */
  topUpRetryIntervalMs?: number;
}

export interface SwarmKvAutoPostageOptions {
  /**
   * Amount used when the library needs to buy a new batch.
   */
  amount?: string;
  /**
   * Depth used when the library needs to buy a new batch.
   */
  depth?: number;
  /**
   * Minimum depth for selecting an existing batch.
   */
  minDepth?: number;
  /**
   * Minimum remaining lifetime in seconds for selecting an existing batch.
   */
  minTTLSeconds?: number;
  /**
   * Only auto-select batches with this exact Bee label. The same label is sent
   * to Bee when buying a new batch.
   */
  label?: string;
  /**
   * Only auto-select batches whose Bee label starts with this prefix.
   */
  labelPrefix?: string;
  /**
   * Last-mile selector for application-owned batches. Return false to exclude
   * a stamp from auto-selection.
   */
  selectBatch?: (stamp: SwarmKvPostageBatchInfo) => boolean;
  /**
   * Top up selected batches whose remaining lifetime is below this threshold.
   */
  topUpBelowTTLSeconds?: number;
  /**
   * Amount used when topping up a low-lifetime batch.
   */
  topUpAmount?: string;
  /**
   * Wait for newly purchased or topped-up batches to become usable.
   */
  waitForUsable?: boolean | { timeoutMs?: number; intervalMs?: number };
  /**
   * Minimum delay before another automatic top-up is attempted for the same
   * batch after Bee accepted one.
   */
  topUpRetryIntervalMs?: number;
}

export interface SwarmKvFixedPostageConfig {
  mode: "fixed";
  batchId: string;
}

export interface SwarmKvAutoPostageConfig extends SwarmKvAutoPostageOptions {
  mode: "auto";
}

export type SwarmKvPostageConfig = SwarmKvFixedPostageConfig | SwarmKvAutoPostageConfig;

export interface SwarmKvIndexFeedOptions {
  /**
   * Enables the stable latest-index pointer. When omitted, `owner` is derived
   * from signer/owner and `topic` is derived from namespace + INDEX_KEY.
   */
  enabled?: boolean;
  /**
   * Feed owner address. Defaults to the configured signer/owner address.
   */
  owner?: string;
  /**
   * 32-byte feed topic. Defaults to topicForKey(INDEX_KEY).
   */
  topic?: string;
  /**
   * Create a feed manifest through Bee the first time the feed is written.
   */
  autoCreateManifest?: boolean;
  /**
   * Read the latest index reference from the feed when rootReference is absent.
   */
  readLatest?: boolean;
  /**
   * Publish each new immutable index reference to the feed after writes.
   */
  writeLatest?: boolean;
}

export interface SwarmKvFeedUpdateInput {
  owner: EthereumAddress;
  topic: string;
  reference: SwarmReference;
  postageBatchId: string;
  beeApiUrl: string;
  gatewayUrl: string;
  previousIndexReference: SwarmReference | null;
  fetch?: FetchLike;
  signal?: AbortSignal;
}

export interface SwarmKvFeedUpdateResult {
  reference?: SwarmReference;
  feedIndex?: string;
  feedIndexNext?: string;
}

export interface SwarmKvFeedWriter {
  updateReference(input: SwarmKvFeedUpdateInput): Promise<SwarmKvFeedUpdateResult>;
}

export interface SwarmKvFeedReadInput {
  owner: EthereumAddress;
  topic: string;
  gatewayUrl: string;
  beeApiUrl?: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
}

export interface SwarmKvFeedReadResult {
  reference: SwarmReference | null;
  verified: boolean;
  feedIndex?: string;
  details?: string;
}

export interface SwarmKvFeedReader {
  readLatestReference(input: SwarmKvFeedReadInput): Promise<SwarmKvFeedReadResult | null>;
}

export interface SwarmKvEncryptionKeyContext {
  namespace: string;
  owner: EthereumAddress;
}

export type SwarmKvEncryptionKeyMaterial = string | Uint8Array | ArrayBuffer | CryptoKey;
export type SwarmKvEncryptionKeyProvider =
  | SwarmKvEncryptionKeyMaterial
  | ((context: SwarmKvEncryptionKeyContext) => Promise<SwarmKvEncryptionKeyMaterial> | SwarmKvEncryptionKeyMaterial);

export interface SwarmKvOperationOptions {
  /**
   * Abort the operation while it is waiting in the write queue, uploading,
   * downloading, waiting for postage, or calling pluggable adapters that honor
   * the signal.
   */
  signal?: AbortSignal;
  /**
   * Abort the operation after this many milliseconds. Per-call values override
   * the store-level timeoutMs option.
   */
  timeoutMs?: number;
}

export interface SwarmKvClientOptions {
  /**
   * Read gateway used by clients that do not run a local Bee node.
   */
  gatewayUrl?: string;
  /**
   * Optional local Bee API used for writes and development workflows.
   */
  beeApiUrl?: string;
  /**
   * Decode gzipped Bee JSON responses even when a gateway forgets the
   * Content-Encoding header. Defaults to true for public gateway
   * compatibility. Set false to require strict plain JSON responses.
   */
  decodeGzippedBeeJson?: boolean;
  /**
   * Easy postage configuration. Prefer `fixedPostage(...)` or
   * `autoPostage(...)` for new code.
   */
  postage?: SwarmKvPostageConfig;
  /**
   * Bee postage batch id used when uploading data.
   *
   * @deprecated Prefer `postage: fixedPostage(batchId)`.
   */
  postageBatchId?: string;
  /**
   * Buy or discover a postage batch automatically when postageBatchId is not
   * supplied. A funded Bee node is still required for real purchases.
   *
   * @deprecated Prefer `postage: autoPostage(options)`.
   */
  autoBuyPostageBatch?: boolean | PostageBatchPurchaseOptions;
  /**
   * Logical database namespace. It scopes index encryption and key topics.
   */
  namespace?: string;
  /**
   * Latest index reference. Pass this when reopening a database from a known
   * immutable Swarm index reference.
   */
  rootReference?: SwarmReference;
  /**
   * Stable feed pointer for the latest immutable index. Pass true for the
   * default owner/topic derived from signer/owner + namespace.
   */
  indexFeed?: boolean | SwarmKvIndexFeedOptions;
  /**
   * Writes feed updates. SOC feed writes require signing, so this package keeps
   * the writer pluggable while hiding feed details from app-level get/put code.
   */
  feedWriter?: SwarmKvFeedWriter;
  /**
   * Reads and verifies the latest index feed update. Raw gateway feed reads are
   * intentionally not trusted by default because feed updates are signed SOCs.
   */
  feedReader?: SwarmKvFeedReader;
  /**
   * Ethereum account that owns this database. If signer is supplied, the signer
   * address wins.
   */
  owner?: string;
  /**
   * Optional Ethereum signer. Private writes use `encryptionKey` by default.
   * Signer-derived encryption is available only when
   * `allowSignerDerivedEncryption` is explicitly enabled.
   */
  signer?: SwarmKvSigner;
  /**
   * Stable encryption key material for private stores. Use this when the
   * configured wallet or KMS may produce non-deterministic signatures for the
   * same message.
  */
  encryptionKey?: SwarmKvEncryptionKeyProvider;
  /**
   * Opt in to deriving the private-store AES key from signer.signMessage().
   * Disabled by default because Ethereum JSON-RPC does not guarantee stable
   * signatures for the same message across every wallet or KMS.
   */
  allowSignerDerivedEncryption?: boolean;
  /**
   * Private mode encrypts the index and values before uploading them. Defaults
   * to true.
   */
  privateByDefault?: boolean;
  /**
   * Pin uploaded values/indexes on the local Bee node.
   */
  pin?: boolean;
  /**
   * Maximum plaintext value size accepted by put().
   */
  maxPayloadBytes?: number;
  /**
   * Maximum verified Swarm chunks followed during a get().
   */
  maxVerifiedChunks?: number;
  /**
   * Default timeout for public operations. Override per call with timeoutMs.
   */
  timeoutMs?: number;
  /**
   * Override fetch for tests, browser adapters, or custom runtimes.
   */
  fetch?: FetchLike;
  /**
   * Test hook for deterministic timestamps.
   */
  now?: () => Date;
}

export interface PutOptions extends SwarmKvOperationOptions {
  contentType?: string;
  private?: boolean;
  pin?: boolean;
  /**
   * Optimistic write guard. If supplied, the currently loaded index reference
   * must match this value before the write is accepted.
   */
  ifIndexReference?: SwarmReference | null;
}

export interface GetOptions extends SwarmKvOperationOptions {
  /**
   * Fetch a specific immutable value reference instead of resolving through the
   * current index. Useful for old revisions or low-level migrations.
   */
  reference?: SwarmReference;
  expectedContentType?: string;
}

export interface DeleteOptions extends SwarmKvOperationOptions {
  ifIndexReference?: SwarmReference | null;
}

export interface VerificationResult {
  verified: boolean;
  reference: SwarmReference;
  computedReference: SwarmReference;
  algorithm: "swarm-cac-tree";
  chunksVerified?: number;
  details?: string;
}

export interface PostageBatchResult {
  batchId: string;
  source: "configured" | "existing" | "purchased";
  depth?: number;
  amount?: string;
  label?: string;
  batchTTL?: number;
  utilization?: number;
  toppedUp?: boolean;
}

export interface SwarmKvPostageBatchInfo {
  batchId: string;
  usable: boolean;
  exists: boolean;
  expired: boolean;
  depth: number;
  amount: string;
  batchTTL: number;
  utilization: number;
  label?: string;
}

export interface PutResult {
  key: SwarmKvKey;
  reference: SwarmReference;
  indexReference: SwarmReference;
  contentType: string;
  kind: SwarmKvValueKind;
  encrypted: boolean;
  topic: string;
  verification: VerificationResult;
  indexVerification: VerificationResult;
  postageBatch: PostageBatchResult;
}

export interface GetResult<TValue = unknown> {
  key: SwarmKvKey;
  reference: SwarmReference;
  value: TValue;
  bytes: Uint8Array;
  contentType: string;
  kind: SwarmKvValueKind;
  encrypted: boolean;
  topic: string;
  updatedAt?: string;
  verification: VerificationResult;
}

export interface StringGetResult extends GetResult<string> {
  kind: "string";
  value: string;
}

export interface JsonGetResult<TValue extends JsonValue = JsonValue> extends GetResult<TValue> {
  kind: "json";
  value: TValue;
}

export interface BytesGetResult extends GetResult<Uint8Array> {
  kind: "bytes";
  value: Uint8Array;
}

export type SwarmKvGetResult<TJson extends JsonValue = JsonValue> =
  | StringGetResult
  | JsonGetResult<TJson>
  | BytesGetResult;

export interface DeleteResult {
  key: SwarmKvKey;
  deleted: boolean;
  indexReference: SwarmReference | null;
  previousReference?: SwarmReference;
  indexVerification?: VerificationResult;
  postageBatch?: PostageBatchResult;
}

export interface FeedManifestResult {
  key: SwarmKvKey;
  owner: EthereumAddress;
  topic: string;
  manifestReference: SwarmReference;
  postageBatch: PostageBatchResult;
}

export interface SwarmKvIndexFeedInfo {
  owner: EthereumAddress;
  topic: string;
  latestReference: SwarmReference | null;
  manifestReference?: SwarmReference;
}

export interface SwarmKvIndexEntry {
  key: SwarmKvKey;
  reference: SwarmReference;
  contentType: string;
  kind: SwarmKvValueKind;
  encoding: SwarmKvEncoding;
  encrypted: boolean;
  size: number;
  updatedAt: string;
  topic: string;
  version: number;
}

export interface SwarmKvTombstone {
  key: SwarmKvKey;
  deletedAt: string;
  previousReference?: SwarmReference;
  topic: string;
}

export interface SwarmKvIndexDocument {
  schema: typeof INDEX_SCHEMA;
  namespace: string;
  revision: number;
  updatedAt: string;
  entries: Record<string, SwarmKvIndexEntry>;
  tombstones: Record<string, SwarmKvTombstone>;
  owner?: EthereumAddress;
  previousReference?: SwarmReference;
}

export interface SwarmKvStore {
  readonly options: Readonly<NormalizedSwarmKvClientOptions>;
  readonly indexReference: SwarmReference | null;
  put<TValue extends SwarmKvValue>(
    key: SwarmKvKey,
    value: TValue,
    options?: PutOptions
  ): Promise<PutResult>;
  get(
    key: SwarmKvKey,
    optionsOrReference?: GetOptions | SwarmReference
  ): Promise<SwarmKvGetResult | null>;
  get<TValue>(
    key: SwarmKvKey,
    optionsOrReference?: GetOptions | SwarmReference
  ): Promise<GetResult<TValue> | null>;
  getString(key: SwarmKvKey, optionsOrReference?: GetOptions | SwarmReference): Promise<string | null>;
  getJson<TValue = JsonValue>(
    key: SwarmKvKey,
    optionsOrReference?: GetOptions | SwarmReference
  ): Promise<TValue | null>;
  getBytes(key: SwarmKvKey, optionsOrReference?: GetOptions | SwarmReference): Promise<Uint8Array | null>;
  delete(key: SwarmKvKey, options?: DeleteOptions): Promise<DeleteResult>;
  has(key: SwarmKvKey, options?: SwarmKvOperationOptions): Promise<boolean>;
  list(options?: SwarmKvOperationOptions): Promise<SwarmKvKey[]>;
  entries(options?: SwarmKvOperationOptions): AsyncIterable<SwarmKvGetResult>;
  entries<TValue>(options?: SwarmKvOperationOptions): AsyncIterable<GetResult<TValue>>;
  ensurePostageBatch(options?: SwarmKvOperationOptions): Promise<PostageBatchResult>;
  createFeedManifest(key?: SwarmKvKey, options?: SwarmKvOperationOptions): Promise<FeedManifestResult>;
  getIndexFeedInfo(options?: SwarmKvOperationOptions): Promise<SwarmKvIndexFeedInfo | null>;
  topicForKey(key: SwarmKvKey): string;
  verify(reference: SwarmReference, bytes: Uint8Array): Promise<VerificationResult>;
}

export type NormalizedSwarmKvClientOptions = Omit<
  SwarmKvClientOptions,
  | "gatewayUrl"
  | "beeApiUrl"
  | "namespace"
  | "privateByDefault"
  | "pin"
  | "maxPayloadBytes"
  | "decodeGzippedBeeJson"
  | "indexFeed"
  | "postage"
  | "postageBatchId"
  | "autoBuyPostageBatch"
> & {
  gatewayUrl: string;
  namespace: string;
  privateByDefault: boolean;
  pin: boolean;
  maxPayloadBytes: number;
  decodeGzippedBeeJson: boolean;
  postageMode: "none" | "manual" | "auto";
  fetch?: FetchLike;
  beeApiUrl?: string;
  postageBatchId?: string;
  autoBuyPostageBatch?: PostageBatchPurchaseOptions;
  indexFeed?: NormalizedSwarmKvIndexFeedOptions;
};

interface NormalizedSwarmKvIndexFeedOptions {
  enabled: boolean;
  owner?: EthereumAddress;
  topic?: string;
  autoCreateManifest: boolean;
  readLatest: boolean;
  writeLatest: boolean;
}

type BeePostageStamp = SwarmKvPostageBatchInfo;

interface NormalizedPostagePolicy {
  amount: string;
  depth: number;
  minDepth: number;
  minBatchTTL: number;
  label?: string;
  labelPrefix?: string;
  selectBatch?: (stamp: SwarmKvPostageBatchInfo) => boolean;
  topUpBelowTTL?: number;
  topUpAmount?: string;
  waitForUsable: boolean;
  waitTimeoutMs: number;
  waitIntervalMs: number;
  topUpRetryIntervalMs: number;
}

interface EncodedValue {
  bytes: Uint8Array;
  contentType: string;
  kind: SwarmKvValueKind;
  encoding: SwarmKvEncoding;
}

interface EncryptedEnvelope {
  schema: typeof ENCRYPTED_VALUE_SCHEMA;
  algorithm: "AES-256-GCM";
  kdf: SwarmKvEncryptionKdf;
  namespace: string;
  owner: EthereumAddress;
  iv: string;
  ciphertext: string;
}

type SwarmKvEncryptionKdf = "ethereum-personal-sign-sha256-v1" | "swarm-kv-key-sha256-v1";

interface ResolvedEncryptionKey {
  key: CryptoKey;
  kdf: SwarmKvEncryptionKdf;
}

interface OperationContext {
  signal?: AbortSignal;
  cleanup(): void;
}

class SwarmKvStoreImpl implements SwarmKvStore {
  readonly options: Readonly<NormalizedSwarmKvClientOptions>;

  #indexReference: SwarmReference | null;
  #index: SwarmKvIndexDocument | null = null;
  #postageBatch: PostageBatchResult | null = null;
  #autoPostageBatchPromise: Promise<PostageBatchResult> | null = null;
  #purchasedPostageBatchIds = new Set<string>();
  #topUpPromises = new Map<string, Promise<PostageBatchResult>>();
  #topUpRetryAfterMs = new Map<string, number>();
  #owner: EthereumAddress | null = null;
  #encryptionKey: ResolvedEncryptionKey | null = null;
  #verifiedFetch: SwarmVerifiedFetchClient;
  #indexFeedManifestReference: SwarmReference | null = null;
  #writeQueue: Promise<unknown> = Promise.resolve();

  constructor(options: NormalizedSwarmKvClientOptions) {
    this.options = Object.freeze(options);
    this.#indexReference = options.rootReference ? normalizeReference(options.rootReference) : null;
    this.#verifiedFetch = createSwarmVerifiedFetch({
      gatewayUrl: options.gatewayUrl,
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.maxVerifiedChunks === undefined ? {} : { maxChunks: options.maxVerifiedChunks })
    });
  }

  get indexReference(): SwarmReference | null {
    return this.#indexReference;
  }

  async put<TValue extends SwarmKvValue>(
    key: SwarmKvKey,
    value: TValue,
    options: PutOptions = {}
  ): Promise<PutResult> {
    assertValidKey(key);
    return this.withOperationContext(options, (context) =>
      this.withWriteLock(() => this.putLocked(key, value, options, context), context)
    );
  }

  private async putLocked<TValue extends SwarmKvValue>(
    key: SwarmKvKey,
    value: TValue,
    options: PutOptions,
    context: OperationContext
  ): Promise<PutResult> {
    this.throwIfAborted(context);
    const index = await this.loadIndex(context);
    this.assertExpectedIndexReference(options.ifIndexReference);
    await this.preflightIndexFeedWrite();

    const encoded = await encodeValue(value, options.contentType);

    if (encoded.bytes.byteLength > this.options.maxPayloadBytes) {
      throw new SwarmKvPayloadError(
        `Value for key "${key}" is ${encoded.bytes.byteLength} bytes, above the configured ${this.options.maxPayloadBytes} byte limit.`
      );
    }

    const encrypted = options.private ?? this.options.privateByDefault;
    const storedBytes = encrypted ? await this.encryptBytes(key, encoded.bytes, context) : encoded.bytes;
    const postageBatch = await this.ensurePostageBatchWithContext(context);
    const upload = await this.uploadBytes(
      storedBytes,
      encrypted ? "application/json" : encoded.contentType,
      {
        pin: options.pin ?? this.options.pin,
        postageBatchId: postageBatch.batchId
      },
      context
    );
    const verification = await this.verify(upload.reference, storedBytes);
    this.assertVerifiedUpload(verification, `value "${key}"`);
    const now = this.nowIso();
    const topic = this.topicForKey(key);
    const previousReference = this.#indexReference ?? undefined;
    const nextIndex: SwarmKvIndexDocument = {
      ...cloneIndex(index),
      revision: index.revision + 1,
      updatedAt: now,
      entries: {
        ...index.entries,
        [key]: {
          key,
          reference: upload.reference,
          contentType: encoded.contentType,
          kind: encoded.kind,
          encoding: encoded.encoding,
          encrypted,
          size: encoded.bytes.byteLength,
          updatedAt: now,
          topic,
          version: (index.entries[key]?.version ?? 0) + 1
        }
      },
      tombstones: removeKey(index.tombstones, key)
    };

    const owner = await this.getOwner();

    if (owner) {
      nextIndex.owner = owner;
    }

    if (previousReference) {
      nextIndex.previousReference = previousReference;
    } else {
      delete nextIndex.previousReference;
    }

    this.assertExpectedIndexReference(options.ifIndexReference);
    const indexUpload = await this.uploadIndex(nextIndex, postageBatch, context);

    return {
      key,
      reference: upload.reference,
      indexReference: indexUpload.reference,
      contentType: encoded.contentType,
      kind: encoded.kind,
      encrypted,
      topic,
      verification,
      indexVerification: indexUpload.verification,
      postageBatch
    };
  }

  async get(
    key: SwarmKvKey,
    optionsOrReference?: GetOptions | SwarmReference
  ): Promise<SwarmKvGetResult | null>;
  async get<TValue>(
    key: SwarmKvKey,
    optionsOrReference?: GetOptions | SwarmReference
  ): Promise<GetResult<TValue> | null>;
  async get<TValue = SwarmKvGetResult["value"]>(
    key: SwarmKvKey,
    optionsOrReference?: GetOptions | SwarmReference
  ): Promise<GetResult<TValue> | null> {
    assertValidKey(key);
    const options = normalizeGetOptions(optionsOrReference);
    return this.withOperationContext(options, (context) =>
      this.getWithContext<TValue>(key, options, context)
    );
  }

  private async getWithContext<TValue>(
    key: SwarmKvKey,
    options: GetOptions,
    context: OperationContext
  ): Promise<GetResult<TValue> | null> {
    this.throwIfAborted(context);
    const topic = this.topicForKey(key);
    const entry = options.reference ? null : await this.getIndexEntry(key, context);
    const reference = normalizeReference(options.reference ?? entry?.reference ?? "");

    if (!reference) {
      return null;
    }

    const verified = await this.fetchVerifiedBytes(reference, context);
    const encrypted = entry?.encrypted ?? isEncryptedPayload(verified.bytes);
    const plaintext = encrypted ? await this.decryptBytes(key, verified.bytes, context) : verified.bytes;
    const contentType = entry?.contentType ?? options.expectedContentType ?? "application/octet-stream";
    const kind = entry?.kind ?? kindFromContentType(contentType);
    const value = decodeValue<TValue>(plaintext, kind);

    return {
      key,
      reference,
      value,
      bytes: plaintext,
      contentType,
      kind,
      encrypted,
      topic,
      ...(entry?.updatedAt ? { updatedAt: entry.updatedAt } : {}),
      verification: {
        verified: verified.verification.verified,
        reference,
        computedReference: reference,
        algorithm: "swarm-cac-tree",
        chunksVerified: verified.chunksVerified
      }
    };
  }

  async getString(key: SwarmKvKey, optionsOrReference?: GetOptions | SwarmReference): Promise<string | null> {
    const result = await this.get<string>(key, optionsOrReference);
    return result ? String(result.value) : null;
  }

  async getJson<TValue = JsonValue>(
    key: SwarmKvKey,
    optionsOrReference?: GetOptions | SwarmReference
  ): Promise<TValue | null> {
    const result = await this.get<TValue>(key, optionsOrReference);
    return result ? result.value : null;
  }

  async getBytes(key: SwarmKvKey, optionsOrReference?: GetOptions | SwarmReference): Promise<Uint8Array | null> {
    const result = await this.get<Uint8Array>(key, optionsOrReference);
    return result ? result.bytes : null;
  }

  async delete(key: SwarmKvKey, options: DeleteOptions = {}): Promise<DeleteResult> {
    assertValidKey(key);
    return this.withOperationContext(options, (context) =>
      this.withWriteLock(() => this.deleteLocked(key, options, context), context)
    );
  }

  private async deleteLocked(
    key: SwarmKvKey,
    options: DeleteOptions,
    context: OperationContext
  ): Promise<DeleteResult> {
    this.throwIfAborted(context);
    const index = await this.loadIndex(context);
    this.assertExpectedIndexReference(options.ifIndexReference);
    const existing = index.entries[key];

    if (!existing) {
      return {
        key,
        deleted: false,
        indexReference: this.#indexReference
      };
    }

    await this.preflightIndexFeedWrite();

    const now = this.nowIso();
    const postageBatch = await this.ensurePostageBatchWithContext(context);
    const previousReference = this.#indexReference ?? undefined;
    const nextIndex: SwarmKvIndexDocument = {
      ...cloneIndex(index),
      revision: index.revision + 1,
      updatedAt: now,
      entries: removeKey(index.entries, key),
      tombstones: {
        ...index.tombstones,
        [key]: {
          key,
          deletedAt: now,
          previousReference: existing.reference,
          topic: existing.topic
        }
      }
    };

    if (previousReference) {
      nextIndex.previousReference = previousReference;
    } else {
      delete nextIndex.previousReference;
    }

    const owner = await this.getOwner();

    if (owner) {
      nextIndex.owner = owner;
    }

    this.assertExpectedIndexReference(options.ifIndexReference);
    const indexUpload = await this.uploadIndex(nextIndex, postageBatch, context);

    return {
      key,
      deleted: true,
      indexReference: indexUpload.reference,
      previousReference: existing.reference,
      indexVerification: indexUpload.verification,
      postageBatch
    };
  }

  async has(key: SwarmKvKey, options: SwarmKvOperationOptions = {}): Promise<boolean> {
    assertValidKey(key);
    return this.withOperationContext(options, async (context) => {
      const index = await this.loadIndex(context);
      return Boolean(index.entries[key]);
    });
  }

  async list(options: SwarmKvOperationOptions = {}): Promise<SwarmKvKey[]> {
    return this.withOperationContext(options, async (context) => {
      const index = await this.loadIndex(context);
      return this.sortedIndexKeys(index);
    });
  }

  entries(options?: SwarmKvOperationOptions): AsyncIterable<SwarmKvGetResult>;
  entries<TValue>(options?: SwarmKvOperationOptions): AsyncIterable<GetResult<TValue>>;
  async *entries<TValue = SwarmKvGetResult["value"]>(
    options: SwarmKvOperationOptions = {}
  ): AsyncIterable<GetResult<TValue>> {
    const context = this.createOperationContext(options);

    try {
      const index = await this.loadIndex(context);
      const keys = this.sortedIndexKeys(index);
      const getOptions = normalizeGetOptions(options);

      for (const key of keys) {
        this.throwIfAborted(context);
        const result = await this.getWithContext<TValue>(key, getOptions, context);

        if (result) {
          yield result;
        }
      }
    } finally {
      context.cleanup();
    }
  }

  async ensurePostageBatch(options: SwarmKvOperationOptions = {}): Promise<PostageBatchResult> {
    return this.withOperationContext(options, (context) =>
      this.ensurePostageBatchWithContext(context)
    );
  }

  private async ensurePostageBatchWithContext(context: OperationContext): Promise<PostageBatchResult> {
    this.throwIfAborted(context);

    if (this.options.postageMode === "manual") {
      if (this.#postageBatch) {
        return this.#postageBatch;
      }

      this.#postageBatch = {
        batchId: normalizeReference(this.options.postageBatchId ?? ""),
        source: "configured"
      };
      return this.#postageBatch;
    }

    if (this.options.postageMode !== "auto") {
      throw new SwarmKvPostageError(
        "No postage batch configured. Pass postage: fixedPostage(batchId) for manual mode or postage: autoPostage(options) with a funded Bee node."
      );
    }

    if (this.#autoPostageBatchPromise) {
      return this.withAbort(this.#autoPostageBatchPromise, context);
    }

    this.#autoPostageBatchPromise = this.resolveAutoPostageBatch(context).finally(() => {
      this.#autoPostageBatchPromise = null;
    });

    return this.withAbort(this.#autoPostageBatchPromise, context);
  }

  private async resolveAutoPostageBatch(context: OperationContext): Promise<PostageBatchResult> {
    const beeApiUrl = this.requireBeeApiUrl("ensurePostageBatch");
    const policy = normalizePostagePolicy(this.options.autoBuyPostageBatch);

    if (this.#postageBatch) {
      const cached = this.#postageBatch;
      const refreshed = await this.refreshPostageBatch(cached, policy, context);

      if (refreshed) {
        this.#postageBatch = refreshed;
        return refreshed;
      }

      if (cached.source === "purchased" || this.#purchasedPostageBatchIds.has(cached.batchId)) {
        throw new SwarmKvPostageError(
          `Purchased postage batch ${cached.batchId} is not usable or no longer satisfies the auto postage policy. ` +
            "Not buying another batch automatically; wait for Bee to confirm it, top it up manually, or create a new store with a deliberate postage policy."
        );
      }

      this.#postageBatch = null;
    }

    const existing = await this.findExistingPostageBatch(policy, context);

    if (existing) {
      this.#postageBatch = await this.maybeTopUpPostageBatch(existing, policy, context);
      return this.#postageBatch;
    }

    const amount = policy.amount;
    const depth = policy.depth;
    const purchaseUrl = new URL(`${beeApiUrl}/stamps/${amount}/${depth}`);

    if (policy.label) {
      purchaseUrl.searchParams.set("label", policy.label);
    }

    const response = await this.fetch(
      purchaseUrl.toString(),
      this.withSignal(
        {
          method: "POST"
        },
        context
      )
    );

    if (!response.ok) {
      throw await SwarmKvGatewayError.fromResponse("buy postage batch", response);
    }

    const json = await this.readBeeJson(response, "buy postage batch");
    const batchId = extractBatchId(json);

    if (!batchId) {
      throw new SwarmKvPostageError("Bee did not return a batchID for the purchased postage batch.");
    }

    this.#postageBatch = {
      batchId: normalizeReference(batchId),
      source: "purchased",
      amount,
      depth,
      ...(policy.label ? { label: policy.label } : {})
    };
    this.#purchasedPostageBatchIds.add(this.#postageBatch.batchId);

    if (policy.waitForUsable) {
      this.#postageBatch = await this.waitForPostageBatchUsable(
        this.#postageBatch.batchId,
        policy,
        context,
        this.#postageBatch
      );
    }

    return this.#postageBatch;
  }

  async createFeedManifest(
    key: SwarmKvKey = INDEX_KEY,
    options: SwarmKvOperationOptions = {}
  ): Promise<FeedManifestResult> {
    assertValidKey(key);
    return this.withOperationContext(options, (context) =>
      this.createFeedManifestWithContext(key, context)
    );
  }

  private async createFeedManifestWithContext(
    key: SwarmKvKey,
    context: OperationContext
  ): Promise<FeedManifestResult> {
    this.throwIfAborted(context);
    this.requireBeeApiUrl("createFeedManifest");
    const owner = await this.requireOwner();
    const topic = this.topicForKey(key);
    const postageBatch = await this.ensurePostageBatchWithContext(context);
    const response = await this.fetch(
      `${this.options.beeApiUrl}/feeds/${owner.slice(2)}/${topic}?type=sequence`,
      this.withSignal(
        {
          method: "POST",
          headers: this.uploadHeaders(postageBatch.batchId, "application/octet-stream", this.options.pin)
        },
        context
      )
    );

    if (!response.ok) {
      throw await SwarmKvGatewayError.fromResponse("create feed manifest", response);
    }

    const reference = extractReference(await this.readBeeJson(response, "create feed manifest"));

    return {
      key,
      owner,
      topic,
      manifestReference: reference,
      postageBatch
    };
  }

  async getIndexFeedInfo(options: SwarmKvOperationOptions = {}): Promise<SwarmKvIndexFeedInfo | null> {
    return this.withOperationContext(options, (context) =>
      this.getIndexFeedInfoWithContext(context)
    );
  }

  private async getIndexFeedInfoWithContext(context: OperationContext): Promise<SwarmKvIndexFeedInfo | null> {
    const feed = await this.resolveIndexFeedConfig();

    if (!feed) {
      return null;
    }

    const latestReference = this.#indexReference ?? (await this.loadLatestIndexReferenceFromFeed(context));

    return {
      owner: feed.owner,
      topic: feed.topic,
      latestReference,
      ...(this.#indexFeedManifestReference ? { manifestReference: this.#indexFeedManifestReference } : {})
    };
  }

  topicForKey(key: SwarmKvKey): string {
    assertValidKey(key);
    return bytesToHex(keccak256(new TextEncoder().encode(`${this.options.namespace}\0${key}`)));
  }

  async verify(reference: SwarmReference, bytes: Uint8Array): Promise<VerificationResult> {
    const normalizedReference = normalizeReference(reference);
    const computedReference = referenceForBytes(bytes);

    return {
      verified: computedReference === normalizedReference,
      reference: normalizedReference,
      computedReference,
      algorithm: "swarm-cac-tree"
    };
  }

  private async getIndexEntry(key: SwarmKvKey, context: OperationContext): Promise<SwarmKvIndexEntry | null> {
    const index = await this.loadIndex(context);
    return index.entries[key] ?? null;
  }

  private sortedIndexKeys(index: SwarmKvIndexDocument): SwarmKvKey[] {
    return Object.keys(index.entries).sort((left, right) => left.localeCompare(right));
  }

  private async loadIndex(context: OperationContext): Promise<SwarmKvIndexDocument> {
    this.throwIfAborted(context);

    if (this.#index) {
      return this.#index;
    }

    if (!this.#indexReference) {
      const feedReference = await this.loadLatestIndexReferenceFromFeed(context);

      if (feedReference) {
        this.#indexReference = feedReference;
      } else {
        this.#index = await this.emptyIndex();
        return this.#index;
      }
    }

    const verified = await this.fetchVerifiedBytes(this.#indexReference, context);
    const bytes = isEncryptedPayload(verified.bytes)
      ? await this.decryptBytes(INDEX_KEY, verified.bytes, context)
      : verified.bytes;
    const index = parseIndex(bytes);

    if (index.namespace !== this.options.namespace) {
      throw new SwarmKvIndexError(
        `Index namespace "${index.namespace}" does not match store namespace "${this.options.namespace}".`
      );
    }

    this.#index = index;
    return index;
  }

  private async emptyIndex(): Promise<SwarmKvIndexDocument> {
    const index: SwarmKvIndexDocument = {
      schema: INDEX_SCHEMA,
      namespace: this.options.namespace,
      revision: 0,
      updatedAt: this.nowIso(),
      entries: {},
      tombstones: {}
    };
    const owner = await this.getOwner();

    if (owner) {
      index.owner = owner;
    }

    return index;
  }

  private async uploadIndex(
    index: SwarmKvIndexDocument,
    postageBatch: PostageBatchResult,
    context: OperationContext
  ): Promise<{ reference: SwarmReference; verification: VerificationResult }> {
    const indexBytes = new TextEncoder().encode(JSON.stringify(sortIndex(index)));
    const storedIndexBytes = this.options.privateByDefault
      ? await this.encryptBytes(INDEX_KEY, indexBytes, context)
      : indexBytes;
    const upload = await this.uploadBytes(
      storedIndexBytes,
      "application/json",
      {
        pin: this.options.pin,
        postageBatchId: postageBatch.batchId
      },
      context
    );
    const verification = await this.verify(upload.reference, storedIndexBytes);
    this.assertVerifiedUpload(verification, "index");
    const previousIndexReference = this.#indexReference;

    await this.publishLatestIndexReference(upload.reference, previousIndexReference, postageBatch, context);

    this.#index = index;
    this.#indexReference = upload.reference;

    return {
      reference: upload.reference,
      verification
    };
  }

  private async uploadBytes(
    bytes: Uint8Array,
    contentType: string,
    options: { postageBatchId: string; pin: boolean },
    context: OperationContext
  ): Promise<{ reference: SwarmReference }> {
    this.requireBeeApiUrl("put");
    const response = await this.fetch(
      `${this.options.beeApiUrl}/bytes`,
      this.withSignal(
        {
          method: "POST",
          headers: this.uploadHeaders(options.postageBatchId, contentType, options.pin),
          body: bytes
        },
        context
      )
    );

    if (!response.ok) {
      throw await SwarmKvGatewayError.fromResponse("upload bytes", response);
    }

    return {
      reference: extractReference(await this.readBeeJson(response, "upload bytes"))
    };
  }

  private uploadHeaders(postageBatchId: string, contentType: string, pin: boolean): Record<string, string> {
    return {
      "Content-Type": contentType,
      "Swarm-Postage-Batch-Id": postageBatchId,
      "Swarm-Pin": String(pin)
    };
  }

  private async findExistingPostageBatch(
    policy: NormalizedPostagePolicy,
    context: OperationContext
  ): Promise<PostageBatchResult | null> {
    if (!this.options.beeApiUrl) {
      return null;
    }

    const response = await this.fetch(
      `${this.options.beeApiUrl}/stamps`,
      this.withSignal({}, context)
    );

    if (!response.ok) {
      throw await SwarmKvGatewayError.fromResponse("list postage batches", response);
    }

    const stamps = parsePostageStamps(await this.readBeeJson(response, "list postage batches"))
      .filter((stamp) => isAutoPostageCandidate(stamp, policy))
      .sort((left, right) => comparePostageStamps(left, right, policy));
    const best = stamps[0];

    if (!best) {
      return null;
    }

    return postageResultFromStamp(best, "existing");
  }

  private async refreshPostageBatch(
    batch: PostageBatchResult,
    policy: NormalizedPostagePolicy,
    context: OperationContext
  ): Promise<PostageBatchResult | null> {
    const stamp = await this.readPostageBatch(batch.batchId, "refresh postage batch", context);

    if (!stamp || !isAutoPostageCandidate(stamp, policy)) {
      return null;
    }

    const source = batch.source === "purchased" ? "purchased" : "existing";
    return this.maybeTopUpPostageBatch(postageResultFromStamp(stamp, source), policy, context);
  }

  private async readPostageBatch(
    batchId: string,
    action: string,
    context: OperationContext
  ): Promise<BeePostageStamp | null> {
    const response = await this.fetch(`${this.requireBeeApiUrl(action)}/stamps`, this.withSignal({}, context));

    if (!response.ok) {
      throw await SwarmKvGatewayError.fromResponse(action, response);
    }

    return parsePostageStamps(await this.readBeeJson(response, action)).find((candidate) => candidate.batchId === batchId) ?? null;
  }

  private async maybeTopUpPostageBatch(
    batch: PostageBatchResult,
    policy: NormalizedPostagePolicy,
    context: OperationContext
  ): Promise<PostageBatchResult> {
    if (
      policy.topUpBelowTTL === undefined ||
      !policy.topUpAmount ||
      batch.batchTTL === undefined ||
      batch.batchTTL >= policy.topUpBelowTTL
    ) {
      return batch;
    }

    const now = this.nowMs();
    const retryAfterMs = this.#topUpRetryAfterMs.get(batch.batchId);

    if (retryAfterMs !== undefined && now < retryAfterMs) {
      return {
        ...batch,
        toppedUp: true
      };
    }

    const pending = this.#topUpPromises.get(batch.batchId);

    if (pending) {
      return this.withAbort(pending, context);
    }

    const topUp = this.performTopUpPostageBatch(batch, policy, context).finally(() => {
      this.#topUpPromises.delete(batch.batchId);
    });

    this.#topUpPromises.set(batch.batchId, topUp);
    return this.withAbort(topUp, context);
  }

  private async performTopUpPostageBatch(
    batch: PostageBatchResult,
    policy: NormalizedPostagePolicy,
    context: OperationContext
  ): Promise<PostageBatchResult> {
    const beeApiUrl = this.requireBeeApiUrl("top up postage batch");
    const response = await this.fetch(`${beeApiUrl}/stamps/topup/${batch.batchId}/${policy.topUpAmount}`, this.withSignal({
      method: "PATCH"
    }, context));

    if (!response.ok) {
      throw await SwarmKvGatewayError.fromResponse("top up postage batch", response);
    }

    this.#topUpRetryAfterMs.set(batch.batchId, this.nowMs() + policy.topUpRetryIntervalMs);

    const toppedUp = {
      ...batch,
      toppedUp: true
    };

    if (policy.waitForUsable) {
      return this.waitForPostageBatchUsable(batch.batchId, policy, context, toppedUp);
    }

    let refreshed: BeePostageStamp | null = null;

    try {
      refreshed = await this.readPostageBatch(batch.batchId, "refresh topped-up postage batch", context);
    } catch {
      refreshed = null;
    }

    return refreshed
      ? {
          ...postageResultFromStamp(refreshed, batch.source),
          toppedUp: true
        }
      : toppedUp;
  }

  private async waitForPostageBatchUsable(
    batchId: string,
    policy: NormalizedPostagePolicy,
    context: OperationContext,
    fallback?: PostageBatchResult
  ): Promise<PostageBatchResult> {
    const timeoutMs = policy.waitTimeoutMs;
    const intervalMs = policy.waitIntervalMs;
    const deadline = Date.now() + timeoutMs;
    let lastStamp: BeePostageStamp | null = null;

    while (Date.now() <= deadline) {
      this.throwIfAborted(context);
      const stamp = await this.readPostageBatch(batchId, "read postage batches", context);
      lastStamp = stamp ?? lastStamp;

      if (stamp && isSelectablePostageStamp(stamp, policy)) {
        return {
          ...postageResultFromStamp(stamp, fallback?.source ?? "existing"),
          ...(fallback?.toppedUp ? { toppedUp: true } : {})
        };
      }

      await sleep(intervalMs, context.signal);
    }

    throw new SwarmKvPostageError(
      `Postage batch ${batchId} did not become usable within ${timeoutMs}ms. Last status: ${
        lastStamp ? JSON.stringify(lastStamp) : "not returned by Bee"
      }.`
    );
  }

  private async resolveIndexFeedConfig(): Promise<
    { owner: EthereumAddress; topic: string; options: NormalizedSwarmKvIndexFeedOptions } | null
  > {
    const options = this.options.indexFeed;

    if (!options?.enabled) {
      return null;
    }

    const owner = options.owner ?? (await this.getOwner());

    if (!owner) {
      throw new SwarmKvFeedError("indexFeed requires an owner or signer address.");
    }

    return {
      owner,
      topic: options.topic ?? this.topicForKey(INDEX_KEY),
      options
    };
  }

  private async loadLatestIndexReferenceFromFeed(context: OperationContext): Promise<SwarmReference | null> {
    const feed = await this.resolveIndexFeedConfig();

    if (!feed?.options.readLatest) {
      return null;
    }

    if (!this.options.feedReader) {
      throw new SwarmKvFeedError(
        "indexFeed.readLatest requires feedReader because Swarm feed reads must verify signed SOC updates. Pass a verifying feedReader adapter or set readLatest: false."
      );
    }

    const result = await this.withAbort(this.options.feedReader.readLatestReference({
      owner: feed.owner,
      topic: feed.topic,
      gatewayUrl: this.options.gatewayUrl,
      ...(this.options.beeApiUrl ? { beeApiUrl: this.options.beeApiUrl } : {}),
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      ...(context.signal ? { signal: context.signal } : {})
    }), context);

    if (!result?.reference) {
      return null;
    }

    if (!result.verified) {
      throw new SwarmKvFeedError(
        `indexFeed.readLatest returned an unverified feed update${result.details ? `: ${result.details}` : "."}`
      );
    }

    return normalizeReference(result.reference);
  }

  private async publishLatestIndexReference(
    reference: SwarmReference,
    previousIndexReference: SwarmReference | null,
    postageBatch: PostageBatchResult,
    context: OperationContext
  ): Promise<void> {
    const feed = await this.resolveIndexFeedConfig();

    if (!feed?.options.writeLatest) {
      return;
    }

    const beeApiUrl = this.requireBeeApiUrl("publish index feed");

    if (!this.options.feedWriter) {
      throw new SwarmKvFeedError(
        "indexFeed.writeLatest requires feedWriter because Swarm feed updates are signed SOC writes."
      );
    }

    if (feed.options.autoCreateManifest && !this.#indexFeedManifestReference) {
      this.#indexFeedManifestReference = await this.createIndexFeedManifest(feed.owner, feed.topic, postageBatch, context);
    }

    await this.withAbort(this.options.feedWriter.updateReference({
      owner: feed.owner,
      topic: feed.topic,
      reference,
      postageBatchId: postageBatch.batchId,
      beeApiUrl,
      gatewayUrl: this.options.gatewayUrl,
      previousIndexReference,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      ...(context.signal ? { signal: context.signal } : {})
    }), context);
  }

  private async preflightIndexFeedWrite(): Promise<void> {
    const feed = await this.resolveIndexFeedConfig();

    if (!feed?.options.writeLatest) {
      return;
    }

    this.requireBeeApiUrl("publish index feed");

    if (!this.options.feedWriter) {
      throw new SwarmKvFeedError(
        "indexFeed.writeLatest requires feedWriter because Swarm feed updates are signed SOC writes."
      );
    }
  }

  private async createIndexFeedManifest(
    owner: EthereumAddress,
    topic: string,
    postageBatch: PostageBatchResult,
    context: OperationContext
  ): Promise<SwarmReference> {
    const beeApiUrl = this.requireBeeApiUrl("create index feed manifest");
    const response = await this.fetch(`${beeApiUrl}/feeds/${owner.slice(2)}/${topic}?type=sequence`, this.withSignal({
      method: "POST",
      headers: this.uploadHeaders(postageBatch.batchId, "application/octet-stream", this.options.pin)
    }, context));

    if (!response.ok) {
      throw await SwarmKvGatewayError.fromResponse("create index feed manifest", response);
    }

    return extractReference(await this.readBeeJson(response, "create index feed manifest"));
  }

  private async encryptBytes(
    key: SwarmKvKey,
    plaintext: Uint8Array,
    context: OperationContext
  ): Promise<Uint8Array> {
    this.throwIfAborted(context);
    const owner = await this.requireOwner();
    const cryptoKey = await this.getEncryptionKey(owner, undefined, context);
    const iv = randomBytes(12);
    const ciphertext = await subtle().encrypt(
      {
        name: "AES-GCM",
        iv: asBufferSource(iv),
        additionalData: asBufferSource(encryptionAdditionalData(this.options.namespace, key))
      },
      cryptoKey.key,
      asBufferSource(plaintext)
    );
    const envelope: EncryptedEnvelope = {
      schema: ENCRYPTED_VALUE_SCHEMA,
      algorithm: "AES-256-GCM",
      kdf: cryptoKey.kdf,
      namespace: this.options.namespace,
      owner,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    };

    return new TextEncoder().encode(JSON.stringify(envelope));
  }

  private async decryptBytes(
    key: SwarmKvKey,
    encryptedBytes: Uint8Array,
    context: OperationContext
  ): Promise<Uint8Array> {
    this.throwIfAborted(context);
    const envelope = parseEncryptedEnvelope(encryptedBytes);

    if (envelope.namespace !== this.options.namespace) {
      throw new SwarmKvCryptoError(
        `Encrypted payload namespace "${envelope.namespace}" does not match "${this.options.namespace}".`
      );
    }

    const owner = await this.requireOwner();

    if (envelope.owner.toLowerCase() !== owner.toLowerCase()) {
      throw new SwarmKvCryptoError(
        `Encrypted payload owner "${envelope.owner}" does not match signer owner "${owner}".`
      );
    }

    const cryptoKey = await this.getEncryptionKey(owner, envelope.kdf, context);

    try {
      const plaintext = await subtle().decrypt(
        {
          name: "AES-GCM",
          iv: asBufferSource(base64ToBytes(envelope.iv)),
          additionalData: asBufferSource(encryptionAdditionalData(this.options.namespace, key))
        },
        cryptoKey.key,
        asBufferSource(base64ToBytes(envelope.ciphertext))
      );

      return new Uint8Array(plaintext);
    } catch (error) {
      throw new SwarmKvCryptoError(
        `Unable to decrypt private Swarm KV payload. Check namespace, owner, and encryption key/signature stability.${
          error instanceof Error ? ` ${error.message}` : ""
        }`
      );
    }
  }

  private async getEncryptionKey(
    owner: EthereumAddress,
    expectedKdf?: SwarmKvEncryptionKdf,
    context?: OperationContext
  ): Promise<ResolvedEncryptionKey> {
    this.throwIfAborted(context);

    if (this.#encryptionKey) {
      if (expectedKdf && this.#encryptionKey.kdf !== expectedKdf) {
        throw new SwarmKvCryptoError(
          `Encrypted payload expects ${expectedKdf}, but this store is configured for ${this.#encryptionKey.kdf}.`
        );
      }

      return this.#encryptionKey;
    }

    if (this.options.encryptionKey !== undefined) {
      if (expectedKdf && expectedKdf !== "swarm-kv-key-sha256-v1") {
        throw new SwarmKvCryptoError(
          `Encrypted payload expects ${expectedKdf}, but this store was configured with explicit encryptionKey material.`
        );
      }

      const material = await this.withAbort(resolveEncryptionKeyMaterial(this.options.encryptionKey, {
        namespace: this.options.namespace,
        owner
      }), context);
      this.#encryptionKey = {
        key: await importAesGcmKey(material),
        kdf: "swarm-kv-key-sha256-v1"
      };
      return this.#encryptionKey;
    }

    if (expectedKdf && expectedKdf !== "ethereum-personal-sign-sha256-v1") {
      throw new SwarmKvCryptoError(
        `Encrypted payload expects ${expectedKdf}, but this store was configured with signer-derived encryption.`
      );
    }

    if (!this.options.allowSignerDerivedEncryption) {
      throw new SwarmKvCryptoError(
        "Private Swarm KV stores require stable encryptionKey material by default. " +
          "Pass encryptionKey, set privateByDefault/private to false, or explicitly opt in with allowSignerDerivedEncryption for deterministic signers."
      );
    }

    const signer = this.options.signer;

    if (!signer) {
      throw new SwarmKvCryptoError(
        "Signer-derived private Swarm KV writes require a signer. Pass signer or set privateByDefault/private to false."
      );
    }

    const message = [
      "Swarm KV encryption key",
      `Namespace: ${this.options.namespace}`,
      `Owner: ${owner}`,
      "Sign this message to encrypt and decrypt this database."
    ].join("\n");
    const signature = await this.withAbort(Promise.resolve(signer.signMessage(message)), context);
    const material = new TextEncoder().encode(`${this.options.namespace}:${owner}:${signature}`);
    const digest = await subtle().digest("SHA-256", material);
    this.#encryptionKey = {
      key: await subtle().importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]),
      kdf: "ethereum-personal-sign-sha256-v1"
    };
    return this.#encryptionKey;
  }

  private async requireOwner(): Promise<EthereumAddress> {
    const owner = await this.getOwner();

    if (!owner) {
      throw new SwarmKvCryptoError("This operation requires an Ethereum owner or signer address.");
    }

    return owner;
  }

  private async getOwner(): Promise<EthereumAddress | null> {
    if (this.#owner) {
      return this.#owner;
    }

    const signer = this.options.signer;
    const owner = signer?.address ?? (signer?.getAddress ? await signer.getAddress() : this.options.owner);

    if (!owner) {
      return null;
    }

    this.#owner = normalizeEthereumAddress(owner);
    return this.#owner;
  }

  private requireBeeApiUrl(method: string): string {
    if (!this.options.beeApiUrl) {
      throw new SwarmKvConfigError(`${method} requires beeApiUrl because Swarm writes go through a Bee API.`);
    }

    return this.options.beeApiUrl;
  }

  private async fetch(input: string, init?: FetchOptions): Promise<FetchResponseLike> {
    const fetchImpl = this.options.fetch ?? (globalThis.fetch?.bind(globalThis) as FetchLike | undefined);

    if (!fetchImpl) {
      throw new SwarmKvConfigError("No fetch implementation available. Pass options.fetch explicitly.");
    }

    throwIfSignalAborted(init?.signal);

    try {
      return await fetchImpl(input, init);
    } catch (error) {
      if (init?.signal?.aborted) {
        throw operationAbortError(init.signal);
      }

      throw error;
    }
  }

  private async readBeeJson(response: FetchResponseLike, action: string): Promise<unknown> {
    const responseBytes = new Uint8Array(await response.arrayBuffer());
    const bytes = this.options.decodeGzippedBeeJson
      ? await ungzipIfNeeded(responseBytes)
      : responseBytes;
    const text = new TextDecoder().decode(bytes);

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new SwarmKvGatewayError(
        `Bee API returned invalid JSON while trying to ${action}: ${error instanceof Error ? error.message : String(error)}`,
        response.status,
        response.statusText
      );
    }
  }

  private fetchVerifiedBytes(
    reference: SwarmReference,
    context: OperationContext
  ): Promise<VerifiedBytesResponse> {
    this.throwIfAborted(context);

    if (!context.signal) {
      return this.#verifiedFetch.fetch(reference, { responseType: "buffer" }).then(assertVerifiedBytesResponse);
    }

    const verifiedFetch = createSwarmVerifiedFetch({
      gatewayUrl: this.options.gatewayUrl,
      fetch: (input, init) =>
        this.fetch(input, this.withSignal(init ?? {}, context)),
      ...(this.options.maxVerifiedChunks === undefined
        ? {}
        : { maxChunks: this.options.maxVerifiedChunks })
    });

    return this.withAbort(
      verifiedFetch.fetch(reference, {
        responseType: "buffer",
        signal: context.signal
      }).then(assertVerifiedBytesResponse),
      context
    );
  }

  private withSignal(init: FetchOptions, context: OperationContext): FetchOptions {
    return context.signal ? { ...init, signal: context.signal } : init;
  }

  private async withOperationContext<TValue>(
    options: SwarmKvOperationOptions | undefined,
    operation: (context: OperationContext) => Promise<TValue>
  ): Promise<TValue> {
    const context = this.createOperationContext(options);

    try {
      return await operation(context);
    } finally {
      context.cleanup();
    }
  }

  private createOperationContext(options: SwarmKvOperationOptions = {}): OperationContext {
    const timeoutMs =
      options.timeoutMs === undefined
        ? this.options.timeoutMs
        : normalizeOperationTimeoutMs(options.timeoutMs, "timeoutMs");

    if (!options.signal && timeoutMs === undefined) {
      return {
        cleanup() {}
      };
    }

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abortFromSignal = () => {
      abortController(controller, signalAbortReason(options.signal));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        abortFromSignal();
      } else {
        options.signal.addEventListener("abort", abortFromSignal, { once: true });
      }
    }

    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        abortController(
          controller,
          new SwarmKvTimeoutError(`Swarm KV operation timed out after ${timeoutMs}ms.`)
        );
      }, timeoutMs);
    }

    return {
      signal: controller.signal,
      cleanup() {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }

        options.signal?.removeEventListener("abort", abortFromSignal);
      }
    };
  }

  private throwIfAborted(context?: OperationContext): void {
    throwIfSignalAborted(context?.signal);
  }

  private assertExpectedIndexReference(expected: SwarmReference | null | undefined): void {
    if (expected === undefined) {
      return;
    }

    const normalizedExpected = expected === null ? null : normalizeReference(expected);

    if (normalizedExpected !== this.#indexReference) {
      throw new SwarmKvConflictError(
        `Index reference changed before write. Expected ${normalizedExpected ?? "empty"}, current ${
          this.#indexReference ?? "empty"
        }.`
      );
    }
  }

  private assertVerifiedUpload(verification: VerificationResult, label: string): void {
    if (verification.verified) {
      return;
    }

    throw new SwarmKvVerificationError(
      `Bee returned reference ${verification.reference} for ${label}, but the client computed ${verification.computedReference}.`
    );
  }

  private withAbort<TValue>(promise: Promise<TValue>, context?: OperationContext): Promise<TValue> {
    const signal = context?.signal;

    if (!signal) {
      return promise;
    }

    if (signal.aborted) {
      return Promise.reject(operationAbortError(signal));
    }

    return new Promise<TValue>((resolve, reject) => {
      const onAbort = () => {
        reject(operationAbortError(signal));
      };

      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        }
      );
    });
  }

  private withWriteLock<TValue>(operation: () => Promise<TValue>, context: OperationContext): Promise<TValue> {
    const run = this.#writeQueue.then(
      async () => {
        this.throwIfAborted(context);
        return operation();
      },
      async () => {
        this.throwIfAborted(context);
        return operation();
      }
    );
    this.#writeQueue = run.then(
      () => undefined,
      () => undefined
    );
    return this.withAbort(run, context);
  }

  private nowIso(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  private nowMs(): number {
    return (this.options.now?.() ?? new Date()).getTime();
  }
}

function assertVerifiedBytesResponse(
  response: Awaited<ReturnType<SwarmVerifiedFetchClient["fetch"]>>
): VerifiedBytesResponse {
  if (response.delivery === "buffer" && response.verified === true) {
    return response;
  }

  throw new SwarmKvVerificationError("Swarm verifier returned a non-buffer response for a KV byte read.");
}

export function createSwarmKvStore(options: SwarmKvClientOptions = {}): SwarmKvStore {
  return new SwarmKvStoreImpl(normalizeOptions(options));
}

export function fixedPostage(batchId: string): SwarmKvFixedPostageConfig {
  return {
    mode: "fixed",
    batchId
  };
}

export function manualPostage(batchId: string): SwarmKvFixedPostageConfig {
  return fixedPostage(batchId);
}

export function autoPostage(options: SwarmKvAutoPostageOptions = {}): SwarmKvAutoPostageConfig {
  return {
    mode: "auto",
    ...options
  };
}

export function referenceForBytes(bytes: Uint8Array): SwarmReference {
  return buildTreeReference(bytes).reference;
}

function normalizeOptions(options: SwarmKvClientOptions): NormalizedSwarmKvClientOptions {
  const postage = normalizeClientPostageOptions(options);
  const normalized: NormalizedSwarmKvClientOptions = {
    gatewayUrl: normalizeBaseUrl(options.gatewayUrl ?? DEFAULT_GATEWAY_URL),
    namespace: options.namespace ?? DEFAULT_NAMESPACE,
    privateByDefault: options.privateByDefault ?? true,
    pin: options.pin ?? false,
    maxPayloadBytes: options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES,
    decodeGzippedBeeJson: options.decodeGzippedBeeJson ?? true,
    postageMode: postage.postageMode,
    ...(options.beeApiUrl ? { beeApiUrl: normalizeBaseUrl(options.beeApiUrl) } : {}),
    ...(postage.postageBatchId ? { postageBatchId: postage.postageBatchId } : {}),
    ...(postage.autoBuyPostageBatch === undefined ? {} : { autoBuyPostageBatch: postage.autoBuyPostageBatch }),
    ...(options.rootReference ? { rootReference: normalizeReference(options.rootReference) } : {}),
    ...(options.owner ? { owner: normalizeEthereumAddress(options.owner) } : {}),
    ...(options.signer ? { signer: options.signer } : {}),
    ...(options.indexFeed === undefined
      ? {}
      : { indexFeed: normalizeIndexFeedOptions(options.indexFeed, options.owner, Boolean(options.feedReader)) }),
    ...(options.feedWriter ? { feedWriter: options.feedWriter } : {}),
    ...(options.feedReader ? { feedReader: options.feedReader } : {}),
    ...(options.encryptionKey === undefined ? {} : { encryptionKey: options.encryptionKey }),
    ...(options.allowSignerDerivedEncryption === undefined
      ? {}
      : { allowSignerDerivedEncryption: options.allowSignerDerivedEncryption }),
    ...(options.maxVerifiedChunks === undefined ? {} : { maxVerifiedChunks: options.maxVerifiedChunks }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: normalizeOperationTimeoutMs(options.timeoutMs, "timeoutMs") }),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.now ? { now: options.now } : {})
  };

  return normalized;
}

function normalizeClientPostageOptions(options: SwarmKvClientOptions): {
  postageMode: "none" | "manual" | "auto";
  postageBatchId?: string;
  autoBuyPostageBatch?: PostageBatchPurchaseOptions;
} {
  if (!options.postage) {
    if (options.postageBatchId) {
      return {
        postageMode: "manual",
        postageBatchId: normalizeReference(options.postageBatchId)
      };
    }

    if (options.autoBuyPostageBatch) {
      return {
        postageMode: "auto",
        autoBuyPostageBatch:
          typeof options.autoBuyPostageBatch === "object" ? options.autoBuyPostageBatch : {}
      };
    }

    return {
      postageMode: "none"
    };
  }

  if (options.postage.mode === "fixed") {
    return {
      postageMode: "manual",
      postageBatchId: normalizeReference(options.postage.batchId)
    };
  }

  return {
    postageMode: "auto",
    autoBuyPostageBatch: purchaseOptionsFromAutoPostage(options.postage)
  };
}

function purchaseOptionsFromAutoPostage(options: SwarmKvAutoPostageConfig): PostageBatchPurchaseOptions {
  return {
    ...(options.amount ? { amount: options.amount } : {}),
    ...(options.depth === undefined ? {} : { depth: options.depth }),
    ...(options.minDepth === undefined ? {} : { minDepth: options.minDepth }),
    ...(options.minTTLSeconds === undefined ? {} : { minBatchTTL: options.minTTLSeconds }),
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.labelPrefix === undefined ? {} : { labelPrefix: options.labelPrefix }),
    ...(options.selectBatch === undefined ? {} : { selectBatch: options.selectBatch }),
    ...(options.topUpBelowTTLSeconds === undefined ? {} : { topUpBelowTTL: options.topUpBelowTTLSeconds }),
    ...(options.topUpAmount ? { topUpAmount: options.topUpAmount } : {}),
    ...(options.waitForUsable === undefined ? {} : { waitForUsable: options.waitForUsable }),
    ...(options.topUpRetryIntervalMs === undefined ? {} : { topUpRetryIntervalMs: options.topUpRetryIntervalMs })
  };
}

function normalizeIndexFeedOptions(
  value: boolean | SwarmKvIndexFeedOptions,
  owner?: string,
  hasFeedReader = false
): NormalizedSwarmKvIndexFeedOptions {
  const options = typeof value === "boolean" ? { enabled: value } : value;

  return {
    enabled: options.enabled ?? true,
    ...(options.owner ? { owner: normalizeEthereumAddress(options.owner) } : {}),
    ...(owner && !options.owner ? { owner: normalizeEthereumAddress(owner) } : {}),
    ...(options.topic ? { topic: normalizeTopic(options.topic) } : {}),
    autoCreateManifest: options.autoCreateManifest ?? true,
    readLatest: options.readLatest ?? hasFeedReader,
    writeLatest: options.writeLatest ?? true
  };
}

function normalizePostagePolicy(value: PostageBatchPurchaseOptions | undefined): NormalizedPostagePolicy {
  const options = value ?? {};
  const wait =
    typeof options.waitForUsable === "object"
      ? options.waitForUsable
      : {};
  const topUpBelowTTL =
    options.topUpBelowTTL === undefined
      ? undefined
      : normalizeNonNegativeInteger(options.topUpBelowTTL, "topUpBelowTTL");
  const topUpAmount =
    options.topUpAmount === undefined
      ? undefined
      : normalizePositiveIntegerString(options.topUpAmount, "topUpAmount");

  if (topUpBelowTTL !== undefined && topUpAmount === undefined) {
    throw new SwarmKvConfigError("auto postage topUpBelowTTL requires topUpAmount.");
  }

  if (options.selectBatch !== undefined && typeof options.selectBatch !== "function") {
    throw new SwarmKvConfigError("auto postage selectBatch must be a function.");
  }

  return {
    amount: normalizePositiveIntegerString(options.amount ?? DEFAULT_POSTAGE_AMOUNT, "amount"),
    depth: normalizeIntegerAtLeast(options.depth ?? DEFAULT_POSTAGE_DEPTH, "depth", DEFAULT_POSTAGE_DEPTH),
    minDepth: normalizeIntegerAtLeast(options.minDepth ?? DEFAULT_POSTAGE_DEPTH, "minDepth", DEFAULT_POSTAGE_DEPTH),
    minBatchTTL: normalizeNonNegativeInteger(options.minBatchTTL ?? 0, "minBatchTTL"),
    ...(options.label === undefined ? {} : { label: normalizeNonEmptyString(options.label, "label") }),
    ...(options.labelPrefix === undefined
      ? {}
      : { labelPrefix: normalizeNonEmptyString(options.labelPrefix, "labelPrefix") }),
    ...(options.selectBatch === undefined ? {} : { selectBatch: options.selectBatch }),
    ...(topUpBelowTTL === undefined ? {} : { topUpBelowTTL }),
    ...(topUpAmount === undefined ? {} : { topUpAmount }),
    waitForUsable: options.waitForUsable !== false,
    waitTimeoutMs: normalizePositiveInteger(wait.timeoutMs ?? DEFAULT_POSTAGE_WAIT_TIMEOUT_MS, "waitForUsable.timeoutMs"),
    waitIntervalMs: normalizePositiveInteger(
      wait.intervalMs ?? DEFAULT_POSTAGE_WAIT_INTERVAL_MS,
      "waitForUsable.intervalMs"
    ),
    topUpRetryIntervalMs: normalizeNonNegativeInteger(
      options.topUpRetryIntervalMs ?? DEFAULT_POSTAGE_TOP_UP_RETRY_INTERVAL_MS,
      "topUpRetryIntervalMs"
    )
  };
}

function normalizePositiveIntegerString(value: string, name: string): string {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new SwarmKvConfigError(`auto postage ${name} must be a positive integer string.`);
  }

  return value;
}

function normalizeIntegerAtLeast(value: number, name: string, min: number): number {
  if (!Number.isInteger(value) || value < min) {
    throw new SwarmKvConfigError(`auto postage ${name} must be an integer greater than or equal to ${min}.`);
  }

  return value;
}

function normalizePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SwarmKvConfigError(`auto postage ${name} must be a positive integer.`);
  }

  return value;
}

function normalizeNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new SwarmKvConfigError(`auto postage ${name} must be a non-negative integer.`);
  }

  return value;
}

function normalizeOperationTimeoutMs(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SwarmKvConfigError(`${name} must be a positive integer number of milliseconds.`);
  }

  return value;
}

function normalizeNonEmptyString(value: string, name: string): string {
  if (value.trim() === "") {
    throw new SwarmKvConfigError(`auto postage ${name} must be a non-empty string.`);
  }

  return value;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  return url.toString().replace(/\/$/, "");
}

function normalizeReference(value: string): string {
  if (!value) {
    return "";
  }

  const normalized = normalizeHex(value);

  if (normalized.length !== 64 && normalized.length !== 128) {
    throw new SwarmKvConfigError("Swarm references must be 32-byte or 64-byte hex strings.");
  }

  return normalized;
}

function normalizeTopic(value: string): string {
  const normalized = normalizeHex(value);

  if (normalized.length !== 64) {
    throw new SwarmKvConfigError("Swarm feed topics must be 32-byte hex strings.");
  }

  return normalized;
}

function normalizeEthereumAddress(value: string): EthereumAddress {
  const normalized = normalizeHex(value);

  if (normalized.length !== 40) {
    throw new SwarmKvConfigError("Ethereum owner addresses must be 20-byte hex strings.");
  }

  return `0x${normalized}` as EthereumAddress;
}

function assertValidKey(key: SwarmKvKey): void {
  if (typeof key !== "string" || key.trim() === "") {
    throw new SwarmKvConfigError("Swarm KV keys must be non-empty strings.");
  }
}

async function encodeValue(value: SwarmKvValue, contentType?: string): Promise<EncodedValue> {
  if (typeof value === "string") {
    return {
      bytes: new TextEncoder().encode(value),
      contentType: contentType ?? "text/plain;charset=utf-8",
      kind: "string",
      encoding: "utf-8"
    };
  }

  if (value instanceof Uint8Array) {
    return {
      bytes: copyBytes(value),
      contentType: contentType ?? "application/octet-stream",
      kind: "bytes",
      encoding: "binary"
    };
  }

  if (value instanceof ArrayBuffer) {
    return {
      bytes: new Uint8Array(value.slice(0)),
      contentType: contentType ?? "application/octet-stream",
      kind: "bytes",
      encoding: "binary"
    };
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return {
      bytes: new Uint8Array(await value.arrayBuffer()),
      contentType: contentType ?? (value.type || "application/octet-stream"),
      kind: "bytes",
      encoding: "binary"
    };
  }

  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new SwarmKvPayloadError("JSON values must be serializable.");
  }

  return {
    bytes: new TextEncoder().encode(json),
    contentType: contentType ?? "application/json",
    kind: "json",
    encoding: "json"
  };
}

function decodeValue<TValue>(bytes: Uint8Array, kind: SwarmKvValueKind): TValue {
  if (kind === "bytes") {
    return copyBytes(bytes) as TValue;
  }

  const text = new TextDecoder().decode(bytes);

  if (kind === "json") {
    return JSON.parse(text) as TValue;
  }

  return text as TValue;
}

function kindFromContentType(contentType: string): SwarmKvValueKind {
  const normalized = contentType.toLowerCase();

  if (normalized.includes("json")) {
    return "json";
  }

  if (normalized.startsWith("text/")) {
    return "string";
  }

  return "bytes";
}

function normalizeGetOptions(optionsOrReference?: GetOptions | SwarmReference): GetOptions {
  if (!optionsOrReference) {
    return {};
  }

  if (typeof optionsOrReference === "string") {
    return {
      reference: optionsOrReference
    };
  }

  return optionsOrReference;
}

function parseIndex(bytes: Uint8Array): SwarmKvIndexDocument {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  const record = asRecord(parsed);

  if (record["schema"] !== INDEX_SCHEMA || typeof record["namespace"] !== "string") {
    throw new SwarmKvIndexError("Swarm KV index has an unsupported schema.");
  }

  return {
    schema: INDEX_SCHEMA,
    namespace: record["namespace"],
    revision: numberOr(record["revision"], 0),
    updatedAt: stringOr(record["updatedAt"], new Date(0).toISOString()),
    entries: parseEntries(record["entries"]),
    tombstones: parseTombstones(record["tombstones"]),
    ...(typeof record["owner"] === "string" ? { owner: normalizeEthereumAddress(record["owner"]) } : {}),
    ...(typeof record["previousReference"] === "string"
      ? { previousReference: normalizeReference(record["previousReference"]) }
      : {})
  };
}

function parseEntries(value: unknown): Record<string, SwarmKvIndexEntry> {
  const entries: Record<string, SwarmKvIndexEntry> = {};

  for (const [key, rawEntry] of Object.entries(asRecord(value))) {
    const entry = asRecord(rawEntry);
    entries[key] = {
      key: stringOr(entry["key"], key),
      reference: normalizeReference(stringOr(entry["reference"], "")),
      contentType: stringOr(entry["contentType"], "application/octet-stream"),
      kind: parseKind(entry["kind"]),
      encoding: parseEncoding(entry["encoding"]),
      encrypted: Boolean(entry["encrypted"]),
      size: numberOr(entry["size"], 0),
      updatedAt: stringOr(entry["updatedAt"], new Date(0).toISOString()),
      topic: stringOr(entry["topic"], ""),
      version: numberOr(entry["version"], 1)
    };
  }

  return entries;
}

function parseTombstones(value: unknown): Record<string, SwarmKvTombstone> {
  const tombstones: Record<string, SwarmKvTombstone> = {};

  for (const [key, rawTombstone] of Object.entries(asRecord(value))) {
    const tombstone = asRecord(rawTombstone);
    tombstones[key] = {
      key: stringOr(tombstone["key"], key),
      deletedAt: stringOr(tombstone["deletedAt"], new Date(0).toISOString()),
      topic: stringOr(tombstone["topic"], ""),
      ...(typeof tombstone["previousReference"] === "string"
        ? { previousReference: normalizeReference(tombstone["previousReference"]) }
        : {})
    };
  }

  return tombstones;
}

function parseKind(value: unknown): SwarmKvValueKind {
  return value === "json" || value === "bytes" || value === "string" ? value : "bytes";
}

function parseEncoding(value: unknown): SwarmKvEncoding {
  return value === "utf-8" || value === "json" || value === "binary" ? value : "binary";
}

function parseEncryptedEnvelope(bytes: Uint8Array): EncryptedEnvelope {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  const record = asRecord(parsed);

  if (record["schema"] !== ENCRYPTED_VALUE_SCHEMA) {
    throw new SwarmKvCryptoError("Encrypted payload has an unsupported schema.");
  }

  return {
    schema: ENCRYPTED_VALUE_SCHEMA,
    algorithm: "AES-256-GCM",
    kdf: parseEncryptionKdf(record["kdf"]),
    namespace: stringOr(record["namespace"], ""),
    owner: normalizeEthereumAddress(stringOr(record["owner"], "")),
    iv: stringOr(record["iv"], ""),
    ciphertext: stringOr(record["ciphertext"], "")
  };
}

function parseEncryptionKdf(value: unknown): SwarmKvEncryptionKdf {
  if (value === undefined) {
    return "ethereum-personal-sign-sha256-v1";
  }

  if (value === "ethereum-personal-sign-sha256-v1" || value === "swarm-kv-key-sha256-v1") {
    return value;
  }

  throw new SwarmKvCryptoError("Encrypted payload has an unsupported key derivation method.");
}

function isEncryptedPayload(bytes: Uint8Array): boolean {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return asRecord(parsed)["schema"] === ENCRYPTED_VALUE_SCHEMA;
  } catch {
    return false;
  }
}

function sortIndex(index: SwarmKvIndexDocument): SwarmKvIndexDocument {
  return {
    ...index,
    entries: Object.fromEntries(Object.entries(index.entries).sort(([a], [b]) => a.localeCompare(b))),
    tombstones: Object.fromEntries(Object.entries(index.tombstones).sort(([a], [b]) => a.localeCompare(b)))
  };
}

function cloneIndex(index: SwarmKvIndexDocument): SwarmKvIndexDocument {
  return {
    ...index,
    entries: { ...index.entries },
    tombstones: { ...index.tombstones }
  };
}

function removeKey<TValue>(record: Record<string, TValue>, key: string): Record<string, TValue> {
  const next = { ...record };
  delete next[key];
  return next;
}

function extractReference(value: unknown): SwarmReference {
  const record = asRecord(value);
  const reference = stringOr(record["reference"], stringOr(record["ref"], ""));

  if (!reference) {
    throw new SwarmKvGatewayError("Bee response did not include a Swarm reference.", 500, "Invalid Bee response");
  }

  return normalizeReference(reference);
}

function parsePostageStamps(value: unknown): BeePostageStamp[] {
  const stamps = asRecord(value)["stamps"];

  if (!Array.isArray(stamps)) {
    return [];
  }

  return stamps
    .map((stamp) => {
      const record = asRecord(stamp);
      const batchId = extractBatchId(record);

      if (!batchId) {
        return null;
      }

      return {
        batchId: normalizeReference(batchId),
        usable: record["usable"] !== false,
        exists: record["exists"] !== false,
        expired: record["expired"] === true,
        depth: numberOr(record["depth"], 0),
        amount: stringOr(record["amount"], ""),
        batchTTL: numberOr(record["batchTTL"], 0),
        utilization: numberOr(record["utilization"], 0),
        ...(typeof record["label"] === "string" && record["label"] ? { label: record["label"] } : {})
      } satisfies BeePostageStamp;
    })
    .filter((stamp): stamp is BeePostageStamp => stamp !== null);
}

function isSelectablePostageStamp(stamp: BeePostageStamp, policy: NormalizedPostagePolicy): boolean {
  return (
    hasSelectablePostageBasics(stamp, policy) &&
    stamp.batchTTL >= policy.minBatchTTL
  );
}

function isAutoPostageCandidate(stamp: BeePostageStamp, policy: NormalizedPostagePolicy): boolean {
  if (!hasSelectablePostageBasics(stamp, policy)) {
    return false;
  }

  return isSelectablePostageStamp(stamp, policy) || isTopUpCandidatePostageStamp(stamp, policy);
}

function isTopUpCandidatePostageStamp(stamp: BeePostageStamp, policy: NormalizedPostagePolicy): boolean {
  return Boolean(
    policy.topUpAmount &&
      policy.topUpBelowTTL !== undefined &&
      stamp.batchTTL < policy.topUpBelowTTL
  );
}

function hasSelectablePostageBasics(stamp: BeePostageStamp, policy: NormalizedPostagePolicy): boolean {
  if (!stamp.usable || !stamp.exists || stamp.expired || stamp.depth < policy.minDepth) {
    return false;
  }

  if (policy.label !== undefined && stamp.label !== policy.label) {
    return false;
  }

  if (policy.labelPrefix !== undefined && !stamp.label?.startsWith(policy.labelPrefix)) {
    return false;
  }

  return policy.selectBatch ? policy.selectBatch(stamp) : true;
}

function comparePostageStamps(
  left: BeePostageStamp,
  right: BeePostageStamp,
  policy: NormalizedPostagePolicy
): number {
  const leftSelectable = isSelectablePostageStamp(left, policy);
  const rightSelectable = isSelectablePostageStamp(right, policy);

  if (leftSelectable !== rightSelectable) {
    return leftSelectable ? -1 : 1;
  }

  const utilizationDelta = left.utilization - right.utilization;

  if (utilizationDelta !== 0) {
    return utilizationDelta;
  }

  const depthDelta = right.depth - left.depth;

  if (depthDelta !== 0) {
    return depthDelta;
  }

  return right.batchTTL - left.batchTTL;
}

function postageResultFromStamp(
  stamp: BeePostageStamp,
  source: PostageBatchResult["source"]
): PostageBatchResult {
  return {
    batchId: stamp.batchId,
    source,
    depth: stamp.depth,
    amount: stamp.amount,
    ...(stamp.label ? { label: stamp.label } : {}),
    batchTTL: stamp.batchTTL,
    utilization: stamp.utilization
  };
}

function extractBatchId(value: unknown): string | null {
  const record = asRecord(value);
  const batchId = record["batchID"] ?? record["batchId"] ?? record["id"];
  return typeof batchId === "string" ? batchId : null;
}

function buildTreeReference(bytes: Uint8Array): { reference: SwarmReference; span: bigint } {
  if (bytes.byteLength <= SWARM_CHUNK_PAYLOAD_SIZE) {
    const chunk = makeContentAddressedChunk(bytes, BigInt(bytes.byteLength));
    return {
      reference: chunk.reference,
      span: BigInt(bytes.byteLength)
    };
  }

  let nodes: Array<{ reference: SwarmReference; span: bigint }> = [];

  for (let offset = 0; offset < bytes.byteLength; offset += SWARM_CHUNK_PAYLOAD_SIZE) {
    nodes.push(buildTreeReference(bytes.slice(offset, offset + SWARM_CHUNK_PAYLOAD_SIZE)));
  }

  while (nodes.length > 1) {
    const next: Array<{ reference: SwarmReference; span: bigint }> = [];

    for (let offset = 0; offset < nodes.length; offset += SWARM_BRANCHING_FACTOR) {
      const group = nodes.slice(offset, offset + SWARM_BRANCHING_FACTOR);
      const childReferences = group.map((node) => hexToBytes(node.reference));
      const span = group.reduce((total, node) => total + node.span, 0n);
      const chunk = makeContentAddressedChunk(concatBytes(childReferences), span);
      next.push({
        reference: chunk.reference,
        span
      });
    }

    nodes = next;
  }

  const [root] = nodes;

  if (!root) {
    throw new SwarmKvPayloadError("Unable to compute Swarm reference for empty tree.");
  }

  return root;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function resolveEncryptionKeyMaterial(
  provider: SwarmKvEncryptionKeyProvider,
  context: SwarmKvEncryptionKeyContext
): Promise<SwarmKvEncryptionKeyMaterial> {
  return typeof provider === "function" ? provider(context) : provider;
}

async function importAesGcmKey(material: SwarmKvEncryptionKeyMaterial): Promise<CryptoKey> {
  if (isCryptoKey(material)) {
    return material;
  }

  const bytes = encryptionMaterialToBytes(material);

  if (bytes.byteLength === 0) {
    throw new SwarmKvCryptoError("encryptionKey must not be empty.");
  }

  const digest = await subtle().digest("SHA-256", asBufferSource(bytes));
  return subtle().importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function encryptionMaterialToBytes(material: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof material === "string") {
    return material.startsWith("0x") ? hexToBytes(material) : new TextEncoder().encode(material);
  }

  if (material instanceof Uint8Array) {
    return copyBytes(material);
  }

  return new Uint8Array(material.slice(0));
}

function isCryptoKey(value: SwarmKvEncryptionKeyMaterial): value is CryptoKey {
  return typeof CryptoKey !== "undefined" && value instanceof CryptoKey;
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;

  if (!api) {
    throw new SwarmKvCryptoError("WebCrypto subtle crypto is not available in this runtime.");
  }

  return api;
}

function randomBytes(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    throw new SwarmKvCryptoError("WebCrypto getRandomValues is not available in this runtime.");
  }

  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as BufferSource;
}

function encryptionAdditionalData(namespace: string, key: SwarmKvKey): Uint8Array {
  return new TextEncoder().encode(`${ENCRYPTED_VALUE_SCHEMA}\0${namespace}\0${key}`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function ungzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return bytes;
  }

  if (typeof DecompressionStream === "undefined") {
    throw new SwarmKvGatewayError(
      "Bee API returned gzipped JSON without a Content-Encoding header, and this runtime does not provide DecompressionStream.",
      0,
      "Unsupported Runtime"
    );
  }

  const stream = new Blob([copyArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfSignalAborted(signal);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(operationAbortError(signal));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortController(controller: AbortController, reason: unknown): void {
  if (!controller.signal.aborted) {
    controller.abort(reason);
  }
}

function signalAbortReason(signal: AbortSignal | undefined): unknown {
  return signal && "reason" in signal ? signal.reason : undefined;
}

function throwIfSignalAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw operationAbortError(signal);
  }
}

function operationAbortError(signal: AbortSignal | undefined): Error {
  const reason = signalAbortReason(signal);

  if (reason instanceof SwarmKvError) {
    return reason;
  }

  if (reason instanceof Error && reason.name === "TimeoutError") {
    return new SwarmKvTimeoutError(reason.message || "Swarm KV operation timed out.");
  }

  if (reason instanceof Error && reason.name !== "AbortError") {
    return new SwarmKvAbortError(`Swarm KV operation aborted: ${reason.message}`);
  }

  return new SwarmKvAbortError("Swarm KV operation aborted.");
}
