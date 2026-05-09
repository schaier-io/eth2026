type E2eLogValue = string | number | boolean | null | undefined;
type E2eLogFields = Record<string, E2eLogValue>;

interface PutLike {
  key: string;
  reference: string;
  indexReference: string;
  contentType: string;
  kind: string;
  encrypted: boolean;
  verification?: {
    verified: boolean;
  };
  postageBatch?: {
    source?: string;
    batchId?: string;
  };
}

interface GetLike {
  key: string;
  reference: string;
  contentType: string;
  kind: string;
  encrypted: boolean;
  bytes?: {
    byteLength: number;
  };
  verification?: {
    verified: boolean;
    chunksVerified?: number;
  };
}

export function logE2eTestStart(testName: string): void {
  logE2eStep("test:start", { name: testName });
}

export function logE2eStep(message: string, fields: E2eLogFields = {}): void {
  if (process.env["SWARM_KV_TEST_LOG"] === "0") {
    return;
  }

  const suffix = formatFields(fields);
  process.stderr.write(`[swarm-kv:e2e] ${message}${suffix ? ` ${suffix}` : ""}\n`);
}

export async function traceE2ePut<TPut extends PutLike>(
  fields: E2eLogFields,
  put: () => Promise<TPut>
): Promise<TPut> {
  logE2eStep("put:start", fields);
  const result = await put();

  logE2eStep("put:done", {
    ...fields,
    reference: shortReference(result.reference),
    indexReference: shortReference(result.indexReference),
    contentType: result.contentType,
    kind: result.kind,
    encrypted: result.encrypted,
    verified: result.verification?.verified,
    postage: result.postageBatch?.source
  });

  return result;
}

export function logE2eRead(result: GetLike | null, fields: E2eLogFields = {}): void {
  logE2eStep("get:done", {
    ...fields,
    key: result?.key ?? fields["key"],
    reference: result ? shortReference(result.reference) : null,
    contentType: result?.contentType,
    kind: result?.kind,
    encrypted: result?.encrypted,
    bytes: result?.bytes?.byteLength,
    verified: result?.verification?.verified,
    chunksVerified: result?.verification?.chunksVerified ?? null
  });
}

export function byteLength(value: string | Uint8Array): number {
  return typeof value === "string" ? new TextEncoder().encode(value).byteLength : value.byteLength;
}

function formatFields(fields: E2eLogFields): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
}

function formatValue(value: E2eLogValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

function shortReference(reference: string): string {
  return reference.length > 16 ? `${reference.slice(0, 8)}...${reference.slice(-8)}` : reference;
}
