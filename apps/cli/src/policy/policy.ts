import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ResolvedConfig } from "../config.js";
import { CliError } from "../errors.js";

/**
 * Agent policy schema (per docs/adr/0010-agent-policy-heartbeat-and-auto-reveal.md).
 *
 * Loaded by the heartbeat watcher and the commit/reveal commands. maxStake is
 * a stringified bigint of token base units; the special value "0" means
 * "policy not configured — refuse to commit". This is the safe default when
 * no policy file is present.
 */
export const PolicySchema = z.object({
  autoReveal: z.boolean().default(true),
  revealBufferMinutes: z.number().int().min(1).max(60 * 24).default(30),
  autoWithdraw: z.boolean().default(true),
  maxStake: z
    .string()
    .regex(/^\d+$/, "maxStake must be a non-negative integer string"),
  // Default: false. The current verifier only matches keccak-stored
  // ipfsHash bytes; production deployments using CID/multihash will need
  // multihash decoding (not implemented). Flip this to true once the
  // verifier matches the deployment's reference format.
  requireSwarmVerification: z.boolean().default(false),
  allowCreateMarkets: z.boolean().default(false),
  allowJuryCommit: z.boolean().default(false),
  pollIntervalSeconds: z.number().int().min(5).max(3600).default(30),
});

export type Policy = z.infer<typeof PolicySchema>;

export const DEFAULT_POLICY: Policy = {
  autoReveal: true,
  revealBufferMinutes: 30,
  autoWithdraw: true,
  maxStake: "0",
  requireSwarmVerification: false,
  allowCreateMarkets: false,
  allowJuryCommit: false,
  pollIntervalSeconds: 30,
};

export interface PolicyOverrides {
  ignorePolicy?: boolean;
}

export function assertCommitAllowed(
  policy: Policy,
  stake: bigint,
  overrides: PolicyOverrides = {},
): void {
  if (overrides.ignorePolicy) return;
  const max = BigInt(policy.maxStake);
  if (max === 0n) {
    throw new CliError(
      "POLICY_MAX_STAKE_ZERO",
      "policy.maxStake is 0 (policy not configured); set it via 'truthmarket policy set --file <path>' or pass --ignore-policy",
    );
  }
  if (stake > max) {
    throw new CliError(
      "POLICY_MAX_STAKE_EXCEEDED",
      `stake ${stake} exceeds policy.maxStake ${max}`,
    );
  }
}

export function assertJuryCommitAllowed(
  policy: Policy,
  overrides: PolicyOverrides = {},
): void {
  if (overrides.ignorePolicy) return;
  if (!policy.allowJuryCommit) {
    throw new CliError(
      "POLICY_JURY_COMMIT_DISABLED",
      "policy.allowJuryCommit is false; flip it in your policy file or pass --ignore-policy",
    );
  }
}

export async function loadPolicy(cfg: ResolvedConfig): Promise<Policy> {
  try {
    await stat(cfg.policyPath);
  } catch {
    return { ...DEFAULT_POLICY };
  }
  const raw = await readFile(cfg.policyPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new CliError(
      "POLICY_PARSE",
      `policy file at ${cfg.policyPath} is not valid JSON: ${(e as Error).message}`,
    );
  }
  const result = PolicySchema.safeParse(parsed);
  if (!result.success) {
    throw new CliError(
      "POLICY_INVALID",
      `policy validation failed: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

export async function savePolicy(
  cfg: ResolvedConfig,
  policy: Policy,
): Promise<string> {
  await mkdir(path.dirname(cfg.policyPath), { recursive: true });
  await writeFile(
    cfg.policyPath,
    JSON.stringify(policy, null, 2) + "\n",
    { mode: 0o600 },
  );
  return cfg.policyPath;
}
