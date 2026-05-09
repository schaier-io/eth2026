import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256 } from "viem";
import { computeCommitHash } from "../src/chain/contract.js";

/**
 * Mirrors the contract's _commitHash:
 *   keccak256(abi.encode(uint8 vote, bytes32 nonce, address voter, uint256 chainid, address contract))
 *
 * No anvil dependency — encodes the same bytes the contract would and checks
 * computeCommitHash() agrees. If this ever diverges we ship a broken commit
 * (impossible to reveal), so the assertion is intentionally tight.
 */
describe("computeCommitHash", () => {
  it("matches abi.encode(uint8, bytes32, address, uint256, address) keccak256", () => {
    const vote = 1 as const;
    const nonce = ("0x" + "ab".repeat(32)) as `0x${string}`;
    const voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    const chainId = 31337;
    const contract = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

    const expected = keccak256(
      encodeAbiParameters(
        [
          { type: "uint8" },
          { type: "bytes32" },
          { type: "address" },
          { type: "uint256" },
          { type: "address" },
        ],
        [vote, nonce, voter, BigInt(chainId), contract],
      ),
    );

    const got = computeCommitHash({ vote, nonce, voter, chainId, contract });
    expect(got).toBe(expected);
  });

  it("differs across chain ids", () => {
    const args = {
      vote: 1 as const,
      nonce: ("0x" + "11".repeat(32)) as `0x${string}`,
      voter: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const,
      contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const,
    };
    const a = computeCommitHash({ ...args, chainId: 1 });
    const b = computeCommitHash({ ...args, chainId: 31337 });
    expect(a).not.toBe(b);
  });

  it("differs across contracts", () => {
    const args = {
      vote: 1 as const,
      nonce: ("0x" + "22".repeat(32)) as `0x${string}`,
      voter: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const,
      chainId: 31337,
    };
    const a = computeCommitHash({
      ...args,
      contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    });
    const b = computeCommitHash({
      ...args,
      contract: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    });
    expect(a).not.toBe(b);
  });
});
