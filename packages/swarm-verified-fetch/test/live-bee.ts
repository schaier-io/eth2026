export interface BeeStamp {
  batchID?: string;
  batchId?: string;
  id?: string;
  usable?: boolean;
  exists?: boolean;
  expired?: boolean;
  batchTTL?: number;
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
