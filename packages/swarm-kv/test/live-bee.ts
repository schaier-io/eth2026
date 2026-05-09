export interface BeeStamp {
  batchID?: string;
  batchId?: string;
  id?: string;
  usable?: boolean;
  exists?: boolean;
  expired?: boolean;
  batchTTL?: number;
}

const warnedSkippedSuites = new Set<string>();

export function warnSkippedLiveBeeE2e(suiteName: string, missingConfig: string[]): void {
  if (missingConfig.length === 0 || warnedSkippedSuites.has(suiteName)) {
    return;
  }

  warnedSkippedSuites.add(suiteName);
  const message = [
    `[swarm-kv:e2e] Skipping "${suiteName}" because live Bee configuration is missing.`,
    `Missing: ${missingConfig.join(", ")}.`,
    "Enable it by starting a Bee API with a usable postage batch, then run:",
    "  SWARM_KV_BEE_API_URL=http://localhost:1633 \\",
    "  SWARM_POSTAGE_BATCH_ID=<64-byte-batch-id> \\",
    "  pnpm test:e2e",
    "Optional: set SWARM_E2E_GATEWAY_URL when reads should use a different gateway.",
    "See README.md and docs/local-swarm-gateway.md for Bee setup details."
  ].join("\n");

  process.stderr.write(`${message}\n`);
}

export function logPublicGatewayFallback(suiteName: string, beeApiUrl: string): void {
  if (warnedSkippedSuites.has(`${suiteName}:public-gateway`)) {
    return;
  }

  warnedSkippedSuites.add(`${suiteName}:public-gateway`);
  process.stderr.write(
    [
      `[swarm-kv:e2e] Running "${suiteName}" against the Swarm public testnet upload gateway.`,
      `Gateway: ${beeApiUrl}.`,
      "Set SWARM_KV_BEE_API_URL and SWARM_POSTAGE_BATCH_ID to use a local Bee node instead."
    ].join("\n") + "\n"
  );
}

export async function waitForUsablePostageBatch(
  beeApiUrl: string,
  batchId: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "not checked";

  while (Date.now() <= deadline) {
    const stamps = await getStamps(beeApiUrl);
    const stamp = stamps.find((candidate) => normalizeBatchId(candidate) === batchId.toLowerCase());

    if (stamp?.usable !== false && stamp?.exists !== false && stamp?.expired !== true) {
      return;
    }

    if (stamp) {
      lastStatus = JSON.stringify(stamp);
    } else {
      lastStatus = `batch ${batchId} was not returned by ${beeApiUrl}/stamps`;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    [
      `Postage batch ${batchId} is not usable yet according to Bee.`,
      `Last status: ${lastStatus}`,
      "If this batch was just bought, wait a few minutes for Bee to index it.",
      "If it never appears, the batch likely belongs to another Bee profile/network or the id is wrong."
    ].join(" ")
  );
}

async function getStamps(beeApiUrl: string): Promise<BeeStamp[]> {
  const response = await fetch(`${beeApiUrl}/stamps`);

  if (!response.ok) {
    throw new Error(`Bee /stamps failed: ${response.status} ${response.statusText} - ${await response.text()}`);
  }

  const json = (await response.json()) as { stamps?: BeeStamp[] };
  return Array.isArray(json.stamps) ? json.stamps : [];
}

function normalizeBatchId(stamp: BeeStamp): string | null {
  const value = stamp.batchID ?? stamp.batchId ?? stamp.id;
  return typeof value === "string" ? value.toLowerCase() : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
