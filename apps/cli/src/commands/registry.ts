import { readFile } from "node:fs/promises";
import { type Hex, isHex } from "viem";
import { z } from "zod";
import { makePublicClient, makeWalletClient } from "../chain/client.js";
import {
  type MarketSpec,
  readMarketCount,
  readMarkets,
  readRegistryConfig,
  writeCreateMarket,
} from "../chain/registry.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type OutputContext, emitResult, promptSecret } from "../io.js";
import {
  type PolicyOverrides,
  assertCreateMarketAllowed,
  loadPolicy,
} from "../policy/policy.js";
import { loadWallet } from "../wallet/loader.js";

const MarketSpecSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  ipfsHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/, "ipfsHash must be 0x-prefixed hex bytes"),
  votingPeriod: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  adminTimeout: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  revealPeriod: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  protocolFeePercent: z.number().int().min(0).max(10),
  minStake: z.string().regex(/^\d+$/, "minStake must be a non-negative integer string"),
  jurySize: z.number().int().positive(),
  minCommits: z.number().int().positive(),
  minRevealedJurors: z.number().int().positive(),
});

export type MarketSpecJson = z.infer<typeof MarketSpecSchema>;

export function parseMarketSpec(raw: unknown): MarketSpec {
  const parsed = MarketSpecSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError(
      "SPEC_INVALID",
      `market spec validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  const s = parsed.data;
  if (!isHex(s.ipfsHash)) {
    throw new CliError("SPEC_INVALID", `ipfsHash '${s.ipfsHash}' is not valid hex`);
  }
  return {
    name: s.name,
    description: s.description,
    tags: s.tags,
    ipfsHash: s.ipfsHash as Hex,
    votingPeriod: BigInt(s.votingPeriod),
    adminTimeout: BigInt(s.adminTimeout),
    revealPeriod: BigInt(s.revealPeriod),
    protocolFeePercent: s.protocolFeePercent,
    minStake: BigInt(s.minStake),
    jurySize: s.jurySize,
    minCommits: s.minCommits,
    minRevealedJurors: s.minRevealedJurors,
  };
}

export async function cmdRegistryInfo(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const [config, count] = await Promise.all([
    readRegistryConfig(client, cfg),
    readMarketCount(client, cfg),
  ]);
  const data = {
    address: cfg.registryAddress,
    chain: cfg.chainKey,
    chainId: cfg.chain.id,
    stakeToken: config.stakeToken,
    marketCount: count,
  };
  emitResult(ctx, data, () => {
    process.stdout.write(
      `registry:        ${cfg.registryAddress} (${cfg.chainKey})\n` +
      `stake token:     ${config.stakeToken}\n` +
      `market count:    ${count}\n`,
    );
  });
}

export async function cmdRegistryList(
  ctx: OutputContext,
  opts: ConfigOverrides & { offset?: number; limit?: number },
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const offset = BigInt(opts.offset ?? 0);
  const limit = BigInt(opts.limit ?? 50);
  const total = await readMarketCount(client, cfg);
  const markets = await readMarkets(client, cfg, { offset, limit });
  emitResult(
    ctx,
    {
      total,
      offset,
      limit,
      markets,
    },
    () => {
      process.stdout.write(`markets ${offset}..${offset + BigInt(markets.length)} of ${total}:\n`);
      for (let i = 0; i < markets.length; i++) {
        process.stdout.write(`  [${offset + BigInt(i)}] ${markets[i]}\n`);
      }
    },
  );
}

export async function cmdRegistryCreateMarket(
  ctx: OutputContext,
  opts: ConfigOverrides & PolicyOverrides & { spec?: string },
): Promise<void> {
  if (!opts.spec) {
    throw new CliError("SPEC_REQUIRED", "missing --spec <path>");
  }
  const cfg = resolveConfig(opts);
  const policy = await loadPolicy(cfg);
  assertCreateMarketAllowed(policy, opts);

  const raw = await readFile(opts.spec, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new CliError(
      "SPEC_PARSE",
      `spec file at ${opts.spec} is not valid JSON: ${(e as Error).message}`,
    );
  }
  const spec = parseMarketSpec(parsed);

  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);

  const result = await writeCreateMarket(walletClient, publicClient, cfg, spec);

  emitResult(
    ctx,
    {
      marketId: result.marketId,
      marketAddress: result.marketAddress,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      registry: cfg.registryAddress,
      creator: wallet.account.address,
      name: spec.name,
    },
    () => {
      process.stdout.write(
        `created market #${result.marketId}\n` +
          `  address:   ${result.marketAddress}\n` +
          `  registry:  ${cfg.registryAddress}\n` +
          `  creator:   ${wallet.account.address}\n` +
          `  tx:        ${result.txHash}\n` +
          `  block:     ${result.blockNumber}\n` +
          `  name:      ${spec.name}\n`,
      );
    },
  );
}
