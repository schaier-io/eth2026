import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { truthMarketRegistryAbi } from "../abi.js";
import type { ResolvedConfig } from "../config.js";
import { CliError } from "../errors.js";

export type SourcifyMatch = "exact_match" | "match";

export type MarketIntegrityStatus =
  | "verified"
  | "clone-checked"
  | "mismatch"
  | "unknown";

export interface SourcifyLookup {
  match?: SourcifyMatch;
  url: string;
  address: Address;
  ok: boolean;
}

export interface MarketIntegrity {
  status: MarketIntegrityStatus;
  label: string;
  title: string;
  cloneMatches: boolean | null;
  chainId: number;
  market: Address;
  implementation?: Address;
  sourcifyMatch?: SourcifyMatch;
  sourcifyUrl?: string;
}

const EIP_1167_RUNTIME_PREFIX = "363d3d373d3d3d363d73";
const EIP_1167_RUNTIME_SUFFIX = "5af43d82803e903d91602b57fd5bf3";
const SOURCIFY_SERVER_URL = (process.env.SOURCIFY_SERVER_URL ?? "https://sourcify.dev/server").replace(/\/$/, "");
const SOURCIFY_TIMEOUT_MS = Number(process.env.SOURCIFY_TIMEOUT_MS ?? 3500);

interface SourcifyContractResponse {
  match?: string;
}

export function expectedMinimalCloneRuntime(implementation: Address): Hex {
  return `0x${EIP_1167_RUNTIME_PREFIX}${implementation.slice(2).toLowerCase()}${EIP_1167_RUNTIME_SUFFIX}`;
}

export function cloneRuntimeMatchesImplementation(code: Hex | undefined, implementation: Address | undefined): boolean | null {
  if (!code || !implementation) return null;
  return code.toLowerCase() === expectedMinimalCloneRuntime(implementation).toLowerCase();
}

export function normalizeSourcifyMatch(value: unknown): SourcifyMatch | undefined {
  return value === "exact_match" || value === "match" ? value : undefined;
}

export function sourcifyRepoUrl(chainId: number, address: Address): string {
  return `https://repo.sourcify.dev/${chainId}/${getAddress(address)}`;
}

export async function lookupSourcifyMatch(chainId: number, address: Address): Promise<SourcifyLookup> {
  const checksum = getAddress(address);
  const url = `${SOURCIFY_SERVER_URL}/v2/contract/${chainId}/${checksum}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SOURCIFY_TIMEOUT_MS) });
    if (res.status === 404) {
      return { url: sourcifyRepoUrl(chainId, checksum), address: checksum, ok: true };
    }
    if (!res.ok) {
      return { url: sourcifyRepoUrl(chainId, checksum), address: checksum, ok: false };
    }
    const body = (await res.json()) as SourcifyContractResponse;
    return {
      match: normalizeSourcifyMatch(body.match),
      url: sourcifyRepoUrl(chainId, checksum),
      address: checksum,
      ok: true,
    };
  } catch {
    return { url: sourcifyRepoUrl(chainId, checksum), address: checksum, ok: false };
  }
}

export async function readRegistryImplementation(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<Address | undefined> {
  try {
    return (await client.readContract({
      address: cfg.registryAddress,
      abi: truthMarketRegistryAbi,
      functionName: "implementation",
    })) as Address;
  } catch {
    return undefined;
  }
}

export async function verifyMarketIntegrity(
  client: PublicClient,
  cfg: ResolvedConfig,
  opts: {
    market?: Address;
    implementation?: Address;
    implementationSourcify?: SourcifyLookup;
  } = {},
): Promise<MarketIntegrity> {
  const market = getAddress(opts.market ?? cfg.contractAddress);
  const implementation = opts.implementation ?? (await readRegistryImplementation(client, cfg));
  let code: Hex | undefined;
  try {
    code = await client.getCode({ address: market });
  } catch {
    code = undefined;
  }

  const cloneMatches = cloneRuntimeMatchesImplementation(code, implementation);
  const implementationSourcify =
    opts.implementationSourcify ??
    (implementation && cfg.chain.id !== 31337 ? await lookupSourcifyMatch(cfg.chain.id, implementation) : undefined);
  const sourcifyMatch = implementationSourcify?.match;
  const sourcifyUrl = implementationSourcify?.url;

  if (cloneMatches === false) {
    return {
      status: "mismatch",
      label: "Clone mismatch",
      title: "Market runtime bytecode does not match the registry implementation clone pattern.",
      cloneMatches,
      chainId: cfg.chain.id,
      market,
      implementation,
      sourcifyMatch,
      sourcifyUrl,
    };
  }

  if (cloneMatches === true && sourcifyMatch) {
    return {
      status: "verified",
      label: "Sourcify verified",
      title: sourcifyMatch === "exact_match"
        ? "Clone bytecode matches the registry implementation. Sourcify reports an exact source match."
        : "Clone bytecode matches the registry implementation. Sourcify reports a source match.",
      cloneMatches,
      chainId: cfg.chain.id,
      market,
      implementation,
      sourcifyMatch,
      sourcifyUrl,
    };
  }

  if (cloneMatches === true) {
    return {
      status: "clone-checked",
      label: "Clone checked",
      title: implementationSourcify?.ok === false
        ? "Clone bytecode matches the registry implementation. Sourcify could not be reached."
        : "Clone bytecode matches the registry implementation. Sourcify does not currently report a source match.",
      cloneMatches,
      chainId: cfg.chain.id,
      market,
      implementation,
      sourcifyUrl,
    };
  }

  return {
    status: "unknown",
    label: "Code unchecked",
    title: "Could not read enough bytecode or registry data to verify this clone.",
    cloneMatches,
    chainId: cfg.chain.id,
    market,
    implementation,
    sourcifyUrl,
  };
}

export function acceptsMarketIntegrity(verification: MarketIntegrity | undefined): boolean {
  return verification?.cloneMatches === true && verification.status !== "mismatch";
}

export function assertMarketIntegrityAccepted(verification: MarketIntegrity): void {
  if (acceptsMarketIntegrity(verification)) return;
  if (verification.status === "mismatch") {
    throw new CliError(
      "MARKET_CLONE_MISMATCH",
      `${verification.market} is registered but its runtime bytecode does not match the registry implementation ${verification.implementation ?? "(unavailable)"}`,
    );
  }
  throw new CliError(
    "MARKET_CODE_UNVERIFIED",
    `could not verify ${verification.market} as a registry minimal clone; refusing to act on it`,
  );
}

export async function assertConfiguredMarketIntegrity(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<MarketIntegrity> {
  const verification = await verifyMarketIntegrity(client, cfg);
  assertMarketIntegrityAccepted(verification);
  return verification;
}
