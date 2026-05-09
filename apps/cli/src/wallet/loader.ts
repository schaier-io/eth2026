import { type Hex, isHex } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import type { ResolvedConfig } from "../config.js";
import { CliError } from "../errors.js";
import { decryptKeystore, readKeystoreFile } from "./keystore.js";

export interface LoadedWallet {
  account: PrivateKeyAccount;
  source: "env" | "keystore";
}

/**
 * Resolve the active signing wallet.
 *
 * Order:
 *   1. PRIVATE_KEY env (matches contracts/script/TruthMarket.s.sol).
 *   2. Encrypted keystore at cfg.keystorePath, with passphrase from
 *      TM_KEYSTORE_PASSPHRASE or the supplied prompt callback.
 *   3. Error.
 */
export async function loadWallet(
  cfg: ResolvedConfig,
  promptPassphrase?: () => Promise<string>,
): Promise<LoadedWallet> {
  const envKey = process.env.PRIVATE_KEY;
  if (envKey) {
    const normalized = envKey.startsWith("0x") ? envKey : `0x${envKey}`;
    if (!isHex(normalized) || normalized.length !== 66) {
      throw new CliError(
        "INVALID_PRIVATE_KEY",
        "PRIVATE_KEY env must be 32-byte hex (with or without 0x)",
      );
    }
    return {
      account: privateKeyToAccount(normalized as Hex),
      source: "env",
    };
  }

  const ks = await readKeystoreFile(cfg.keystorePath);
  if (!ks) {
    throw new CliError(
      "WALLET_NOT_CONFIGURED",
      "no wallet found. Set PRIVATE_KEY env, or run 'truthmarket wallet init' to create a keystore.",
    );
  }
  const envPass = process.env.TM_KEYSTORE_PASSPHRASE;
  const passphrase = envPass ?? (promptPassphrase ? await promptPassphrase() : undefined);
  if (!passphrase) {
    throw new CliError(
      "INTERACTIVE_PROMPT_REQUIRED",
      "keystore passphrase required. Set TM_KEYSTORE_PASSPHRASE or run interactively.",
    );
  }
  const { account } = await decryptKeystore(ks, passphrase);
  return { account, source: "keystore" };
}
