import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ResolvedConfig } from "../src/config.js";
import { foundry } from "viem/chains";
import {
  exportVaultBlob,
  generateNonce,
  importVaultBlob,
  listVaultEntries,
  loadVaultEntry,
  saveVaultEntry,
  vaultFilePath,
} from "../src/vault/vault.js";

function tempCfg(): ResolvedConfig {
  const home = mkdtempSync(path.join(tmpdir(), "tm-cli-test-"));
  return {
    contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    chain: foundry,
    chainKey: "foundry",
    rpcUrl: "http://127.0.0.1:8545",
    homeDir: home,
    keystorePath: path.join(home, "keystore.json"),
    vaultDir: path.join(home, "vault"),
    policyPath: path.join(home, "policy.json"),
  };
}

describe("vault", () => {
  it("round-trips an entry through save+load", async () => {
    const cfg = tempCfg();
    const voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    const entry = {
      market: cfg.contractAddress,
      chainId: cfg.chain.id,
      voter,
      vote: 1 as const,
      nonce: generateNonce(),
      stake: "1000000000000000000",
      commitTxHash: ("0x" + "00".repeat(32)) as `0x${string}`,
      createdAt: new Date("2026-05-09T00:00:00Z").toISOString(),
    };
    await saveVaultEntry(cfg, "correct-horse", entry);
    const loaded = await loadVaultEntry(cfg, voter, "correct-horse");
    expect(loaded).toEqual(entry);
  });

  it("rejects wrong passphrase", async () => {
    const cfg = tempCfg();
    const voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    await saveVaultEntry(cfg, "right", {
      market: cfg.contractAddress,
      chainId: cfg.chain.id,
      voter,
      vote: 2,
      nonce: generateNonce(),
      stake: "1",
      commitTxHash: ("0x" + "00".repeat(32)) as `0x${string}`,
      createdAt: new Date().toISOString(),
    });
    await expect(loadVaultEntry(cfg, voter, "wrong")).rejects.toThrow(
      /VAULT_BAD_PASSPHRASE|decryption/i,
    );
  });

  it("listVaultEntries enumerates files", async () => {
    const cfg = tempCfg();
    const voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    await saveVaultEntry(cfg, "p", {
      market: cfg.contractAddress,
      chainId: cfg.chain.id,
      voter,
      vote: 1,
      nonce: generateNonce(),
      stake: "1",
      commitTxHash: ("0x" + "00".repeat(32)) as `0x${string}`,
      createdAt: new Date().toISOString(),
    });
    const list = await listVaultEntries(cfg);
    expect(list.length).toBe(1);
    expect(list[0]?.voter.toLowerCase()).toBe(voter.toLowerCase());
  });

  // Verify every public header field is bound into the AAD. For each field,
  // mutate the file and assert decrypt fails. If a future refactor drops a
  // field from canonicalAad, this loop catches it.
  it.each([
    ["version", (f: any) => (f.version = 99)],
    ["market", (f: any) => (f.market = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")],
    ["chainId", (f: any) => (f.chainId = 9_999)],
    ["voter", (f: any) => (f.voter = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")],
    ["kdf", (f: any) => (f.kdf = "scrypt")],
    ["cipher", (f: any) => (f.cipher = "chacha20-poly1305")],
    ["kdfparams.iterations", (f: any) => (f.kdfparams.iterations = 1)],
    ["kdfparams.saltHex", (f: any) => (f.kdfparams.saltHex = "0x" + "11".repeat(16))],
  ])("rejects tampered header field: %s", async (_name, mutate) => {
    const cfg = tempCfg();
    const voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    await saveVaultEntry(cfg, "real-passphrase", {
      market: cfg.contractAddress,
      chainId: cfg.chain.id,
      voter,
      vote: 1,
      nonce: generateNonce(),
      stake: "1",
      commitTxHash: ("0x" + "00".repeat(32)) as `0x${string}`,
      createdAt: new Date().toISOString(),
    });
    const fp = vaultFilePath(cfg, voter);
    const { readFileSync, writeFileSync } = await import("node:fs");
    const file = JSON.parse(readFileSync(fp, "utf8"));
    mutate(file);
    writeFileSync(fp, JSON.stringify(file));

    try {
      await loadVaultEntry(cfg, voter, "real-passphrase");
      throw new Error("expected throw");
    } catch (e) {
      const code = (e as { code: string }).code;
      // Most mutations fail authentication. version mismatch falls through
      // an early VAULT_VERSION check; that's also a deliberate refusal.
      expect([
        "VAULT_BAD_PASSPHRASE",
        "VAULT_VERSION",
        "VAULT_KDF",
        "VAULT_CIPHER",
      ]).toContain(code);
    }
  });

  it("rejects a tampered ciphertext (auth tag check, ciphertext-side)", async () => {
    const cfg = tempCfg();
    const voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    await saveVaultEntry(cfg, "p", {
      market: cfg.contractAddress,
      chainId: cfg.chain.id,
      voter,
      vote: 1,
      nonce: generateNonce(),
      stake: "1",
      commitTxHash: ("0x" + "00".repeat(32)) as `0x${string}`,
      createdAt: new Date().toISOString(),
    });
    const fp = vaultFilePath(cfg, voter);
    const { readFileSync, writeFileSync } = await import("node:fs");
    const file = JSON.parse(readFileSync(fp, "utf8"));
    // flip a single byte in the ciphertext
    const ct = file.ciphertextHex as string;
    const flipped =
      ct.slice(0, 4) +
      (ct[4] === "0" ? "f" : "0") +
      ct.slice(5);
    file.ciphertextHex = flipped;
    writeFileSync(fp, JSON.stringify(file));
    try {
      await loadVaultEntry(cfg, voter, "p");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("VAULT_BAD_PASSPHRASE");
    }
  });

  it("rejects a tampered KDF iterations field (AAD binding)", async () => {
    const cfg = tempCfg();
    const voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    await saveVaultEntry(cfg, "real-passphrase", {
      market: cfg.contractAddress,
      chainId: cfg.chain.id,
      voter,
      vote: 1,
      nonce: generateNonce(),
      stake: "1",
      commitTxHash: ("0x" + "00".repeat(32)) as `0x${string}`,
      createdAt: new Date().toISOString(),
    });
    const fp = vaultFilePath(cfg, voter);
    const { readFileSync, writeFileSync } = await import("node:fs");
    const file = JSON.parse(readFileSync(fp, "utf8"));
    file.kdfparams.iterations = 1; // attacker tries to weaken KDF
    writeFileSync(fp, JSON.stringify(file));

    try {
      await loadVaultEntry(cfg, voter, "real-passphrase");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("VAULT_BAD_PASSPHRASE");
    }
  });

  it("import preserves the source chainId across chains", async () => {
    const sourceCfg = tempCfg();
    const voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    await saveVaultEntry(sourceCfg, "p", {
      market: sourceCfg.contractAddress,
      chainId: 84532, // base sepolia
      voter,
      vote: 1,
      nonce: generateNonce(),
      stake: "5",
      commitTxHash: ("0x" + "11".repeat(32)) as `0x${string}`,
      createdAt: new Date().toISOString(),
    });
    const blob = await exportVaultBlob(sourceCfg, voter);

    // Import on a different machine running foundry. Cross-chain import must
    // not coerce the file into the active chain's vault path.
    const targetCfg = tempCfg();
    const target = await importVaultBlob(targetCfg, blob);
    const expectedPath = vaultFilePath(targetCfg, voter, {
      chainId: 84532,
      contractAddress: sourceCfg.contractAddress,
    });
    expect(target).toBe(expectedPath);
    expect(target).toContain("84532-");
  });
});
