import { NextResponse } from "next/server";
import {
  SPACE_COMPUTER_BEACON_URL,
  fetchLatestSpaceComputerBeacon,
} from "../../../../lib/server/spacecomputer";

export const runtime = "nodejs";

export async function GET() {
  try {
    const beacon = await fetchLatestSpaceComputerBeacon();
    return NextResponse.json({
      ok: true,
      beaconUrl: SPACE_COMPUTER_BEACON_URL,
      randomness: beacon.randomness.toString(),
      randomnessHex: beacon.randomnessHex,
      auditHash: beacon.auditHash,
      previous: beacon.previous,
      ipfsAddressText: beacon.ipfsAddressText,
      metadata: {
        ipfsAddress: beacon.metadata.ipfsAddress,
        sequence: beacon.metadata.sequence.toString(),
        timestamp: beacon.metadata.timestamp.toString(),
        valueIndex: beacon.metadata.valueIndex,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
