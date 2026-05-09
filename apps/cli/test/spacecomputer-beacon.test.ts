import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import {
  SPACE_COMPUTER_BEACON_PATH,
  SPACE_COMPUTER_BEACON_URL,
  fetchLatestSpaceComputerBeacon,
  parseSpaceComputerBeacon,
} from "../src/spacecomputer/beacon.js";

const rawBeacon = JSON.stringify({
  previous: "/ipfs/bafkreial7oeangta7hakknhzsjzja4k2sehnsykx2u7bm6wdz46ug42me4",
  data: {
    sequence: 87963,
    timestamp: 1769179239,
    ctrng: [
      "88943046891c6c971f185c7cd69a350d850fca480facf549777efc4602ec94a6",
      "802a5afa3b09c360ec56cbe67cb615e038f307c905d199993e28ce38c21e9108",
      "dbbe94501ed32c55acb4ad4512da0c3871f497930c4d2d9061bbe7bd634458fc",
    ],
  },
});

describe("parseSpaceComputerBeacon", () => {
  it("extracts ctrng[0], beacon metadata, and an audit hash from the exact response bytes", () => {
    const beacon = parseSpaceComputerBeacon(rawBeacon);

    expect(beacon.randomness).toBe(
      BigInt("0x88943046891c6c971f185c7cd69a350d850fca480facf549777efc4602ec94a6"),
    );
    expect(beacon.randomnessHex).toBe(
      "0x88943046891c6c971f185c7cd69a350d850fca480facf549777efc4602ec94a6",
    );
    expect(beacon.ipfsAddressText).toBe(SPACE_COMPUTER_BEACON_PATH);
    expect(beacon.metadata.ipfsAddress).toBe(stringToHex(SPACE_COMPUTER_BEACON_PATH));
    expect(beacon.metadata.sequence).toBe(87963n);
    expect(beacon.metadata.timestamp).toBe(1769179239n);
    expect(beacon.metadata.valueIndex).toBe(0);
    expect(beacon.auditHash).toBe(keccak256(stringToHex(rawBeacon)));
  });

  it("rejects malformed beacon blocks before a transaction can be sent", () => {
    expect(() => parseSpaceComputerBeacon(JSON.stringify({ data: { ctrng: [] } }))).toThrow(
      /data\.ctrng/,
    );
  });
});

describe("fetchLatestSpaceComputerBeacon", () => {
  it("fetches the SpaceComputer IPNS URL at call time with cache bypassing", async () => {
    const beacon = await fetchLatestSpaceComputerBeacon(async (url, init) => {
      expect(url).toMatch(new RegExp(`^${SPACE_COMPUTER_BEACON_URL}\\?tm=\\d+$`));
      expect(init).toEqual({
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async text() {
          return rawBeacon;
        },
      };
    });

    expect(beacon.metadata.sequence).toBe(87963n);
  });
});
