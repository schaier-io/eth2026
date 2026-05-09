import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  type Hex,
  bytesToHex,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { commitVoteCore } from "../src/commands/vote-core.js";
import type { ResolvedConfig } from "../src/config.js";
import { DEFAULT_POLICY, type Policy } from "../src/policy/policy.js";
import { listVaultEntries, loadVaultEntry } from "../src/vault/vault.js";

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const STAKE_TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const TX_HASH =
  "0xc0ffee0000000000000000000000000000000000000000000000000000000000" as const;

const ACCOUNT = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

function tempCfg(): ResolvedConfig {
  const home = mkdtempSync(path.join(tmpdir(), "tm-cli-votecore-"));
  return {
    contractAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    chain: foundry,
    chainKey: "foundry",
    rpcUrl: "http://127.0.0.1:8545",
    homeDir: home,
    keystorePath: path.join(home, "keystore.json"),
    vaultDir: path.join(home, "vault"),
    policyPath: path.join(home, "policy.json"),
  };
}

interface ReadOverrides {
  allowance?: bigint;
  commitHash?: Hex; // existing commit hash; defaults to zero (no commit)
  ipfsHash?: Hex;
}

function makePublicClient(overrides: ReadOverrides = {}) {
  return {
    readContract: vi.fn(async (args: { functionName: string; args?: unknown[] }) => {
      switch (args.functionName) {
        case "stakeToken":
          return STAKE_TOKEN;
        case "allowance":
          return overrides.allowance ?? (10n ** 30n); // huge by default
        case "commits":
          return [
            overrides.commitHash ?? ZERO_BYTES32,
            0n,
            0n,
            0,
            0,
            false,
            false,
            false,
          ];
        case "ipfsHash":
          return overrides.ipfsHash ?? "0x";
        default:
          throw new Error(`unmocked readContract: ${args.functionName}`);
      }
    }),
    simulateContract: vi.fn(async (args: unknown) => ({ request: args })),
    waitForTransactionReceipt: vi.fn(async () => ({ blockNumber: 42n })),
  } as never;
}

function makeWalletClient(account = ACCOUNT) {
  return {
    account,
    writeContract: vi.fn(async () => TX_HASH),
  } as never;
}

function policy(overrides: Partial<Policy> = {}): Policy {
  return { ...DEFAULT_POLICY, ...overrides };
}

