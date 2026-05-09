import { readFile } from "node:fs/promises";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type OutputContext, emitResult } from "../io.js";
import { PolicySchema, loadPolicy, savePolicy } from "../policy/policy.js";

export async function cmdPolicyShow(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const policy = await loadPolicy(cfg);
  emitResult(ctx, { path: cfg.policyPath, policy }, () => {
    process.stdout.write(`policy: ${cfg.policyPath}\n` + JSON.stringify(policy, null, 2) + "\n");
  });
}

export interface PolicySetOpts extends ConfigOverrides {
  file: string;
}

export async function cmdPolicySet(
  ctx: OutputContext,
  opts: PolicySetOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const raw = await readFile(opts.file, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new CliError(
      "POLICY_PARSE",
      `${opts.file} is not valid JSON: ${(e as Error).message}`,
    );
  }
  const result = PolicySchema.safeParse(parsed);
  if (!result.success) {
    throw new CliError(
      "POLICY_INVALID",
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  const written = await savePolicy(cfg, result.data);
  emitResult(ctx, { path: written, policy: result.data }, () => {
    process.stdout.write(`policy written: ${written}\n`);
  });
}
