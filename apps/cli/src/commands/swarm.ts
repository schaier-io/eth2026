import { makePublicClient } from "../chain/client.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { type OutputContext, emitResult } from "../io.js";
import { readSwarmReference, verifyOnchainClaimRulesDocument } from "../swarm/verify.js";

export async function cmdSwarmShowHash(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const swarmReferenceHex = await readSwarmReference(client, cfg);
  emitResult(ctx, { swarmReferenceHex }, () => {
    process.stdout.write(`swarmReference: ${swarmReferenceHex}\n`);
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
        `reference hex:  ${result.swarmReferenceHex}\n` +
        `mode:           ${result.mode}\n` +
        (result.document?.title ? `title:          ${result.document.title}\n` : "") +
        `remote hash:    ${result.expected}\n` +
        `local hash:     ${result.computed}\n` +
        `chunks:         ${result.chunksVerified}\n` +
        `match:          ${result.match}\n`,
    );
  });
}
