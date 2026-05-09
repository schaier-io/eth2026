import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { foundry } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { ResolvedConfig } from "../src/config.js";
import { encryptKeystore, writeKeystoreFile } from "../src/wallet/keystore.js";
import { loadWallet } from "../src/wallet/loader.js";

function tempCfg(): ResolvedConfig {
  const home = mkdtempSync(path.join(tmpdir(), "tm-cli-walletload-"));
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

const env = { ...process.env };

describe("loadWallet", () => {
  beforeEach(() => {
    delete process.env.PRIVATE_KEY;
    delete process.env.TM_KEYSTORE_PASSPHRASE;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("PRIVATE_KEY env wins over keystore", async () => {
    const cfg = tempCfg();
    // Plant a keystore that would unlock with a different address.
    const ksPk = generatePrivateKey();
    const ks = await encryptKeystore(ksPk, "stored-passphrase");
    await writeKeystoreFile(cfg.keystorePath, ks);

    const envPk = generatePrivateKey();
    process.env.PRIVATE_KEY = envPk;

    const loaded = await loadWallet(cfg);
    expect(loaded.source).toBe("env");
    expect(loaded.account.address).toBe(privateKeyToAccount(envPk).address);
  }, 30000);

  it("env PRIVATE_KEY without 0x prefix is accepted", async () => {
    const cfg = tempCfg();
    const pk = generatePrivateKey();
    process.env.PRIVATE_KEY = pk.slice(2); // strip 0x

    const loaded = await loadWallet(cfg);
    expect(loaded.source).toBe("env");
    expect(loaded.account.address).toBe(privateKeyToAccount(pk).address);
  });

  it("malformed PRIVATE_KEY fails fast with INVALID_PRIVATE_KEY", async () => {
    const cfg = tempCfg();
    process.env.PRIVATE_KEY = "0xnot-a-real-key";
    try {
      await loadWallet(cfg);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("INVALID_PRIVATE_KEY");
    }
  });

  it("no env, no keystore => WALLET_NOT_CONFIGURED", async () => {
    const cfg = tempCfg();
    try {
      await loadWallet(cfg);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("WALLET_NOT_CONFIGURED");
    }
  });

  it("falls back to keystore + TM_KEYSTORE_PASSPHRASE env", async () => {
    const cfg = tempCfg();
    const pk = generatePrivateKey();
    const ks = await encryptKeystore(pk, "ks-pass");
    await writeKeystoreFile(cfg.keystorePath, ks);

    process.env.TM_KEYSTORE_PASSPHRASE = "ks-pass";
    const loaded = await loadWallet(cfg);
    expect(loaded.source).toBe("keystore");
    expect(loaded.account.address).toBe(privateKeyToAccount(pk).address);
  }, 30000);

  it("falls back to keystore + interactive prompt callback", async () => {
    const cfg = tempCfg();
    const pk = generatePrivateKey();
    const ks = await encryptKeystore(pk, "ks-pass-2");
    await writeKeystoreFile(cfg.keystorePath, ks);

    const loaded = await loadWallet(cfg, async () => "ks-pass-2");
    expect(loaded.source).toBe("keystore");
    expect(loaded.account.address).toBe(privateKeyToAccount(pk).address);
  }, 30000);

  it("keystore with no env passphrase and no callback => INTERACTIVE_PROMPT_REQUIRED", async () => {
    const cfg = tempCfg();
    const pk = generatePrivateKey();
    const ks = await encryptKeystore(pk, "ks-pass-3");
    await writeKeystoreFile(cfg.keystorePath, ks);

    try {
      await loadWallet(cfg);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("INTERACTIVE_PROMPT_REQUIRED");
    }
  }, 30000);

  it("wrong keystore passphrase surfaces KEYSTORE_BAD_PASSPHRASE", async () => {
    const cfg = tempCfg();
    const pk = generatePrivateKey();
    const ks = await encryptKeystore(pk, "right-pass");
    await writeKeystoreFile(cfg.keystorePath, ks);

    process.env.TM_KEYSTORE_PASSPHRASE = "wrong-pass";
    try {
      await loadWallet(cfg);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("KEYSTORE_BAD_PASSPHRASE");
    }
  }, 30000);
});
