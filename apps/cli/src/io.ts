import { stdin, stdout } from "node:process";
import { CliError } from "./errors.js";

export interface OutputContext {
  json: boolean;
  yes: boolean;
}

/**
 * The non-interactive command contract:
 *   - `--json` prints exactly one JSON envelope to stdout.
 *   - on success: { ok: true, data: ... }, exit 0
 *   - on failure: { ok: false, error: { code, message } } to stderr, non-zero exit
 *   - heartbeat-style streaming commands emit one JSON object per line (NDJSON);
 *     in that case, callers bypass emitResult and write directly with emitNdjson.
 */
export function emitResult<T>(ctx: OutputContext, data: T, pretty?: () => void) {
  if (ctx.json) {
    stdout.write(JSON.stringify({ ok: true, data: serialize(data) }) + "\n");
  } else if (pretty) {
    pretty();
  } else {
    stdout.write(JSON.stringify(serialize(data), null, 2) + "\n");
  }
}

export function emitError(ctx: OutputContext, err: CliError) {
  if (ctx.json) {
    process.stderr.write(
      JSON.stringify({ ok: false, error: { code: err.code, message: err.message } }) + "\n",
    );
  } else {
    process.stderr.write(`error [${err.code}]: ${err.message}\n`);
  }
  process.exit(err.exitCode);
}

export function emitNdjson(obj: unknown) {
  stdout.write(JSON.stringify(serialize(obj)) + "\n");
}

function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

export function requireInteractive(ctx: OutputContext): void {
  if (ctx.json) {
    throw new CliError(
      "INTERACTIVE_PROMPT_REQUIRED",
      "this command needs interactive input or pre-set env vars; cannot run with --json without the appropriate env vars (PRIVATE_KEY, TM_KEYSTORE_PASSPHRASE, TM_VAULT_PASSPHRASE).",
    );
  }
}

/** One-line non-echoing read from stdin (TTY only). */
export async function promptSecret(prompt: string): Promise<string> {
  if (!stdin.isTTY) {
    throw new CliError(
      "INTERACTIVE_PROMPT_REQUIRED",
      "stdin is not a TTY; set the relevant env var to run non-interactively.",
    );
  }
  process.stderr.write(prompt);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode?.(true);
  stdin.resume();
  let buf = "";
  try {
    for await (const chunk of stdin) {
      const s = chunk.toString("utf8");
      for (const ch of s) {
        if (ch === "\r" || ch === "\n") {
          process.stderr.write("\n");
          return buf;
        }
        if (ch.charCodeAt(0) === 3) {
          // ctrl-c
          process.stderr.write("\n");
          process.exit(130);
        }
        if (ch.charCodeAt(0) === 127 || ch === "\b") {
          buf = buf.slice(0, -1);
        } else {
          buf += ch;
        }
      }
    }
    return buf;
  } finally {
    stdin.setRawMode?.(wasRaw ?? false);
    stdin.pause();
  }
}

