import { readFile } from "node:fs/promises";
import { type Address, type Hex, isAddress, isHex } from "viem";
import { z } from "zod";
import { makePublicClient, makeWalletClient } from "../chain/client.js";
import {
  type MarketSpec,
  readMarketsPaginated,
  readRegistryOperationalInfo,
  readTotalMarkets,
  writeCreateMarket,
} from "../chain/registry.js";
import {
  acceptsMarketIntegrity,
  assertMarketIntegrityAccepted,
  lookupSourcifyMatch,
  verifyMarketIntegrity,
} from "../chain/market-integrity.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { CliError } from "../errors.js";
import { type OutputContext, emitResult, promptSecret } from "../io.js";
import {
  type PolicyOverrides,
  assertCreateMarketAllowed,
  loadPolicy,
} from "../policy/policy.js";
import { storeClaimDocument, type StoreClaimDocumentInput } from "../swarm/claim-doc.js";
import { loadWallet } from "../wallet/loader.js";

const ClaimDocumentSchema = z.object({
  title: z.string().min(1),
  context: z.string().min(1),
  tags: z.array(z.string()).max(5).optional(),
});

const MAX_TARGET_JURY_SIZE = 100;

const MarketSpecSchema = z.object({
  stakeToken: z.string().optional(),
  juryCommitter: z.string().optional(),
  swarmReference: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/, "swarmReference must be 0x-prefixed hex bytes")
    .optional(),
  claimDocument: ClaimDocumentSchema.optional(),
  votingPeriod: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  adminTimeout: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  revealPeriod: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  minStake: z.string().regex(/^\d+$/, "minStake must be a non-negative integer string"),
  jurySize: z.number().int().positive(),
  minCommits: z.number().int().positive(),
  maxCommits: z.number().int().min(0).optional(),
  minRevealedJurors: z.number().int().positive(),
  creatorBond: z.string().regex(/^\d+$/, "creatorBond must be a non-negative integer string").optional(),
}).superRefine((spec, ctx) => {
  if (/^\d+$/.test(spec.minStake) && BigInt(spec.minStake) === 0n) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minStake must be greater than 0",
      path: ["minStake"],
    });
  }
  if (spec.jurySize > MAX_TARGET_JURY_SIZE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `jurySize must be <= ${MAX_TARGET_JURY_SIZE}`,
      path: ["jurySize"],
    });
  }
  if (spec.jurySize % 2 === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "jurySize must be odd",
      path: ["jurySize"],
    });
  }
  if (spec.minRevealedJurors % 2 === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minRevealedJurors must be odd",
      path: ["minRevealedJurors"],
    });
  }
  if (spec.minRevealedJurors > spec.jurySize) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minRevealedJurors must be <= jurySize",
      path: ["minRevealedJurors"],
    });
  }
  if (spec.minCommits < spec.minRevealedJurors) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minCommits must be at least minRevealedJurors",
      path: ["minCommits"],
    });
  }
  if (spec.maxCommits !== undefined && spec.maxCommits !== 0 && spec.maxCommits < spec.minCommits) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "maxCommits must be 0 or at least minCommits",
      path: ["maxCommits"],
    });
  }
}).refine((spec) => Boolean(spec.swarmReference || spec.claimDocument), {
  message: "provide either swarmReference or claimDocument",
  path: ["swarmReference"],
});

export type MarketSpecJson = z.infer<typeof MarketSpecSchema>;

export interface ParsedMarketSpec {
  spec: Omit<MarketSpec, "swarmReference"> & { swarmReference?: Hex };
  claimDocument?: StoreClaimDocumentInput;
}

export function parseMarketSpec(raw: unknown): ParsedMarketSpec {
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
  if (s.swarmReference && !isHex(s.swarmReference)) {
    throw new CliError("SPEC_INVALID", `swarmReference '${s.swarmReference}' is not valid hex`);
  }
  if (s.stakeToken && !isAddress(s.stakeToken)) {
    throw new CliError("SPEC_INVALID", `stakeToken '${s.stakeToken}' is not a valid address`);
  }
  if (s.juryCommitter && !isAddress(s.juryCommitter)) {
    throw new CliError("SPEC_INVALID", `juryCommitter '${s.juryCommitter}' is not a valid address`);
  }
  return {
    spec: {
      stakeToken: s.stakeToken as Address | undefined,
      juryCommitter: s.juryCommitter as Address | undefined,
      ...(s.swarmReference ? { swarmReference: s.swarmReference as Hex } : {}),
      votingPeriod: BigInt(s.votingPeriod),
      adminTimeout: BigInt(s.adminTimeout),
      revealPeriod: BigInt(s.revealPeriod),
      minStake: BigInt(s.minStake),
      jurySize: s.jurySize,
      minCommits: s.minCommits,
      maxCommits: s.maxCommits ?? 0,
      minRevealedJurors: s.minRevealedJurors,
      creatorBond: s.creatorBond ? BigInt(s.creatorBond) : 0n,
    },
    ...(s.claimDocument ? { claimDocument: s.claimDocument } : {}),
  };
}

