import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { foundry } from "viem/chains";
import {
  DEFAULT_POLICY,
  assertCommitAllowed,
  assertJuryCommitAllowed,
  loadPolicy,
  savePolicy,
} from "../src/policy/policy.js";
import type { ResolvedConfig } from "../src/config.js";

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

describe("policy", () => {
  it("returns defaults when file is absent", async () => {
    const cfg = tempCfg();
    const p = await loadPolicy(cfg);
    expect(p).toEqual(DEFAULT_POLICY);
  });

  it("round-trips through save+load", async () => {
    const cfg = tempCfg();
    const policy = {
      ...DEFAULT_POLICY,
      autoReveal: false,
      maxStake: "9999999",
      revealBufferMinutes: 10,
    };
    await savePolicy(cfg, policy);
    const loaded = await loadPolicy(cfg);
    expect(loaded).toEqual(policy);
  });

  it("rejects bad maxStake", async () => {
    const cfg = tempCfg();
    writeFileSync(cfg.policyPath, JSON.stringify({ ...DEFAULT_POLICY, maxStake: "abc" }));
    await expect(loadPolicy(cfg)).rejects.toThrow(/POLICY_INVALID|maxStake/);
  });
});

describe("policy enforcement", () => {
  it("blocks commit when maxStake is 0", () => {
    try {
      assertCommitAllowed(DEFAULT_POLICY, 1n);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("POLICY_MAX_STAKE_ZERO");
    }
  });

  it("blocks commit when stake exceeds maxStake", () => {
    const policy = { ...DEFAULT_POLICY, maxStake: "100" };
    try {
      assertCommitAllowed(policy, 101n);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("POLICY_MAX_STAKE_EXCEEDED");
    }
  });

  it("permits commit at exactly maxStake", () => {
    const policy = { ...DEFAULT_POLICY, maxStake: "100" };
    expect(() => assertCommitAllowed(policy, 100n)).not.toThrow();
  });

  it("--ignore-policy bypasses maxStake gate", () => {
    expect(() =>
      assertCommitAllowed(DEFAULT_POLICY, 999n, { ignorePolicy: true }),
    ).not.toThrow();
  });

  it("blocks jury commit when allowJuryCommit is false", () => {
    try {
      assertJuryCommitAllowed(DEFAULT_POLICY);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("POLICY_JURY_COMMIT_DISABLED");
    }
  });

  it("permits jury commit when allowJuryCommit is true", () => {
    expect(() =>
      assertJuryCommitAllowed({ ...DEFAULT_POLICY, allowJuryCommit: true }),
    ).not.toThrow();
  });
});
