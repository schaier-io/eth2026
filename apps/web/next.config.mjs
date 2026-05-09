import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appDir, "../..");
const publicRootEnvKeys = new Set([
  "NEXT_PUBLIC_TRUTHMARKET_ADDRESS",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL",
  "NEXT_PUBLIC_SEPOLIA_RPC_URL",
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
]);

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadRepoRootPublicEnv() {
  const envPath = resolve(repoRoot, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!publicRootEnvKeys.has(key) || process.env[key]) continue;

    process.env[key] = unquoteEnvValue(rawValue);
  }
}

loadRepoRootPublicEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: new URL(".", import.meta.url).pathname,
  },
};

export default nextConfig;
