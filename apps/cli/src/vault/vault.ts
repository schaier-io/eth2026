import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  type Address,
  type Hex,
  bytesToHex,
  hexToBytes,
} from "viem";
import type { ResolvedConfig } from "../config.js";
import { CliError } from "../errors.js";
import { atomicWriteFile } from "../util/atomic.js";

const PBKDF2_ITER = 600_000;
const KEY_LEN = 32;
const VERSION = 2 as const;

/**
 * Local plaintext (only ever seen in memory). The nonce is the recoverable
 * secret — without it we cannot reveal a vote we already committed on chain.
 */
export interface VaultEntry {
  market: Address;
  chainId: number;
  voter: Address;
  vote: 1 | 2;
  nonce: Hex;
  stake: string; // bigint as decimal string
  commitTxHash: Hex;
  createdAt: string;
}

/**
 * Encrypted file layout (v2). The `kdfparams`, `version`, market/chain/voter
 * triple, and cipher name are passed to AES-GCM as `additionalData` (AAD), so
 * a tampered header — e.g. an attacker rewriting `kdfparams.iterations` to 1
 * to speed up brute force — invalidates the auth tag and decryption fails.
 */
interface VaultFileV2 {
  version: typeof VERSION;
  market: Address;
  chainId: number;
  voter: Address;
  kdf: "pbkdf2-sha256";
  kdfparams: { iterations: number; saltHex: Hex };
  cipher: "aes-256-gcm";
  ivHex: Hex;
  ciphertextHex: Hex;
  authTagHex: Hex;
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const subtle = globalThis.crypto.subtle;
  const baseKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_LEN * 8 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Canonical AAD covers every public header field that influences how the
 * ciphertext is decrypted. JSON.stringify with a fixed key order is enough —
 * we control both writer and reader.
 */
function canonicalAad(file: Pick<
  VaultFileV2,
  "version" | "market" | "chainId" | "voter" | "kdf" | "kdfparams" | "cipher"
>): Uint8Array {
  const obj = {
    version: file.version,
    market: file.market.toLowerCase(),
    chainId: file.chainId,
    voter: file.voter.toLowerCase(),
    kdf: file.kdf,
    kdfparams: { iterations: file.kdfparams.iterations, saltHex: file.kdfparams.saltHex.toLowerCase() },
    cipher: file.cipher,
  };
  return new TextEncoder().encode(JSON.stringify(obj));
}

export function vaultFilePath(
  cfg: ResolvedConfig,
  voter: Address,
  overrides: { chainId?: number; contractAddress?: Address } = {},
): string {
  const chainId = overrides.chainId ?? cfg.chain.id;
  const contract = (overrides.contractAddress ?? cfg.contractAddress).toLowerCase();
  const v = voter.toLowerCase();
  return path.join(cfg.vaultDir, `${chainId}-${contract}-${v}.json`);
}

export function generateNonce(): Hex {
  return bytesToHex(randomBytes(32));
}

export async function saveVaultEntry(
  cfg: ResolvedConfig,
  passphrase: string,
  entry: VaultEntry,
): Promise<string> {
  const target = vaultFilePath(cfg, entry.voter);
  await mkdir(path.dirname(target), { recursive: true });

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITER);

  const header: Pick<
    VaultFileV2,
    "version" | "market" | "chainId" | "voter" | "kdf" | "kdfparams" | "cipher"
  > = {
    version: VERSION,
    market: entry.market,
    chainId: entry.chainId,
    voter: entry.voter,
    kdf: "pbkdf2-sha256",
    kdfparams: { iterations: PBKDF2_ITER, saltHex: bytesToHex(salt) },
    cipher: "aes-256-gcm",
  };

  const subtle = globalThis.crypto.subtle;
  const plaintext = new TextEncoder().encode(JSON.stringify(entry));
  const ct = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: canonicalAad(header) },
      key,
      plaintext,
    ),
  );
  const ciphertext = ct.slice(0, ct.length - 16);
  const authTag = ct.slice(ct.length - 16);

  const file: VaultFileV2 = {
    ...header,
    ivHex: bytesToHex(iv),
    ciphertextHex: bytesToHex(ciphertext),
    authTagHex: bytesToHex(authTag),
  };
  await atomicWriteFile(target, JSON.stringify(file, null, 2) + "\n", 0o600);
  return target;
}

export async function loadVaultEntry(
  cfg: ResolvedConfig,
  voter: Address,
  passphrase: string,
): Promise<VaultEntry | null> {
  const target = vaultFilePath(cfg, voter);
  try {
    await stat(target);
  } catch {
    return null;
  }
  const raw = await readFile(target, "utf8");
  const file = JSON.parse(raw) as VaultFileV2 | { version: number };
  if (file.version !== VERSION) {
    throw new CliError(
      "VAULT_VERSION",
      `vault file at ${target} is version ${file.version}; expected ${VERSION}. Delete and re-create the entry.`,
    );
  }
  const v2 = file as VaultFileV2;
  if (v2.kdf !== "pbkdf2-sha256") {
    throw new CliError("VAULT_KDF", `unsupported kdf ${v2.kdf}`);
  }
  if (v2.cipher !== "aes-256-gcm") {
    throw new CliError("VAULT_CIPHER", `unsupported cipher ${v2.cipher}`);
  }

  const salt = hexToBytes(v2.kdfparams.saltHex);
  const iv = hexToBytes(v2.ivHex);
  const ct = hexToBytes(v2.ciphertextHex);
  const tag = hexToBytes(v2.authTagHex);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct);
  combined.set(tag, ct.length);

  const key = await deriveKey(passphrase, salt, v2.kdfparams.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: canonicalAad(v2) },
      key,
      combined,
    );
  } catch {
    throw new CliError(
      "VAULT_BAD_PASSPHRASE",
      "vault decryption failed (wrong passphrase, or the file header was tampered with)",
    );
  }
  return JSON.parse(new TextDecoder().decode(plain)) as VaultEntry;
}

export async function listVaultEntries(
  cfg: ResolvedConfig,
): Promise<{ path: string; market: Address; chainId: number; voter: Address }[]> {
  try {
    await stat(cfg.vaultDir);
  } catch {
    return [];
  }
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(cfg.vaultDir);
  const out: {
    path: string;
    market: Address;
    chainId: number;
    voter: Address;
  }[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    if (f.includes(".tmp.")) continue; // skip in-flight atomic writes
    const fp = path.join(cfg.vaultDir, f);
    try {
      const raw = await readFile(fp, "utf8");
      const file = JSON.parse(raw) as VaultFileV2;
      out.push({
        path: fp,
        market: file.market,
        chainId: file.chainId,
        voter: file.voter,
      });
    } catch {
      // skip malformed entries; surface via 'vault show' error path
    }
  }
  return out;
}

export async function exportVaultBlob(
  cfg: ResolvedConfig,
  voter: Address,
): Promise<string> {
  const target = vaultFilePath(cfg, voter);
  const raw = await readFile(target, "utf8");
  return Buffer.from(raw, "utf8").toString("base64");
}

export async function importVaultBlob(
  cfg: ResolvedConfig,
  blobBase64: string,
): Promise<string> {
  const decoded = Buffer.from(blobBase64, "base64").toString("utf8");
  const file = JSON.parse(decoded) as VaultFileV2;
  await mkdir(cfg.vaultDir, { recursive: true });
  const target = vaultFilePath(cfg, file.voter, {
    chainId: file.chainId,
    contractAddress: file.market,
  });
  await atomicWriteFile(target, decoded, 0o600);
  return target;
}
