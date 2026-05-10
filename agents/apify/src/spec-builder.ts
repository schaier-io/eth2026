import type { ApifyCandidate } from "./apify.js";
import type { Hex, MarketSpec } from "./types.js";
import { keccak256, stringToBytes } from "viem";

/**
 * Subdivision of a market's total duration into the three on-chain phases.
 * Sums to 1.0 by contract.
 */
const PHASE_SPLIT = { voting: 0.4, juryCommit: 0.2, reveal: 0.4 } as const;

/** Contract minimum is 1 minute (60s) per phase. */
const MIN_PHASE_SECONDS = 60;

const MAX_SWARM_REFERENCE_BYTES = 96;

export interface BuildSpecOpts {
  /** Total market lifetime in seconds (voting + juryCommit + reveal). */
  durationSeconds: number;
  /** ERC20 minStake in token base units. */
  minStake: bigint;
  /** Jury draw size (odd). Defaults to 1 for short demo markets. */
  jurySize?: number;
  /** Minimum committed voters. Defaults satisfy `minCommits × 15 ≥ jurySize × 100`. */
  minCommits?: number;
  /** Minimum jurors that must reveal for a decisive resolution. */
  minRevealedJurors?: number;
  /** Real Swarm KV claim document reference. Falls back to a deterministic placeholder when omitted. */
  swarmReference?: Hex;
}

/**
 * Returns the keccak256 of the JSON-stringified claim rules document. Used as
 * a placeholder Swarm reference for MVP runs without a Swarm gateway.
 * Production deployments should replace this with the actual Swarm KV index
 * reference that stores the title and YES/NO context.
 */
export function placeholderSwarmReference(claimRules: object): Hex {
  return keccak256(stringToBytes(JSON.stringify(claimRules)));
}

function splitDurationSeconds(total: number): {
  voting: bigint;
  juryCommit: bigint;
  reveal: bigint;
} {
  const voting = Math.max(MIN_PHASE_SECONDS, Math.floor(total * PHASE_SPLIT.voting));
  const juryCommit = Math.max(MIN_PHASE_SECONDS, Math.floor(total * PHASE_SPLIT.juryCommit));
  const reveal = Math.max(MIN_PHASE_SECONDS, Math.floor(total * PHASE_SPLIT.reveal));
  return {
    voting: BigInt(voting),
    juryCommit: BigInt(juryCommit),
    reveal: BigInt(reveal),
  };
}

/**
 * Convert one Apify candidate into a TruthMarket spec ready for the host's
 * `createMarket` adapter (which calls `MarketRegistry.createMarket` to clone
 * the shared TruthMarket implementation). The swarmReference is a deterministic
 * placeholder for MVP agent runs; swap to a real Swarm KV reference once the
 * agent has a Bee writer.
 */
export function buildMarketSpec(
  candidate: ApifyCandidate,
  opts: BuildSpecOpts,
): MarketSpec {
  const { voting, juryCommit, reveal } = splitDurationSeconds(opts.durationSeconds);
  const jurySize = opts.jurySize ?? 1;
  if (jurySize % 2 === 0) {
    throw new Error(`jurySize must be odd (got ${jurySize})`);
  }
  const minCommits = opts.minCommits ?? Math.max(jurySize, Math.ceil((jurySize * 100) / 15));
  const minRevealedJurors = opts.minRevealedJurors ?? Math.min(jurySize, 1);
  const swarmReference = opts.swarmReference ?? placeholderSwarmReference(candidate.claimRulesDraft);
  if ((swarmReference.length - 2) / 2 > MAX_SWARM_REFERENCE_BYTES) {
    throw new Error(`swarmReference too long: ${swarmReference}`);
  }

  return {
    swarmReference,
    votingPeriod: voting,
    adminTimeout: juryCommit,
    revealPeriod: reveal,
    minStake: opts.minStake,
    jurySize,
    minCommits,
    minRevealedJurors,
  };
}
