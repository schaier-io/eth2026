import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bytesToHex, keccak256 } from "viem";
import { verifyLocalDocument } from "../src/swarm/verify.js";

function tempFile(content: Uint8Array | string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "tm-cli-swarm-"));
  const fp = path.join(dir, "doc");
  writeFileSync(fp, content);
  return fp;
}

describe("verifyLocalDocument", () => {
  it("matches when keccak256(document) equals expected", async () => {
    const doc = new TextEncoder().encode("hello swarm");
    const expected = keccak256(bytesToHex(doc));
    const fp = tempFile(doc);
    const r = await verifyLocalDocument(expected, fp);
    expect(r.match).toBe(true);
    expect(r.computed).toBe(expected);
    expect(r.expected).toBe(expected);
  });

  it("does not match when document differs", async () => {
    const expected = keccak256(bytesToHex(new TextEncoder().encode("a")));
    const fp = tempFile("b");
    const r = await verifyLocalDocument(expected, fp);
    expect(r.match).toBe(false);
    expect(r.computed).not.toBe(expected);
  });

  it("compares case-insensitively", async () => {
    const doc = new TextEncoder().encode("upper-case-test");
    const expected = keccak256(bytesToHex(doc));
    const fp = tempFile(doc);
    const r = await verifyLocalDocument(
      expected.toUpperCase() as `0x${string}`,
      fp,
    );
    expect(r.match).toBe(true);
  });
});
