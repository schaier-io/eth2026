import { makePublicClient } from "../chain/client.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { type OutputContext, emitResult } from "../io.js";
import { readClaimRulesHash, readIpfsHash, verifyOnchainClaimRulesDocument } from "../swarm/verify.js";

export async function cmdSwarmShowHash(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const [ipfsHashHex, claimRulesHash] = await Promise.all([
    readIpfsHash(client, cfg),
    readClaimRulesHash(client, cfg),
  ]);
  emitResult(ctx, { ipfsHashHex, claimRulesHash }, () => {
    process.stdout.write(`ipfsHash:       ${ipfsHashHex}\nclaimRulesHash: ${claimRulesHash}\n`);
  });
}

export interface SwarmVerifyOpts extends ConfigOverrides {
  document: string;
  gateway?: string;
}

// Mismatch is still a successful verify; the boolean lives in `data.match`.
// Always exits 0 for document mismatches; chain/IO/gateway faults raise CliError.
export async function cmdSwarmVerify(
  ctx: OutputContext,
  opts: SwarmVerifyOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const result = await verifyOnchainClaimRulesDocument(client, cfg, opts.document, {
    ...(opts.gateway ? { gatewayUrl: opts.gateway } : {}),
  });
  emitResult(ctx, result, () => {
    process.stdout.write(
      `reference:      ${result.swarmReference}\n` +
        `expected hash:  ${result.expected}\n` +
        `computed hash:  ${result.computed}\n` +
        `remote hash:    ${result.remoteContentHash}\n` +
        `chunks:         ${result.chunksVerified}\n` +
        `match:          ${result.match}\n`,
    );
  });
}
