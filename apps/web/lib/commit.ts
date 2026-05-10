import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/** Cryptographically random 32-byte nonce. */
export function generateNonce(): Hex {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let hex = "0x";
  for (const byte of buf) hex += byte.toString(16).padStart(2, "0");
  return hex as Hex;
}

/**
 * Local mirror of TruthMarket._commitHash:
 *   keccak256(abi.encode(uint8 vote, bytes32 nonce, address voter, uint256 chainid, address contract))
 *
 * Verified against the on-chain `commitHashOf` in apps/cli/test/commit-hash.test.ts.
 */
export function computeCommitHash(args: {
  vote: 1 | 2;
  nonce: Hex;
  voter: Address;
  chainId: number | bigint;
  contract: Address;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
      ],
      [args.vote, args.nonce, args.voter, BigInt(args.chainId), args.contract],
    ),
  );
}

/** Per-(market, wallet) localStorage namespace for the nonce/vote vault. */
export function vaultKey(market: Address, wallet: Address, chainId?: number | bigint): string {
  if (chainId !== undefined) {
    return `truthmarket:vault:v2:${String(chainId)}:${market.toLowerCase()}:${wallet.toLowerCase()}`;
  }
  return `truthmarket:vault:${market.toLowerCase()}:${wallet.toLowerCase()}`;
}

export interface VaultEntry {
  schema: "truthmarket.reveal-vault.v1";
  version: 2;
  chainId: number;
  /** Contract clone address. Kept explicit so downloaded backups are self-contained. */
  contractCloneId: Address;
  market: Address;
  voter: Address;
  vote: 1 | 2;
  nonce: Hex;
  stake: string;
  commitHash: Hex;
  txHash?: Hex;
  committedAt: number;
}

export function readVault(market: Address, wallet: Address, chainId: number | bigint): VaultEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(vaultKey(market, wallet, chainId)) ??
      window.localStorage.getItem(vaultKey(market, wallet));
    if (!raw) return null;
    return normalizeVaultEntry(JSON.parse(raw) as Partial<VaultEntry>, market, wallet, Number(chainId));
  } catch {
    return null;
  }
}

export function writeVault(market: Address, wallet: Address, chainId: number | bigint, entry: VaultEntry): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(vaultKey(market, wallet, chainId), JSON.stringify(entry));
  window.localStorage.removeItem(vaultKey(market, wallet));
}

export function clearVault(market: Address, wallet: Address, chainId?: number | bigint): void {
  if (typeof window === "undefined") return;
  if (chainId !== undefined) window.localStorage.removeItem(vaultKey(market, wallet, chainId));
  window.localStorage.removeItem(vaultKey(market, wallet));
}

export function createVaultEntry(args: {
  market: Address;
  wallet: Address;
  chainId: number | bigint;
  vote: 1 | 2;
  nonce: Hex;
  stake: string;
  commitHash: Hex;
  txHash?: Hex;
}): VaultEntry {
  return {
    schema: "truthmarket.reveal-vault.v1",
    version: 2,
    chainId: Number(args.chainId),
    contractCloneId: args.market,
    market: args.market,
    voter: args.wallet,
    vote: args.vote,
    nonce: args.nonce,
    stake: args.stake,
    commitHash: args.commitHash,
    ...(args.txHash ? { txHash: args.txHash } : {}),
    committedAt: Math.floor(Date.now() / 1000),
  };
}

export function downloadVaultBackup(entry: VaultEntry): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(entry, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `truthmarket-reveal-${entry.chainId}-${entry.contractCloneId.slice(0, 10)}-${entry.voter.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function normalizeVaultEntry(
  parsed: Partial<VaultEntry>,
  market: Address,
  wallet: Address,
  chainId: number,
): VaultEntry | null {
  if (parsed.vote !== 1 && parsed.vote !== 2) return null;
  if (typeof parsed.nonce !== "string" || !parsed.nonce.startsWith("0x")) return null;
  if (typeof parsed.stake !== "string") return null;

  const vote = parsed.vote;
  const nonce = parsed.nonce as Hex;
  const normalizedChainId = Number(parsed.chainId || chainId);
  const commitHash =
    typeof parsed.commitHash === "string" && parsed.commitHash.startsWith("0x")
      ? parsed.commitHash as Hex
      : computeCommitHash({ vote, nonce, voter: wallet, chainId: normalizedChainId, contract: market });

  return {
    schema: "truthmarket.reveal-vault.v1",
    version: 2,
    chainId: normalizedChainId,
    contractCloneId: (parsed.contractCloneId ?? parsed.market ?? market) as Address,
    market: (parsed.market ?? market) as Address,
    voter: (parsed.voter ?? wallet) as Address,
    vote,
    nonce,
    stake: parsed.stake,
    commitHash,
    ...(parsed.txHash ? { txHash: parsed.txHash } : {}),
    committedAt: typeof parsed.committedAt === "number" ? parsed.committedAt : Math.floor(Date.now() / 1000),
  };
}
