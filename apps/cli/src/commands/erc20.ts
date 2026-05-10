import { formatUnits, maxUint256 } from "viem";
import { makePublicClient, makeWalletClient } from "../chain/client.js";
import { readAllowance, readDecimals, readSymbol, writeApprove } from "../chain/erc20.js";
import { readStakeToken } from "../chain/contract.js";
import { assertConfiguredMarketIntegrity } from "../chain/market-integrity.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type OutputContext, emitResult, promptSecret } from "../io.js";
import { loadWallet } from "../wallet/loader.js";

export interface Erc20ApproveOpts extends ConfigOverrides {
  amount?: string;
}

export async function cmdErc20Approve(
  ctx: OutputContext,
  opts: Erc20ApproveOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);
  await assertConfiguredMarketIntegrity(publicClient, cfg);

  const stakeToken = await readStakeToken(publicClient, cfg);
  let amount: bigint;
  if (!opts.amount || opts.amount === "max") {
    amount = maxUint256;
  } else {
    try {
      amount = BigInt(opts.amount);
    } catch {
      throw new CliError("INVALID_AMOUNT", `invalid amount '${opts.amount}'`);
    }
  }

  const tx = await writeApprove(
    walletClient,
    publicClient,
    stakeToken,
    cfg.contractAddress,
    amount,
  );
  const allowance = await readAllowance(
    publicClient,
    stakeToken,
    wallet.account.address,
    cfg.contractAddress,
  );

  emitResult(
    ctx,
    {
      txHash: tx.txHash,
      blockNumber: tx.blockNumber,
      stakeToken,
      owner: wallet.account.address,
      spender: cfg.contractAddress,
      allowance,
    },
    () => {
      process.stdout.write(
        `approved ${amount === maxUint256 ? "MAX" : amount.toString()} ${stakeToken} for ${cfg.contractAddress}\n` +
          `allowance now: ${allowance}\ntx: ${tx.txHash} (block ${tx.blockNumber})\n`,
      );
    },
  );
}

export async function cmdErc20Allowance(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  await assertConfiguredMarketIntegrity(publicClient, cfg);

  const stakeToken = await readStakeToken(publicClient, cfg);
  const [allowance, decimals, symbol] = await Promise.all([
    readAllowance(publicClient, stakeToken, wallet.account.address, cfg.contractAddress),
    readDecimals(publicClient, stakeToken),
    readSymbol(publicClient, stakeToken),
  ]);

  emitResult(
    ctx,
    {
      stakeToken,
      symbol,
      owner: wallet.account.address,
      spender: cfg.contractAddress,
      allowance,
      decimals,
    },
    () => {
      process.stdout.write(
        `${symbol} allowance: ${formatUnits(allowance, decimals)} (${allowance} base units)\n` +
          `owner:   ${wallet.account.address}\nspender: ${cfg.contractAddress}\n`,
      );
    },
  );
}
