import { describe, expect, it } from "vitest";

import {
  bytesToHex,
  hexToBytes,
  keccak256,
  makeContentAddressedChunk,
  spanBytesFromLength,
  verifyContentAddressedChunk
} from "../src/index.js";

describe("content addressed chunks", () => {
  it("uses a browser and Node compatible keccak256 primitive", () => {
    expect(bytesToHex(keccak256(new Uint8Array()))).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    );
  });

  it("encodes spans as 8-byte little endian values", () => {
    expect(bytesToHex(spanBytesFromLength(4096))).toBe("0010000000000000");
  });

  it("verifies a generated CAC reference", () => {
    const payload = new TextEncoder().encode("trust no gateway");
    const chunk = makeContentAddressedChunk(payload);
    const result = verifyContentAddressedChunk(chunk.reference, chunk.bytes);

    expect(result.verified).toBe(true);
    expect(result.computedReference).toBe(chunk.reference);
    expect(result.span).toBe(BigInt(payload.length));
    expect(result.payloadLength).toBe(payload.length);
  });

  it("rejects mutated chunk bytes", () => {
    const payload = new TextEncoder().encode("trust no gateway");
    const chunk = makeContentAddressedChunk(payload);
    const mutated = new Uint8Array(chunk.bytes);
    const lastIndex = mutated.length - 1;
    mutated[lastIndex] = (mutated[lastIndex] ?? 0) ^ 0xff;
    const result = verifyContentAddressedChunk(chunk.reference, mutated);

    expect(result.verified).toBe(false);
    expect(result.computedReference).not.toBe(chunk.reference);
  });

  it("normalizes expected references", () => {
    const payload = hexToBytes("010203");
    const chunk = makeContentAddressedChunk(payload);
    const result = verifyContentAddressedChunk(`0x${chunk.reference.toUpperCase()}`, chunk.bytes);

    expect(result.verified).toBe(true);
  });
});
