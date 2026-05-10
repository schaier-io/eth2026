import { describe, expect, it } from "vitest";
import { parseMarketSpec } from "../src/commands/registry.js";

const BASE_SPEC = {
  votingPeriod: 1200,
  adminTimeout: 300,
  revealPeriod: 1200,
  minStake: "1000000000000000000",
  jurySize: 1,
  minCommits: 7,
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
});
