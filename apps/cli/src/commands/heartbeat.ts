import { makePublicClient, makeWalletClient } from "../chain/client.js";
import { assertConfiguredMarketIntegrity } from "../chain/market-integrity.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { startHeartbeat } from "../heartbeat/watcher.js";
import { type OutputContext, emitNdjson, emitResult, promptSecret } from "../io.js";
import { loadPolicy } from "../policy/policy.js";
import { loadWallet } from "../wallet/loader.js";

export async function cmdHeartbeatStart(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const policy = await loadPolicy(cfg);

  const vaultPassphrase =
    process.env.TM_VAULT_PASSPHRASE ??
    (ctx.json
      ? (() => {
          throw new CliError(
            "INTERACTIVE_PROMPT_REQUIRED",
            "TM_VAULT_PASSPHRASE must be set when running heartbeat with --json",
          );
        })()
      : await promptSecret("Vault passphrase: "));

  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);
  await assertConfiguredMarketIntegrity(publicClient, cfg);

  const ac = new AbortController();
  process.on("SIGINT", () => ac.abort());
  process.on("SIGTERM", () => ac.abort());

  const handle = startHeartbeat(
    publicClient,
    walletClient,
    cfg,
    wallet.account,
    { policy, vaultPassphrase, signal: ac.signal },
    (e) => {
      if (ctx.json) {
        emitNdjson(e);
      } else {
        process.stdout.write(`[${e.ts}] ${e.event} ${JSON.stringify(serialize(e))}\n`);
      }
    },
  );
  await handle.done;
}

function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

export async function cmdHeartbeatStatus(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  // For this iteration the heartbeat is foreground-only; status is the
  // truthy state of policy + vault config. Future iteration: write a
  // sidecar status file from the running watcher.
  const cfg = resolveConfig(opts);
  const policy = await loadPolicy(cfg);
  emitResult(
    ctx,
    {
      running: false,
      reason: "heartbeat is foreground-only in this iteration; run 'truthmarket heartbeat start' under tmux/systemd",
      policy,
      contract: cfg.contractAddress,
      chain: cfg.chainKey,
    },
    () => {
      process.stdout.write(
        "heartbeat is foreground-only; run 'truthmarket heartbeat start' under tmux/systemd.\n" +
          `policy: ${cfg.policyPath}\n` +
          JSON.stringify(policy, null, 2) +
          "\n",
      );
    },
  );
}
