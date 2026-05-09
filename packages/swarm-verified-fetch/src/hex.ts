import { SwarmVerificationError } from "./errors.js";

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = normalizeHex(hex);

  if (normalized.length % 2 !== 0) {
    throw new SwarmVerificationError("Hex strings must have an even number of characters.");
  }

  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    const value = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);

    if (Number.isNaN(value)) {
      throw new SwarmVerificationError("Invalid hex string.");
    }

    bytes[index] = value;
  }

  return bytes;
}

export function normalizeHex(hex: string): string {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;

  if (!/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new SwarmVerificationError("Invalid hex string.");
  }

  return normalized.toLowerCase();
}
