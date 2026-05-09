import { makePublicClient } from "../chain/client.js";
import { type ConfigOverrides, resolveConfig } from "../config.js";
import { type OutputContext, emitResult } from "../io.js";
import { readIpfsHash, verifyLocalDocument } from "../swarm/verify.js";

export async function cmdSwarmShowHash(
  ctx: OutputContext,
  opts: ConfigOverrides,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const ipfsHash = await readIpfsHash(client, cfg);
  emitResult(ctx, { ipfsHashHex: ipfsHash }, () => {
    process.stdout.write(`${ipfsHash}\n`);
  });
}

export interface SwarmVerifyOpts extends ConfigOverrides {
  document: string;
}

// Mismatch is still a successful verify; the boolean lives in `data.match`.
// Always exits 0; only chain/IO faults raise CliError.
export async function cmdSwarmVerify(
  ctx: OutputContext,
  opts: SwarmVerifyOpts,
): Promise<void> {
  const cfg = resolveConfig(opts);
  const client = makePublicClient(cfg);
  const expected = await readIpfsHash(client, cfg);
  const result = await verifyLocalDocument(expected, opts.document);
  emitResult(ctx, result, () => {
    process.stdout.write(
      `expected: ${result.expected}\ncomputed: ${result.computed}\nmatch:    ${result.match}\n`,
    );
  });
}