describe("commitVoteCore", () => {
  it("rejects stake <= 0 with INVALID_STAKE", async () => {
    try {
      await commitVoteCore({
        cfg: tempCfg(),
        publicClient: makePublicClient(),
        walletClient: makeWalletClient(),
        account: ACCOUNT,
        policy: policy({ maxStake: "1000" }),
        vote: 1,
        stake: 0n,
        vaultPassphrase: "p",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("INVALID_STAKE");
    }
  });

  it("blocks when policy.maxStake is 0", async () => {
    try {
      await commitVoteCore({
        cfg: tempCfg(),
        publicClient: makePublicClient(),
        walletClient: makeWalletClient(),
        account: ACCOUNT,
        policy: policy(), // default maxStake "0"
        vote: 1,
        stake: 100n,
        vaultPassphrase: "p",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("POLICY_MAX_STAKE_ZERO");
    }
  });

  it("blocks when stake exceeds policy.maxStake", async () => {
    try {
      await commitVoteCore({
        cfg: tempCfg(),
        publicClient: makePublicClient(),
        walletClient: makeWalletClient(),
        account: ACCOUNT,
        policy: policy({ maxStake: "100" }),
        vote: 1,
        stake: 101n,
        vaultPassphrase: "p",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("POLICY_MAX_STAKE_EXCEEDED");
    }
  });

  it("requires --document when policy.requireSwarmVerification is true", async () => {
    try {
      await commitVoteCore({
        cfg: tempCfg(),
        publicClient: makePublicClient(),
        walletClient: makeWalletClient(),
        account: ACCOUNT,
        policy: policy({ maxStake: "1000", requireSwarmVerification: true }),
        vote: 1,
        stake: 100n,
        vaultPassphrase: "p",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("POLICY_SWARM_VERIFICATION_REQUIRED");
    }
  });

  it("rejects mismatched document with SWARM_HASH_MISMATCH", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tm-cli-doc-"));
    const docPath = path.join(dir, "doc");
    writeFileSync(docPath, "wrong content");
    try {
      await commitVoteCore({
        cfg: tempCfg(),
        publicClient: makePublicClient({
          ipfsHash: keccak256(bytesToHex(new TextEncoder().encode("right content"))),
        }),
        walletClient: makeWalletClient(),
        account: ACCOUNT,
        policy: policy({ maxStake: "1000", requireSwarmVerification: true }),
        vote: 1,
        stake: 100n,
        vaultPassphrase: "p",
        documentPath: docPath,
      });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("SWARM_HASH_MISMATCH");
    }
  });

  it("rejects when allowance is below stake", async () => {
    try {
      await commitVoteCore({
        cfg: tempCfg(),
        publicClient: makePublicClient({ allowance: 5n }),
        walletClient: makeWalletClient(),
        account: ACCOUNT,
        policy: policy({ maxStake: "1000" }),
        vote: 1,
        stake: 10n,
        vaultPassphrase: "p",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("INSUFFICIENT_ALLOWANCE");
    }
  });

  it("rejects when wallet has already committed", async () => {
    try {
      await commitVoteCore({
        cfg: tempCfg(),
        publicClient: makePublicClient({
          commitHash: ("0x" + "ab".repeat(32)) as Hex,
        }),
        walletClient: makeWalletClient(),
        account: ACCOUNT,
        policy: policy({ maxStake: "1000" }),
        vote: 1,
        stake: 100n,
        vaultPassphrase: "p",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code: string }).code).toBe("ALREADY_COMMITTED");
    }
  });

  it("happy path: returns tx info, writes vault, calls writeContract once", async () => {
    const cfg = tempCfg();
    const pub = makePublicClient();
    const wal = makeWalletClient();

    const r = await commitVoteCore({
      cfg,
      publicClient: pub,
      walletClient: wal,
      account: ACCOUNT,
      policy: policy({ maxStake: "1000" }),
      vote: 2,
      stake: 100n,
      vaultPassphrase: "p",
    });

    expect(r.txHash).toBe(TX_HASH);
    expect(r.blockNumber).toBe(42n);
    expect(r.voter).toBe(ACCOUNT.address);
    expect(r.vote).toBe(2);
    expect(r.stake).toBe(100n);
    expect(r.commitHash).toMatch(/^0x[0-9a-f]{64}$/i);

    expect(wal.writeContract).toHaveBeenCalledOnce();
    expect(pub.simulateContract).toHaveBeenCalledOnce();
    expect(pub.waitForTransactionReceipt).toHaveBeenCalledOnce();

    // Vault entry exists and contains the broadcast tx hash (second save).
    const entry = await loadVaultEntry(cfg, ACCOUNT.address, "p");
    expect(entry).not.toBeNull();
    expect(entry!.vote).toBe(2);
    expect(entry!.stake).toBe("100");
    expect(entry!.commitTxHash).toBe(TX_HASH);
    expect(entry!.market).toBe(cfg.contractAddress);
    expect(entry!.chainId).toBe(cfg.chain.id);

    const list = await listVaultEntries(cfg);
    expect(list).toHaveLength(1);
  });

  it("happy path with swarm verification (matching document)", async () => {
    const cfg = tempCfg();
    const docContent = "the canonical rules document";
    const expected = keccak256(bytesToHex(new TextEncoder().encode(docContent)));
    const dir = mkdtempSync(path.join(tmpdir(), "tm-cli-doc-"));
    const docPath = path.join(dir, "doc");
    writeFileSync(docPath, docContent);

    const r = await commitVoteCore({
      cfg,
      publicClient: makePublicClient({ ipfsHash: expected }),
      walletClient: makeWalletClient(),
      account: ACCOUNT,
      policy: policy({ maxStake: "1000", requireSwarmVerification: true }),
      vote: 1,
      stake: 50n,
      vaultPassphrase: "p",
      documentPath: docPath,
    });
    expect(r.txHash).toBe(TX_HASH);
  });

  it("--ignore-policy bypasses every gate (maxStake=0 AND requireSwarmVerification with no document)", async () => {
    const cfg = tempCfg();
    const r = await commitVoteCore({
      cfg,
      publicClient: makePublicClient(),
      walletClient: makeWalletClient(),
      account: ACCOUNT,
      policy: policy({
        maxStake: "0",
        requireSwarmVerification: true,
      }),
      ignorePolicy: true,
      vote: 1,
      stake: 100n,
      vaultPassphrase: "p",
    });
    expect(r.txHash).toBe(TX_HASH);
  });

  it("vault is saved BEFORE broadcast (placeholder hash exists if broadcast throws)", async () => {
    const cfg = tempCfg();
    const wal = {
      account: ACCOUNT,
      writeContract: vi.fn(async () => {
        throw new Error("simulated revert");
      }),
    } as never;

    try {
      await commitVoteCore({
        cfg,
        publicClient: makePublicClient(),
        walletClient: wal,
        account: ACCOUNT,
        policy: policy({ maxStake: "1000" }),
        vote: 1,
        stake: 100n,
        vaultPassphrase: "p",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toMatch(/simulated revert/);
    }

    const entry = await loadVaultEntry(cfg, ACCOUNT.address, "p");
    expect(entry).not.toBeNull();
    // Placeholder commit tx hash means we tried to commit but did not
    // broadcast successfully — recovery path documented in README.
    expect(entry!.commitTxHash).toBe("0x" + "00".repeat(32));
  });
});
