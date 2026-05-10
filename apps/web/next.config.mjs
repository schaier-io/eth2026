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
  "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_STAKE_TOKEN",
  "NEXT_PUBLIC_JURY_COMMITTER",
  "NEXT_PUBLIC_SWARM_GATEWAY_URL",
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

function remotePatternFromUrl(raw) {
  try {
    const url = new URL(raw);
    return {
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      port: url.port || undefined,
      pathname: "/**",
    };
  } catch {
    return null;
  }
}

const swarmImageGateways = [
  process.env.NEXT_PUBLIC_SWARM_GATEWAY_URL,
  process.env.SWARM_GATEWAY_URL,
  "https://download.gateway.ethswarm.org",
  "https://api.gateway.ethswarm.org",
  "https://api.gateway.testnet.ethswarm.org",
]
  .map(remotePatternFromUrl)
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@truth-market/swarm-kv", "@truth-market/swarm-verified-fetch"],
  images: {
    remotePatterns: swarmImageGateways,
  },
  turbopack: {
    root: repoRoot,
    resolveAlias: {
      "@truth-market/swarm-kv": "../../packages/swarm-kv/dist/index.js",
      "@truth-market/swarm-verified-fetch":
        "../../packages/swarm-verified-fetch/dist/index.js",
      "@noble/curves/secp256k1.js": "./node_modules/@noble/curves/secp256k1.js",
      "@noble/hashes/sha3.js": "./node_modules/@noble/hashes/sha3.js",
    },
  },
};

export default nextConfig;
