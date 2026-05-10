import { getAddress, type Address, type Hex } from "viem";

export type SourcifyMatch = "exact_match" | "match";

export type ContractVerificationStatus =
  | "verified"
  | "clone-checked"
  | "unverified"
  | "mismatch"
  | "unknown";

export interface ContractVerification {
  status: ContractVerificationStatus;
  label: string;
  title: string;
  cloneMatches: boolean | null;
  chainId: number;
  market: Address;
  implementation?: Address;
  sourcifyMatch?: SourcifyMatch;
  sourcifyAddress?: Address;
  sourcifyUrl?: string;
}

const EIP_1167_RUNTIME_PREFIX = "363d3d373d3d3d363d73";
const EIP_1167_RUNTIME_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

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

export function acceptsRegistryCloneVerification(verification: ContractVerification | undefined): boolean {
  return verification?.cloneMatches === true && verification.status !== "mismatch";
}
