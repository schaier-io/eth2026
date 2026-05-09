import { rename, writeFile } from "node:fs/promises";

/**
 * POSIX rename is atomic within the same filesystem; Windows ≥ Vista offers
 * the same guarantee for `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`, which
 * is what Node's rename uses. Both tmp and target live in the same directory,
 * so we always get the atomic path.
 *
 * The tmp suffix carries pid + random so concurrent writers from different
 * processes (heartbeat + vote commit, say) don't collide.
 */
export async function atomicWriteFile(
  target: string,
  content: string | Uint8Array,
  mode = 0o600,
): Promise<void> {
  const suffix = `${process.pid}.${Math.random().toString(36).slice(2, 10)}`;
  const tmp = `${target}.tmp.${suffix}`;
  await writeFile(tmp, content, { mode });
  await rename(tmp, target);
}
