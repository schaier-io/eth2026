import { describe, expect, it } from "vitest";
import { parseMarketSpec } from "../src/commands/registry.js";

const BASE_SPEC = {
  votingPeriod: 1200,
  adminTimeout: 300,
  revealPeriod: 1200,
  minStake: "1000000000000000000",
  jurySize: 1,
  minCommits: 1,
  minRevealedJurors: 1,
};

describe("parseMarketSpec", () => {
  it("accepts a claimDocument and defers swarmReference until publish", () => {
    const parsed = parseMarketSpec({
      ...BASE_SPEC,
      claimDocument: {
        title: "Was this the best ETHPrague so far?",
        context: "YES means selected jurors believe it was the best ETHPrague so far; NO otherwise.",
        tags: ["ethprague"],
      },
    });

    expect(parsed.spec.swarmReference).toBeUndefined();
    expect(parsed.claimDocument).toEqual({
      title: "Was this the best ETHPrague so far?",
      context: "YES means selected jurors believe it was the best ETHPrague so far; NO otherwise.",
      tags: ["ethprague"],
    });
    expect(parsed.spec.minStake).toBe(1000000000000000000n);
  });

  it("accepts an already-published swarmReference", () => {
    const ref = `0x${"ab".repeat(32)}` as const;
    const parsed = parseMarketSpec({
      ...BASE_SPEC,
      swarmReference: ref,
    });

    expect(parsed.spec.swarmReference).toBe(ref);
    expect(parsed.claimDocument).toBeUndefined();
  });

  it("requires either claimDocument or swarmReference", () => {
    expect(() => parseMarketSpec(BASE_SPEC)).toThrow(/provide either swarmReference or claimDocument/);
  });

  it("rejects specs the contract initializer would reject", () => {
    const ref = `0x${"ab".repeat(32)}` as const;
    const invalidSpecs = [
      [{ jurySize: 2 }, /jurySize must be odd/],
      [{ jurySize: 101 }, /jurySize must be <= 100/],
      [{ minRevealedJurors: 2 }, /minRevealedJurors must be odd/],
      [{ jurySize: 3, minRevealedJurors: 5 }, /minRevealedJurors must be <= jurySize/],
      [{ minCommits: 1, minRevealedJurors: 3, jurySize: 3 }, /minCommits must be at least minRevealedJurors/],
      [{ minCommits: 3, maxCommits: 2, minRevealedJurors: 3, jurySize: 3 }, /maxCommits must be 0 or at least minCommits/],
      [{ minStake: "0" }, /minStake must be greater than 0/],
    ] as const;

    for (const [patch, error] of invalidSpecs) {
      expect(() => parseMarketSpec({ ...BASE_SPEC, swarmReference: ref, ...patch })).toThrow(error);
    }
  });
});
