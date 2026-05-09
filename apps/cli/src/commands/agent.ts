import {
  type ApifyAgentDeps,
  type ApifyAgentOptions,
} from "../../../../agents/apify/dist/index.js";
import { makePublicClient, makeWalletClient } from "../chain/client.js";
import { writeCreateMarket } from "../chain/registry.js";
import { type ConfigOverrides, type ResolvedConfig, resolveConfig } from "../config.js";
import { type OutputContext, emitNdjson, emitResult, promptSecret } from "../io.js";
import {
  type PolicyOverrides,
  assertCreateMarketAllowed,
  loadPolicy,
} from "../policy/policy.js";
import { loadWallet } from "../wallet/loader.js";

export interface AgentRunOpts
  extends ConfigOverrides,
    PolicyOverrides,
    ApifyAgentOptions {}

export async function cmdAgentTick(
  ctx: OutputContext,
  opts: AgentRunOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const { runApifyAgentTick } = await loadApifyAgent();
  const result = await runApifyAgentTick(
    { agentStatePath: cfg.agentStatePath },
    opts,
    createAgentDeps(cfg, opts),
    () => {
      /* discard tick events for one-shot */
    },
  );
  emitResult(ctx, result, () => {
    if (result.status === "created") {
      process.stdout.write(
        `created market #${result.marketId}\n` +
          `  address:   ${result.marketAddress}\n` +
          `  candidate: ${result.candidateId} (${result.permalink})\n` +
          `  tx:        ${result.txHash}\n` +
          `  name:      ${result.name}\n`,
      );
    } else {
      process.stdout.write(`skipped: ${result.status} (${result.reason ?? "no reason"})\n`);
    }
  });
}

export async function cmdAgentRun(
  ctx: OutputContext,
  opts: AgentRunOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const { runApifyAgentLoop } = await loadApifyAgent();

  let stopped = false;
  const onSig = () => {
    stopped = true;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  const emit = (e: Record<string, unknown>) => {
    if (ctx.json) emitNdjson(e);
    else process.stdout.write(`[${e.ts}] ${e.event} ${JSON.stringify(redactNoise(e))}\n`);
  };

  await runApifyAgentLoop(
    { agentStatePath: cfg.agentStatePath },
    opts,
    createAgentDeps(cfg, opts),
    emit,
    () => stopped,
  );
}

type ApifyAgentModule = typeof import("../../../../agents/apify/dist/index.js");

async function loadApifyAgent(): Promise<ApifyAgentModule> {
  try {
    return await import("../../../../agents/apify/dist/index.js");
  } catch (e) {
    if (!isMissingApifyDist(e)) throw e;
    const sourceModule = "../../../../agents/apify/src/index.ts";
    return import(sourceModule) as Promise<ApifyAgentModule>;
  }
}

function isMissingApifyDist(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as { code?: string }).code;
  return code === "ERR_MODULE_NOT_FOUND" && e.message.includes("agents/apify/dist/index.js");
}

function createAgentDeps(cfg: ResolvedConfig, opts: AgentRunOpts): ApifyAgentDeps {
  return {
    authorizeCreateMarket: async () => {
      const policy = await loadPolicy(cfg);
      assertCreateMarketAllowed(policy, opts);
    },
    createMarket: async (spec) => {
      const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
      const publicClient = makePublicClient(cfg);
      const walletClient = makeWalletClient(cfg, wallet.account);
      return writeCreateMarket(walletClient, publicClient, cfg, spec);
    },
  };
}

function redactNoise(e: Record<string, unknown>): Record<string, unknown> {
  const { ts, event, ...rest } = e;
  void ts;
  void event;
  return rest;
}
