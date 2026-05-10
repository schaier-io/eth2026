import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  acceptsMarketIntegrity,
  cloneRuntimeMatchesImplementation,
  expectedMinimalCloneRuntime,
  normalizeSourcifyMatch,
  type MarketIntegrity,
} from "../src/chain/market-integrity.js";

const IMPLEMENTATION = "0x8179d3B84abCa79bA6eDe48493C7816dEd9A8a7F" as Address;
const MARKET = "0x923b61700F331687e4621C2f0B1C7060B06D62e3" as Address;

describe("market integrity helpers", () => {
  it("builds and verifies an EIP-1167 runtime for the implementation", () => {
    const runtime = expectedMinimalCloneRuntime(IMPLEMENTATION);

    expect(runtime).toBe(
      "0x363d3d373d3d3d363d738179d3b84abca79ba6ede48493c7816ded9a8a7f5af43d82803e903d91602b57fd5bf3",
    );
    expect(cloneRuntimeMatchesImplementation(runtime, IMPLEMENTATION)).toBe(true);
    expect(cloneRuntimeMatchesImplementation("0x1234", IMPLEMENTATION)).toBe(false);
  });

  it("accepts both Sourcify exact_match and match as source matches", () => {
    expect(normalizeSourcifyMatch("exact_match")).toBe("exact_match");
    expect(normalizeSourcifyMatch("match")).toBe("match");
    expect(normalizeSourcifyMatch(null)).toBeUndefined();
  });

  it("rejects registry entries whose clone bytecode does not match", () => {
    const verification: MarketIntegrity = {
      status: "mismatch",
      label: "Clone mismatch",
      title: "bad",
      cloneMatches: false,
      chainId: 11155111,
      market: MARKET,
      implementation: IMPLEMENTATION,
    };

    expect(acceptsMarketIntegrity(verification)).toBe(false);
  });
});
