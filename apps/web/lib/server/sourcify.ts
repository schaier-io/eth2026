import "server-only";

import { getAddress, type Address, type PublicClient } from "viem";
import { registryAddress, truthMarketRegistryAbi } from "../registry";
import {
  cloneRuntimeMatchesImplementation,
  normalizeSourcifyMatch,
  sourcifyRepoUrl,
  type ContractVerification,
  type SourcifyMatch,
} from "../contract-verification";

const SOURCIFY_SERVER_URL = (process.env.SOURCIFY_SERVER_URL ?? "https://sourcify.dev/server").replace(/\/$/, "");
const SOURCIFY_TIMEOUT_MS = Number(process.env.SOURCIFY_TIMEOUT_MS ?? 3500);

interface SourcifyContractResponse {
  match?: string;
  runtimeMatch?: string;
  creationMatch?: string;
  address?: string;
  chainId?: string;
}

export async function lookupSourcifyMatch(
  chainId: number,
  address: Address,
): Promise<{ match?: SourcifyMatch; url: string; address: Address; ok: boolean }> {
  const checksum = getAddress(address);
  const url = `${SOURCIFY_SERVER_URL}/v2/contract/${chainId}/${checksum}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SOURCIFY_TIMEOUT_MS),
      next: { revalidate: 5 * 60 },
    });
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

export async function readRegistryImplementation(client: PublicClient): Promise<Address | undefined> {
  if (!registryAddress) return undefined;
  try {
    return (await client.readContract({
      address: registryAddress,
      abi: truthMarketRegistryAbi,
      functionName: "implementation",
    })) as Address;
  } catch {
    return undefined;
  }
}

export async function verifyMarketCloneContract(opts: {
  client: PublicClient;
  chainId: number;
  market: Address;
  implementation: Address | undefined;
  implementationSourcify?: Awaited<ReturnType<typeof lookupSourcifyMatch>>;
}): Promise<ContractVerification> {
  const market = getAddress(opts.market);
  let code: `0x${string}` | undefined;
  try {
    code = await opts.client.getCode({ address: market });
  } catch {
    code = undefined;
  }

  const cloneMatches = cloneRuntimeMatchesImplementation(code, opts.implementation);
  const implementationSourcify =
    opts.implementation && opts.implementationSourcify
      ? opts.implementationSourcify
      : opts.implementation
        ? await lookupSourcifyMatch(opts.chainId, opts.implementation)
        : undefined;
  const sourcifyMatch = implementationSourcify?.match;
  const sourcifyAddress = implementationSourcify?.address;
  const sourcifyUrl = implementationSourcify?.url;

  if (cloneMatches === false) {
    return {
      status: "mismatch",
      label: "Clone mismatch",
      title: "This market's runtime bytecode does not match the registry implementation clone pattern.",
      cloneMatches,
      chainId: opts.chainId,
      market,
      implementation: opts.implementation,
      sourcifyMatch,
      sourcifyAddress,
      sourcifyUrl,
    };
  }

  if (cloneMatches === true && sourcifyMatch === "exact_match") {
    return {
      status: "verified",
      label: "Sourcify verified",
      title: `Clone bytecode matches the registry implementation. Sourcify reports an exact match for ${shortAddress(sourcifyAddress)}.`,
      cloneMatches,
      chainId: opts.chainId,
      market,
      implementation: opts.implementation,
      sourcifyMatch,
      sourcifyAddress,
      sourcifyUrl,
    };
  }

  if (cloneMatches === true && sourcifyMatch === "match") {
    return {
      status: "verified",
      label: "Sourcify verified",
      title: `Clone bytecode matches the registry implementation. Sourcify reports a source match for ${shortAddress(sourcifyAddress)}.`,
      cloneMatches,
      chainId: opts.chainId,
      market,
      implementation: opts.implementation,
      sourcifyMatch,
      sourcifyAddress,
      sourcifyUrl,
    };
  }

  if (cloneMatches === true && implementationSourcify?.ok === false) {
    return {
      status: "unknown",
      label: "Sourcify unavailable",
      title: "Clone bytecode matches the registry implementation, but Sourcify could not be reached.",
      cloneMatches,
      chainId: opts.chainId,
      market,
      implementation: opts.implementation,
      sourcifyAddress,
      sourcifyUrl,
    };
  }

  if (cloneMatches === true) {
    return {
      status: "clone-checked",
      label: "Clone checked",
      title: "Clone bytecode matches the registry implementation. Sourcify does not currently have a match for that implementation.",
      cloneMatches,
      chainId: opts.chainId,
      market,
      implementation: opts.implementation,
      sourcifyAddress,
      sourcifyUrl,
    };
  }

  return {
    status: "unknown",
    label: "Code unchecked",
    title: "Could not read enough bytecode or registry data to verify this clone.",
    cloneMatches,
    chainId: opts.chainId,
    market,
    implementation: opts.implementation,
    sourcifyAddress,
    sourcifyUrl,
  };
}

function shortAddress(addr: Address | undefined): string {
  if (!addr) return "implementation";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
