import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRUTHMARKET_ADDRESS, resolveConfig } from "../src/config.js";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("config resolution", () => {
  it("hardcoded address wins by default", () => {
    delete process.env.TM_CONTRACT_ADDRESS;
    const cfg = resolveConfig();
    expect(cfg.contractAddress).toBe(TRUTHMARKET_ADDRESS);
  });

  it("TM_CONTRACT_ADDRESS overrides hardcoded", () => {
    process.env.TM_CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const cfg = resolveConfig();
    expect(cfg.contractAddress.toLowerCase()).toBe(
      "0x5fbdb2315678afecb367f032d93f642f64180aa3",
    );
  });

  it("--address flag overrides env", () => {
    process.env.TM_CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const cfg = resolveConfig({
      address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    });
    expect(cfg.contractAddress.toLowerCase()).toBe(
      "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
    );
  });

  it("rejects invalid chain", () => {
    try {
      resolveConfig({ chain: "mainnet" });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("INVALID_CHAIN");
    }
  });

  it("rejects invalid address", () => {
    try {
      resolveConfig({ address: "not-an-address" });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("INVALID_ADDRESS");
    }
  });
});
