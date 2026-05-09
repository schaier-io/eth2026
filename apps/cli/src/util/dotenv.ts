import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Minimal .env loader. Walks up from cwd looking for a `.env` file and merges
 * any KEY=VALUE pairs into `process.env` — but only ones that aren't already
 * set, so explicit shell exports always win.
 *
 * Format supported:
 *   - `KEY=value`
 *   - `KEY="value with spaces"` and `'single quoted'`
 *   - `# comment lines` and trailing blank lines
 *
 * No multiline values, no escapes, no variable interpolation. Anything else
 * ships in the shell, where it belongs.
 */
export interface DotenvLoadOptions {
  /** Override starting directory; default = process.cwd(). */
  startDir?: string;
  /** Maximum directory levels to walk up from startDir. Default 5. */
  maxDepth?: number;
  /** Override the file name; default `.env`. */
  filename?: string;
}

export interface DotenvLoadResult {
  /** Absolute path to the file we loaded, or null if none found. */
  path: string | null;
  /** Parsed entries (whether or not they made it into process.env). */
  parsed: Record<string, string>;
  /** Keys actually set on process.env this call. */
  applied: string[];
}

export function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    // Strip a wrapping pair of double or single quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadDotenv(opts: DotenvLoadOptions = {}): DotenvLoadResult {
  const filename = opts.filename ?? ".env";
  const maxDepth = opts.maxDepth ?? 5;
  let dir = opts.startDir ?? process.cwd();
  for (let i = 0; i < maxDepth; i++) {
    const candidate = path.join(dir, filename);
    if (existsSync(candidate)) {
      const content = readFileSync(candidate, "utf8");
      const parsed = parseDotenv(content);
      const applied: string[] = [];
      for (const [k, v] of Object.entries(parsed)) {
        if (!(k in process.env) || process.env[k] === undefined || process.env[k] === "") {
          process.env[k] = v;
          applied.push(k);
        }
      }
      return { path: candidate, parsed, applied };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { path: null, parsed: {}, applied: [] };
}
