import { type Hex, isHex, keccak256, stringToHex } from "viem";
import { CliError } from "../errors.js";

export const SPACE_COMPUTER_BEACON_PATH =
  "/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f";
export const SPACE_COMPUTER_BEACON_URL = `https://ipfs.io${SPACE_COMPUTER_BEACON_PATH}`;
export const SPACE_COMPUTER_CTRNG_INDEX = 0;

const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;

interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

interface FetchInitLike {
  cache?: "no-store";
  headers?: Record<string, string>;
}

type FetchLike = (url: string, init?: FetchInitLike) => Promise<FetchResponseLike>;

export interface LatestSpaceComputerBeacon {
  randomness: bigint;
  randomnessHex: Hex;
  auditHash: Hex;
  previous: string | null;
  ipfsAddressText: string;
  metadata: {
    ipfsAddress: Hex;
    sequence: bigint;
    timestamp: bigint;
    valueIndex: number;
  };
}

export async function fetchLatestSpaceComputerBeacon(
  fetcher: FetchLike = defaultFetch,
): Promise<LatestSpaceComputerBeacon> {
  const fetchUrl = `${SPACE_COMPUTER_BEACON_URL}?tm=${Date.now()}`;
  let response: FetchResponseLike;
  try {
    response = await fetcher(fetchUrl, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
  } catch (e) {
    throw new CliError(
      "SPACECOMPUTER_FETCH_FAILED",
      `failed to fetch latest SpaceComputer beacon from ${fetchUrl}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  if (!response.ok) {
    throw new CliError(
      "SPACECOMPUTER_FETCH_FAILED",
      `SpaceComputer beacon fetch failed with HTTP ${response.status} ${response.statusText}`,
    );
  }
  return parseSpaceComputerBeacon(await response.text());
}

export function parseSpaceComputerBeacon(rawBody: string): LatestSpaceComputerBeacon {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {
    throw new CliError(
      "SPACECOMPUTER_INVALID_BEACON",
      `SpaceComputer beacon response is not valid JSON: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  const root = expectRecord(parsed, "beacon");
  const data = expectRecord(root.data, "beacon.data");
  const ctrng = data.ctrng;
  if (!Array.isArray(ctrng) || ctrng.length === 0) {
    throw new CliError(
      "SPACECOMPUTER_INVALID_BEACON",
      "SpaceComputer beacon data.ctrng must be a non-empty array",
    );
  }

  const randomnessHex = parseCtrngHex(ctrng[SPACE_COMPUTER_CTRNG_INDEX]);
  const randomness = BigInt(randomnessHex);
  if (randomness === 0n || randomness > MAX_UINT256) {
    throw new CliError(
      "SPACECOMPUTER_INVALID_RANDOMNESS",
      "SpaceComputer cTRNG value must be a non-zero uint256",
    );
  }

  const sequence = parseUint64(data.sequence, "data.sequence");
  const timestamp = parseUint64(data.timestamp, "data.timestamp");
  if (timestamp === 0n) {
    throw new CliError(
      "SPACECOMPUTER_INVALID_BEACON",
      "SpaceComputer beacon data.timestamp must be non-zero",
    );
  }

  return {
    randomness,
    randomnessHex,
    auditHash: keccak256(stringToHex(rawBody)),
    previous: typeof root.previous === "string" ? root.previous : null,
    ipfsAddressText: SPACE_COMPUTER_BEACON_PATH,
    metadata: {
      ipfsAddress: stringToHex(SPACE_COMPUTER_BEACON_PATH),
      sequence,
      timestamp,
      valueIndex: SPACE_COMPUTER_CTRNG_INDEX,
    },
  };
}

function defaultFetch(url: string, init?: FetchInitLike): Promise<FetchResponseLike> {
  const fetcher = (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (!fetcher) {
    throw new CliError(
      "FETCH_UNAVAILABLE",
      "global fetch is unavailable; run with Node 20 or newer.",
    );
  }
  return fetcher(url, init);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError("SPACECOMPUTER_INVALID_BEACON", `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseCtrngHex(value: unknown): Hex {
  if (typeof value !== "string") {
    throw new CliError(
      "SPACECOMPUTER_INVALID_RANDOMNESS",
      "SpaceComputer cTRNG value must be a hex string",
    );
  }
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!isHex(normalized) || normalized.length > 66) {
    throw new CliError(
      "SPACECOMPUTER_INVALID_RANDOMNESS",
      "SpaceComputer cTRNG value must fit uint256 hex",
    );
  }
  return normalized as Hex;
}

function parseUint64(value: unknown, label: string): bigint {
  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number" && Number.isSafeInteger(value)) {
    parsed = BigInt(value);
  } else if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    parsed = BigInt(value.trim());
  } else {
    throw new CliError("SPACECOMPUTER_INVALID_BEACON", `${label} must be a uint64`);
  }
  if (parsed < 0n || parsed > MAX_UINT64) {
    throw new CliError("SPACECOMPUTER_INVALID_BEACON", `${label} is outside uint64 range`);
  }
  return parsed;
}
