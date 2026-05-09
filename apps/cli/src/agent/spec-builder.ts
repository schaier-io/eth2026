import { type Hex, keccak256, stringToBytes } from "viem";
import type { MarketSpec } from "../chain/registry.js";
import type { ApifyCandidate } from "./apify.js";

/**
 * Subdivision of a market's total duration into the three on-chain phases.
 * Sums to 1.0 by contract.
 */
const PHASE_SPLIT = { voting: 0.4, juryCommit: 0.2, reveal: 0.4 } as const;

/** Contract minimum is 1 minute (60s) per phase. */
const MIN_PHASE_SECONDS = 60;

const MAX_NAME_BYTES = 120;
const MAX_DESCRIPTION_BYTES = 1000;
const MAX_TAG_BYTES = 32;
const MAX_TAGS = 5;
const MAX_IPFS_HASH_BYTES = 96;

export interface BuildSpecOpts {
  /** Total market lifetime in seconds (voting + juryCommit + reveal). */
  durationSeconds: number;
  /** ERC20 minStake in token base units. */
  minStake: bigint;
  /** Protocol fee % (0–10). */
  protocolFeePercent: number;
  /** Jury draw size (odd). Defaults to 1 for short demo markets. */
  jurySize?: number;
  /** Minimum committed voters. Defaults satisfy `minCommits × 15 ≥ jurySize × 100`. */
  minCommits?: number;
  /** Minimum jurors that must reveal for a decisive resolution. */
  minRevealedJurors?: number;
}

/**
 * Returns the keccak256 of the JSON-stringified claim rules document. Used as
 * a placeholder ipfsHash for MVP runs without a Swarm gateway. Production
 * deployments should replace this with the actual Swarm reference.
 */
export function placeholderIpfsHash(claimRules: object): Hex {
  return keccak256(stringToBytes(JSON.stringify(claimRules)));
}

/** Truncate a string to `maxBytes` UTF-8 bytes, preserving codepoint boundaries. */
function truncateBytes(s: string, maxBytes: number): string {
  const bytes = stringToBytes(s);
  if (bytes.length <= maxBytes) return s;
  // Walk back until we land on a valid codepoint boundary (top-bit not 10xxxxxx).
  let cut = maxBytes;
  while (cut > 0 && ((bytes[cut] ?? 0) & 0xc0) === 0x80) cut--;
  return new TextDecoder().decode(bytes.slice(0, cut));
}

function normalizeTags(subreddit: string): string[] {
  const tags = ["agent", subreddit ? `r/${subreddit}` : ""].filter(Boolean);
  return tags
    .map((t) => truncateBytes(t, MAX_TAG_BYTES))
    .filter((t) => t.length > 0)
    .slice(0, MAX_TAGS);
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
 * Convert one Apify candidate into a registry MarketSpec ready for
 * `writeCreateMarket`. The ipfsHash is computed via `placeholderIpfsHash`
 * for MVP; swap to a real Swarm reference once a gateway is wired up.
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
  const ipfsHash = placeholderIpfsHash(candidate.claimRulesDraft);
  if ((ipfsHash.length - 2) / 2 > MAX_IPFS_HASH_BYTES) {
    throw new Error(`ipfsHash too long: ${ipfsHash}`);
  }

  return {
    name: truncateBytes(candidate.claimRulesDraft.title, MAX_NAME_BYTES),
    description: truncateBytes(candidate.claimRulesDraft.description, MAX_DESCRIPTION_BYTES),
    tags: normalizeTags(candidate.subreddit),
    ipfsHash,
    votingPeriod: voting,
    adminTimeout: juryCommit,
    revealPeriod: reveal,
    protocolFeePercent: opts.protocolFeePercent,
    minStake: opts.minStake,
    jurySize,
    minCommits,
    minRevealedJurors,
  };
}
