import { concatBytes } from "./bytes.js";
import { keccak256 } from "./crypto.js";
import { SwarmVerificationError } from "./errors.js";

export const SWARM_HASH_SIZE = 32;
export const SWARM_SPAN_SIZE = 8;
export const SWARM_CHUNK_PAYLOAD_SIZE = 4096;
export const SWARM_BMT_LEAF_COUNT = SWARM_CHUNK_PAYLOAD_SIZE / SWARM_HASH_SIZE;

export function bmtRoot(payload: Uint8Array): Uint8Array {
  if (payload.length > SWARM_CHUNK_PAYLOAD_SIZE) {
    throw new SwarmVerificationError("A Swarm chunk payload cannot exceed 4096 bytes.");
  }

  let level = new Array<Uint8Array>(SWARM_BMT_LEAF_COUNT);
  const padded = new Uint8Array(SWARM_CHUNK_PAYLOAD_SIZE);
  padded.set(payload);

  for (let index = 0; index < SWARM_BMT_LEAF_COUNT; index += 1) {
    level[index] = padded.slice(index * SWARM_HASH_SIZE, (index + 1) * SWARM_HASH_SIZE);
  }

  while (level.length > 1) {
    const nextLevel = new Array<Uint8Array>(level.length / 2);

    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1];

      if (!left || !right) {
        throw new SwarmVerificationError("BMT level has an unexpected odd number of nodes.");
      }

      nextLevel[index / 2] = keccak256(concatBytes([left, right]));
    }

    level = nextLevel;
  }

  const root = level[0];

  if (!root) {
    throw new SwarmVerificationError("BMT root could not be calculated.");
  }

  return root;
}

export function bmtHash(spanBytes: Uint8Array, payload: Uint8Array): Uint8Array {
  if (spanBytes.length !== SWARM_SPAN_SIZE) {
    throw new SwarmVerificationError("A Swarm span must be exactly 8 bytes.");
  }

  return keccak256(concatBytes([spanBytes, bmtRoot(payload)]));
}
