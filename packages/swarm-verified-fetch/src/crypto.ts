import { keccak_256 } from "@noble/hashes/sha3.js";

export type Keccak256Hasher = ReturnType<typeof keccak_256.create>;

export function keccak256(input: Uint8Array): Uint8Array {
  return keccak_256(input);
}

export function createKeccak256(): Keccak256Hasher {
  return keccak_256.create();
}
