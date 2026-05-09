import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bytesToHex, keccak256, stringToHex } from "viem";
import { makeContentAddressedChunk } from "@truth-market/swarm-verified-fetch";
import { foundry } from "viem/chains";
import {
  swarmReferenceFromIpfsHash,
  verifyLocalDocument,
  verifyOnchainClaimRulesDocument,
} from "../src/swarm/verify.js";
import type { ResolvedConfig } from "../src/config.js";

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

describe("verifyOnchainClaimRulesDocument", () => {
  it("verifies the local document against the on-chain Swarm reference and claimRulesHash", async () => {
    const doc = new TextEncoder().encode("hello verified swarm");
    const chunk = makeContentAddressedChunk(doc);
    const expected = keccak256(bytesToHex(doc));
    const fp = tempFile(doc);
    const result = await verifyOnchainClaimRulesDocument(
      mockClient({
        ipfsHash: stringToHex(`bzz://${chunk.reference}`),
        claimRulesHash: expected,
      }),
      mockCfg(),
      fp,
      {
        gatewayUrl: "https://gateway.test",
        fetch: async () => ({
          ok: true,
          status: 200,
          statusText: "OK",
          async arrayBuffer() {
            return chunk.bytes.buffer.slice(
              chunk.bytes.byteOffset,
              chunk.bytes.byteOffset + chunk.bytes.byteLength,
            );
          },
          async text() {
            return "";
          },
        }),
      },
    );

    expect(result.match).toBe(true);
    expect(result.swarmReference).toBe(`bzz://${chunk.reference}`);
    expect(result.remoteContentHash).toBe(expected);
    expect(result.chunksVerified).toBe(1);
  });

  it("decodes raw, hex-text, bzz, and swarm references from on-chain bytes", () => {
    const ref = "a".repeat(64);
    expect(swarmReferenceFromIpfsHash(`0x${ref}`)).toBe(ref);
    expect(swarmReferenceFromIpfsHash(stringToHex(ref))).toBe(ref);
    expect(swarmReferenceFromIpfsHash(stringToHex(`bzz://${ref}`))).toBe(`bzz://${ref}`);
    expect(swarmReferenceFromIpfsHash(stringToHex(`swarm://${ref}`))).toBe(`bzz://${ref}`);
  });
});

function mockCfg(): ResolvedConfig {
  return {
    contractAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    chain: foundry,
    chainKey: "foundry",
    rpcUrl: "http://127.0.0.1:8545",
    homeDir: ".",
    keystorePath: "keystore.json",
    vaultDir: "vault",
    policyPath: "policy.json",
  };
}

function mockClient(values: { ipfsHash: `0x${string}`; claimRulesHash: `0x${string}` }) {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "ipfsHash") return values.ipfsHash;
      if (functionName === "claimRulesHash") return values.claimRulesHash;
      throw new Error(`unmocked readContract: ${functionName}`);
    },
  } as never;
}
