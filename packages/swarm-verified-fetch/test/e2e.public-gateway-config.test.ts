import { describe, expect, it } from "vitest";

import {
  loadConfiguredPublicGatewayFixture,
  publicGatewayFixtureWarning
} from "./public-gateway-fixture.js";
import { logE2e } from "./e2e-output.js";

const publicFixture = await loadConfiguredPublicGatewayFixture();

describe("public gateway e2e configuration", () => {
  it("reports whether live public gateway verification is configured", () => {
    if (!publicFixture) {
      process.stderr.write(`${publicGatewayFixtureWarning()}\n`);
      expect(publicFixture).toBeNull();
      return;
    }

    logE2e("public fixture configured", {
      gateways: publicFixture.gatewayUrls,
      immutableCases: publicFixture.immutable.length,
      feedCases: publicFixture.feed?.length ?? 0,
      manifestCases: publicFixture.manifest.length
    });
    expect(publicFixture).toBeTruthy();
  });
});