export async function cmdRegistryInfo(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const total = await readTotalMarkets(client, cfg);
  const operational = await readRegistryOperationalInfo(client, cfg);
  const implementationSourcify = operational.implementation && cfg.chain.id !== 31337
    ? await lookupSourcifyMatch(cfg.chain.id, operational.implementation)
    : undefined;
  const data = {
    address: cfg.registryAddress,
    chain: cfg.chainKey,
    chainId: cfg.chain.id,
    totalMarkets: total,
    registryVersion: operational.registryVersion,
    implementation: operational.implementation,
    implementationVersion: operational.implementationVersion,
    sourcifyMatch: implementationSourcify?.match,
    sourcifyUrl: implementationSourcify?.url,
    defaults: cfg.operational,
  };
  emitResult(ctx, data, () => {
    process.stdout.write(
      `registry:        ${cfg.registryAddress} (${cfg.chainKey})\n` +
      `version:         ${operational.registryVersion ?? "(unavailable)"}\n` +
      `implementation:  ${operational.implementation ?? "(unavailable)"}\n` +
      `impl version:    ${operational.implementationVersion ?? "(unavailable)"}\n` +
      `sourcify:        ${implementationSourcify?.match ? "verified" : "not reported"}\n` +
      `total markets:   ${total}\n` +
      `stake token:     per clone (${cfg.operational.stakeToken ?? "no CLI default set"})\n` +
      `jury committer:  per clone (${cfg.operational.juryCommitter ?? "defaults to deployer in CLI"})\n` +
      `treasury:        hardcoded in TruthMarket.TREASURY()\n` +
      `protocol fee:    hardcoded 1% (TruthMarket.PROTOCOL_FEE_PERCENT)\n`,
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
  const total = await readTotalMarkets(client, cfg);
  const markets = await readMarketsPaginated(client, cfg, { offset, limit });
  const operational = await readRegistryOperationalInfo(client, cfg);
  const implementationSourcify = operational.implementation && cfg.chain.id !== 31337
    ? await lookupSourcifyMatch(cfg.chain.id, operational.implementation)
    : undefined;
  const rows = await Promise.all(
    markets.map(async (market, i) => ({
      index: offset + BigInt(i),
      market,
      verification: await verifyMarketIntegrity(client, cfg, {
        market,
        implementation: operational.implementation,
        implementationSourcify,
      }),
    })),
  );
  const visibleRows = rows.filter((row) => acceptsMarketIntegrity(row.verification));
  const rejectedRows = rows.filter((row) => !acceptsMarketIntegrity(row.verification));
  emitResult(
    ctx,
    {
      total,
      offset,
      limit,
      markets: visibleRows.map((row) => row.market),
      rejectedMarkets: rejectedRows.map((row) => ({
        index: row.index,
        market: row.market,
        status: row.verification.status,
        reason: row.verification.title,
      })),
    },
    () => {
      process.stdout.write(`markets ${offset}..${offset + BigInt(markets.length)} of ${total}:\n`);
      for (const row of visibleRows) {
        process.stdout.write(`  [${row.index}] ${row.market}  ${row.verification.label}\n`);
      }
      if (rejectedRows.length > 0) {
        process.stdout.write(`  hidden invalid registrations: ${rejectedRows.length}\n`);
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
  const parsedSpec = parseMarketSpec(parsed);
  const storedClaim = parsedSpec.spec.swarmReference
    ? null
    : await storeClaimDocument(parsedSpec.claimDocument!);
  const spec: MarketSpec = {
    ...parsedSpec.spec,
    swarmReference: parsedSpec.spec.swarmReference ?? storedClaim!.referenceBytes,
  };

  const wallet = await loadWallet(cfg, () => promptSecret("Keystore passphrase: "));
  const publicClient = makePublicClient(cfg);
  const walletClient = makeWalletClient(cfg, wallet.account);

  const result = await writeCreateMarket(walletClient, publicClient, cfg, spec);
  const codeVerification = await verifyMarketIntegrity(publicClient, cfg, { market: result.marketAddress });
  assertMarketIntegrityAccepted(codeVerification);

  emitResult(
    ctx,
    {
      marketId: result.marketId,
      marketAddress: result.marketAddress,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      registry: cfg.registryAddress,
      creator: wallet.account.address,
      swarmReference: spec.swarmReference,
      codeVerification,
      claimDocumentUrl: storedClaim?.url,
    },
    () => {
      process.stdout.write(
        `created market #${result.marketId}\n` +
          `  address:   ${result.marketAddress}\n` +
          `  registry:  ${cfg.registryAddress}\n` +
          `  creator:   ${wallet.account.address}\n` +
          `  code:      ${codeVerification.label}\n` +
          `  tx:        ${result.txHash}\n` +
          `  block:     ${result.blockNumber}\n` +
          `  swarm ref: ${spec.swarmReference}\n` +
          (storedClaim?.url ? `  claim doc: ${storedClaim.url}\n` : ""),
      );
    },
  );
}
