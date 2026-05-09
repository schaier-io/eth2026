import { type Hex, formatEther, formatUnits, isHex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { makePublicClient } from "../chain/client.js";
import { readBalance, readDecimals, readSymbol } from "../chain/erc20.js";
import { readStakeToken } from "../chain/contract.js";
import { type OutputContext, emitResult, promptSecret, requireInteractive } from "../io.js";
import {
  decryptKeystore,
  encryptKeystore,
  readKeystoreFile,
  writeKeystoreFile,
} from "../wallet/keystore.js";
import { loadWallet } from "../wallet/loader.js";

export interface WalletInitOpts extends ConfigOverrides {
  privateKey?: string;
  passphrase?: string;
  force?: boolean;
}

export async function cmdWalletInit(
  ctx: OutputContext,
  opts: WalletInitOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const existing = await readKeystoreFile(cfg.keystorePath);
  if (existing && !opts.force) {
    throw new CliError(
      "KEYSTORE_EXISTS",
      `keystore already exists at ${cfg.keystorePath}; pass --force to overwrite`,
    );
  }

  let pk: Hex;
  if (opts.privateKey) {
    const candidate = opts.privateKey.startsWith("0x")
      ? (opts.privateKey as Hex)
      : (`0x${opts.privateKey}` as Hex);
    if (!isHex(candidate) || candidate.length !== 66) {
      throw new CliError("INVALID_PRIVATE_KEY", "expected 32-byte hex private key");
    }
    pk = candidate;
  } else {
    pk = generatePrivateKey();
  }

  let passphrase = opts.passphrase ?? process.env.TM_KEYSTORE_PASSPHRASE;
  if (!passphrase) {
    requireInteractive(ctx);
    passphrase = await promptSecret("New keystore passphrase: ");
    const confirm = await promptSecret("Confirm passphrase: ");
    if (passphrase !== confirm) {
      throw new CliError("PASSPHRASE_MISMATCH", "passphrases did not match");
    }
    if (passphrase.length < 8) {
      throw new CliError("PASSPHRASE_WEAK", "passphrase must be at least 8 characters");
    }
  }

  const ks = await encryptKeystore(pk, passphrase);
  await writeKeystoreFile(cfg.keystorePath, ks);

  emitResult(
    ctx,
    {
      address: ks.address,
      keystorePath: cfg.keystorePath,
      generated: !opts.privateKey,
    },
    () => {
      process.stdout.write(
        `keystore written: ${cfg.keystorePath}\naddress: ${ks.address}\n${
          opts.privateKey ? "" : "(generated a new private key — back up the keystore)\n"
        }`,
      );
    },
  );
}

export async function cmdWalletShow(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  emitResult(
    ctx,
    {
      address: wallet.account.address,
      chain: cfg.chainKey,
      chainId: cfg.chain.id,
      source: wallet.source,
    },
    () => {
      process.stdout.write(
        `address: ${wallet.account.address}\nchain:   ${cfg.chainKey} (${cfg.chain.id})\nsource:  ${wallet.source}\n`,
      );
    },
  );
}

export async function cmdWalletBalance(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const client = makePublicClient(cfg);

  const ethWei = await client.getBalance({ address: wallet.account.address });
  const stakeToken = await readStakeToken(client, cfg);
  const [decimals, symbol, tokenBalance] = await Promise.all([
    readDecimals(client, stakeToken),
    readSymbol(client, stakeToken),
    readBalance(client, stakeToken, wallet.account.address),
  ]);

  emitResult(
    ctx,
    {
      address: wallet.account.address,
      ethWei,
      stakeTokenAddress: stakeToken,
      stakeTokenSymbol: symbol,
      stakeTokenDecimals: decimals,
      stakeTokenBalance: tokenBalance,
    },
    () => {
      process.stdout.write(
        `address: ${wallet.account.address}\n` +
          `ETH:     ${formatEther(ethWei)} (${ethWei} wei)\n` +
          `${symbol}: ${formatUnits(tokenBalance, decimals)} (${tokenBalance} base units)\n` +
          `stake token: ${stakeToken}\n`,
      );
    },
  );
}

export async function cmdWalletExport(
  ctx: OutputContext,
  opts: ConfigOverrides & { unsafe?: boolean },
): Promise<void> {
  const cfg = resolveConfig(opts);
  if (!opts.unsafe) {
    throw new CliError(
      "UNSAFE_REQUIRED",
      "wallet export prints the raw private key; pass --unsafe to confirm",
    );
  }
  const ks = await readKeystoreFile(cfg.keystorePath);
  if (!ks) {
    throw new CliError("KEYSTORE_NOT_FOUND", `no keystore at ${cfg.keystorePath}`);
  }
  const passphrase =
    process.env.TM_KEYSTORE_PASSPHRASE ?? (await promptSecret("Keystore passphrase: "));
  const { privateKey, account } = await decryptKeystore(ks, passphrase);
  emitResult(
    ctx,
    { address: account.address, privateKey },
    () => {
      process.stdout.write(`address:    ${account.address}\nprivateKey: ${privateKey}\n`);
    },
  );
}

