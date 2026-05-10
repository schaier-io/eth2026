import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bytesToHex, keccak256, stringToHex } from "viem";
import { makeContentAddressedChunk } from "@truth-market/swarm-verified-fetch";
import { foundry } from "viem/chains";
import {
  swarmReferenceFromBytes,
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
  it("verifies the local document against the on-chain Swarm reference", async () => {
    const doc = new TextEncoder().encode("hello verified swarm");
    const chunk = makeContentAddressedChunk(doc);
    const expected = keccak256(bytesToHex(doc));
    const fp = tempFile(doc);
    const result = await verifyOnchainClaimRulesDocument(
      mockClient({
        swarmReference: stringToHex(`bzz://${chunk.reference}`),
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

  it("verifies a local claim document against the on-chain Swarm KV index reference", async () => {
    const doc = {
      schema: "truthmarket.claim.v1",
      title: "Was this the best ETHPrague so far?",
      context: "YES if selected jurors believe it was the best ETHPrague so far; NO otherwise.",
      tags: ["ethprague"],
      createdAt: "2026-05-10T00:00:00.000Z",
    };
    const docBytes = new TextEncoder().encode(JSON.stringify(doc));
    const docChunk = makeContentAddressedChunk(docBytes);
    const index = {
      schema: "swarm-kv.index.v1",
      namespace: "truthmarket:claim:v1",
      revision: 1,
      updatedAt: "2026-05-10T00:00:00.000Z",
      entries: {
        claim: {
          key: "claim",
          reference: docChunk.reference,
          contentType: "application/json",
          kind: "json",
          encoding: "json",
          encrypted: false,
          size: docBytes.byteLength,
          updatedAt: "2026-05-10T00:00:00.000Z",
          topic: "00",
          version: 1,
        },
      },
      tombstones: {},
    };
    const indexBytes = new TextEncoder().encode(JSON.stringify(index));
    const indexChunk = makeContentAddressedChunk(indexBytes);
    const chunks = new Map([
      [docChunk.reference, docChunk.bytes],
      [indexChunk.reference, indexChunk.bytes],
    ]);
    const fp = tempFile(JSON.stringify(doc, null, 2));

    const result = await verifyOnchainClaimRulesDocument(
      mockClient({
        swarmReference: stringToHex(`bzz://${indexChunk.reference}`),
      }),
      mockCfg(),
      fp,
      {
        gatewayUrl: "https://gateway.test",
        fetch: async (input) => {
          const url = String(input);
          const found = [...chunks.entries()].find(([reference]) => url.includes(reference));
          if (!found) throw new Error(`unknown reference in ${url}`);
          const [, bytes] = found;
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            async arrayBuffer() {
              return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            },
            async text() {
              return "";
            },
          };
        },
      },
    );

    expect(result.match).toBe(true);
    expect(result.mode).toBe("swarm-kv");
    expect(result.document?.title).toBe(doc.title);
    expect(result.swarmReference).toBe(`bzz://${indexChunk.reference}`);
  });

  it("decodes raw, hex-text, bzz, and swarm references from on-chain bytes", () => {
    const ref = "a".repeat(64);
    expect(swarmReferenceFromBytes(`0x${ref}`)).toBe(ref);
    expect(swarmReferenceFromBytes(stringToHex(ref))).toBe(ref);
    expect(swarmReferenceFromBytes(stringToHex(`bzz://${ref}`))).toBe(`bzz://${ref}`);
    expect(swarmReferenceFromBytes(stringToHex(`swarm://${ref}`))).toBe(`bzz://${ref}`);
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
    agentStatePath: "agent-state.json",
    operational: {
      stakeToken: undefined,
      juryCommitter: undefined,
    },
  };
}

function mockClient(values: { swarmReference: `0x${string}` }) {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "swarmReference") return values.swarmReference;
      throw new Error(`unmocked readContract: ${functionName}`);
    },
  } as never;
}
