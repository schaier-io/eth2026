import { mkdir, readFile, stat } from "node:fs/promises";
import { createCipheriv, createDecipheriv, scrypt } from "node:crypto";
import path from "node:path";
import {
  type Address,
  type Hex,
  bytesToHex,
  hexToBytes,
  isHex,
} from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { CliError } from "../errors.js";
import { atomicWriteFile } from "../util/atomic.js";

const SCRYPT_N = 1 << 17; // 131072
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const VERSION = 2 as const;

/**
 * v2: AES-GCM auth tag now covers a canonical AAD over (version, address,
 * kdf, kdfparams, cipher) so a tampered header — e.g. an attacker rewriting
 * the scrypt N parameter to weaken the KDF — fails to decrypt.
 */
export interface KeystoreFile {
  version: typeof VERSION;
  address: Address;
  kdf: "scrypt";
  kdfparams: { N: number; r: number; p: number; saltHex: Hex };
  cipher: "aes-256-gcm";
  ivHex: Hex;
  ciphertextHex: Hex;
  authTagHex: Hex;
}

async function scryptKey(
  passphrase: string,
  salt: Uint8Array,
  params: { N: number; r: number; p: number },
): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    scrypt(
      passphrase,
      salt,
      KEY_LEN,
      { N: params.N, r: params.r, p: params.p, maxmem: 256 * 1024 * 1024 },
      (err, key) => {
        if (err) reject(err);
        else resolve(new Uint8Array(key.buffer, key.byteOffset, key.byteLength));
      },
    );
  });
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

function canonicalAad(ks: Pick<
  KeystoreFile,
  "version" | "address" | "kdf" | "kdfparams" | "cipher"
>): Uint8Array {
  const obj = {
    version: ks.version,
    address: ks.address.toLowerCase(),
    kdf: ks.kdf,
    kdfparams: {
      N: ks.kdfparams.N,
      r: ks.kdfparams.r,
      p: ks.kdfparams.p,
      saltHex: ks.kdfparams.saltHex.toLowerCase(),
    },
    cipher: ks.cipher,
  };
  return new TextEncoder().encode(JSON.stringify(obj));
}

export async function encryptKeystore(
  privateKey: Hex,
  passphrase: string,
): Promise<KeystoreFile> {
  if (!isHex(privateKey) || privateKey.length !== 66) {
    throw new CliError("INVALID_PRIVATE_KEY", "private key must be 0x + 64 hex chars");
  }
  const account = privateKeyToAccount(privateKey);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await scryptKey(passphrase, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });

  const header: Pick<
    KeystoreFile,
    "version" | "address" | "kdf" | "kdfparams" | "cipher"
  > = {
    version: VERSION,
    address: account.address,
    kdf: "scrypt",
    kdfparams: { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, saltHex: bytesToHex(salt) },
    cipher: "aes-256-gcm",
  };

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(canonicalAad(header));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(hexToBytes(privateKey))),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ...header,
    ivHex: bytesToHex(iv),
    ciphertextHex: bytesToHex(ciphertext),
    authTagHex: bytesToHex(authTag),
  };
}

export async function decryptKeystore(
  ks: KeystoreFile,
  passphrase: string,
): Promise<{ privateKey: Hex; account: PrivateKeyAccount }> {
  if (ks.version !== VERSION) {
    throw new CliError(
      "KEYSTORE_VERSION",
      `keystore version ${ks.version} is not supported (expected ${VERSION}). Re-create with 'truthmarket wallet init --force'.`,
    );
  }
  if (ks.kdf !== "scrypt") {
    throw new CliError("KEYSTORE_KDF", `unsupported kdf ${ks.kdf}`);
  }
  if (ks.cipher !== "aes-256-gcm") {
    throw new CliError("KEYSTORE_CIPHER", `unsupported cipher ${ks.cipher}`);
  }
  const salt = hexToBytes(ks.kdfparams.saltHex);
  const iv = hexToBytes(ks.ivHex);
  const ct = hexToBytes(ks.ciphertextHex);
  const tag = hexToBytes(ks.authTagHex);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct);
  combined.set(tag, ct.length);

  const key = await scryptKey(passphrase, salt, ks.kdfparams);
  let plain: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(canonicalAad(ks));
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(combined.slice(0, ct.length)), decipher.final()]);
  } catch {
    throw new CliError(
      "KEYSTORE_BAD_PASSPHRASE",
      "keystore decryption failed (wrong passphrase, or the file header was tampered with)",
    );
  }
  const privateKey = bytesToHex(plain) as Hex;
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== ks.address.toLowerCase()) {
    throw new CliError(
      "KEYSTORE_ADDRESS_MISMATCH",
      `decrypted key produces ${account.address}, keystore says ${ks.address}`,
    );
  }
  return { privateKey, account };
}

export async function readKeystoreFile(p: string): Promise<KeystoreFile | null> {
  try {
    await stat(p);
  } catch {
    return null;
  }
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw) as KeystoreFile;
}

export async function writeKeystoreFile(
  p: string,
  ks: KeystoreFile,
): Promise<void> {
  await mkdir(path.dirname(p), { recursive: true });
  await atomicWriteFile(p, JSON.stringify(ks, null, 2) + "\n", 0o600);
}
