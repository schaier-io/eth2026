export function logE2e(message: string, fields?: Record<string, unknown>): void {
  if (process.env["SWARM_E2E_OUTPUT"] === "0") {
    return;
  }

  const suffix = fields ? ` ${JSON.stringify(fields, jsonReplacer)}` : "";
  process.stdout.write(`[swarm-verified-fetch:e2e] ${message}${suffix}\n`);
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
