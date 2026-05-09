import { readFile, writeFile } from "node:fs/promises";
import { type Address } from "viem";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type OutputContext, emitResult, promptSecret } from "../io.js";
import {
  exportVaultBlob,
  importVaultBlob,
  listVaultEntries,
  loadVaultEntry,
} from "../vault/vault.js";
import { loadWallet } from "../wallet/loader.js";

async function passphrase(): Promise<string> {
  return process.env.TM_VAULT_PASSPHRASE ?? (await promptSecret("Vault passphrase: "));
}

export async function cmdVaultList(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const entries = await listVaultEntries(cfg);
  emitResult(
    ctx,
    { entries },
    () => {
      if (entries.length === 0) {
        process.stdout.write("(no vault entries)\n");
        return;
      }
      for (const e of entries) {
        process.stdout.write(
          `${e.path}\n  market=${e.market} chainId=${e.chainId} voter=${e.voter}\n`,
        );
      }
    },
  );
}

export interface VaultShowOpts extends ConfigOverrides {
  voter?: string;
}

export async function cmdVaultShow(
  ctx: OutputContext,
  opts: VaultShowOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  let voter: Address;
  if (opts.voter) {
    voter = opts.voter as Address;
  } else {
    const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
    voter = wallet.account.address;
  }
  const entry = await loadVaultEntry(cfg, voter, await passphrase());
  if (!entry) {
    throw new CliError("VAULT_ENTRY_NOT_FOUND", `no vault entry for ${voter}`);
  }
  emitResult(ctx, entry, () => {
    process.stdout.write(JSON.stringify(entry, null, 2) + "\n");
  });
}

export interface VaultExportOpts extends ConfigOverrides {
  voter?: string;
  output?: string;
}

export async function cmdVaultExport(
  ctx: OutputContext,
  opts: VaultExportOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  let voter: Address;
  if (opts.voter) {
    voter = opts.voter as Address;
  } else {
    const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
    voter = wallet.account.address;
  }
  const blob = await exportVaultBlob(cfg, voter);
  if (opts.output) {
    await writeFile(opts.output, blob, "utf8");
    emitResult(ctx, { voter, path: opts.output, blob: null }, () => {
      process.stdout.write(`exported to ${opts.output}\n`);
    });
  } else {
    emitResult(ctx, { voter, path: null, blob }, () => {
      process.stdout.write(blob + "\n");
    });
  }
}

export interface VaultImportOpts extends ConfigOverrides {
  file: string;
}

export async function cmdVaultImport(
  ctx: OutputContext,
  opts: VaultImportOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const blob = (await readFile(opts.file, "utf8")).trim();
  const target = await importVaultBlob(cfg, blob);
  emitResult(ctx, { path: target }, () => {
    process.stdout.write(`imported to ${target}\n`);
  });
}
