import { render } from "ink";
import React from "react";
import { App } from "../tui/App.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { promptSecret } from "../io.js";
import { loadWallet } from "../wallet/loader.js";

export async function cmdTui(opts: ConfigOverrides): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const vaultPassphrase =
    process.env.TM_VAULT_PASSPHRASE ?? (await promptSecret("Vault passphrase: "));
  if (!vaultPassphrase) {
    throw new CliError("INTERACTIVE_PROMPT_REQUIRED", "vault passphrase required");
  }
  const { waitUntilExit } = render(
    React.createElement(App, { cfg, wallet, vaultPassphrase }),
  );
  await waitUntilExit();
}
