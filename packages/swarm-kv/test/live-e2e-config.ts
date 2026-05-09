export const PUBLIC_SWARM_TESTNET_UPLOAD_GATEWAY_URL = "https://api.gateway.testnet.ethswarm.org";
export const PUBLIC_SWARM_TESTNET_DUMMY_POSTAGE_BATCH_ID = "0".repeat(64);

export interface LiveSwarmE2eConfig {
  beeApiUrl: string | undefined;
  gatewayUrl: string | undefined;
  postageBatchId: string | undefined;
  missingConfig: string[];
  hasConfig: boolean;
  usingPublicGatewayFallback: boolean;
  shouldCheckPostageBatch: boolean;
}

export function resolveLiveSwarmE2eConfig(): LiveSwarmE2eConfig {
  const configuredBeeApiUrl = normalizeOptionalUrl(
    process.env["SWARM_KV_BEE_API_URL"] ?? process.env["SWARM_E2E_BEE_API_URL"]
  );
  const configuredGatewayUrl = normalizeOptionalUrl(process.env["SWARM_E2E_GATEWAY_URL"]);
  const usingPublicGatewayFallback = !configuredBeeApiUrl;
  const beeApiUrl = configuredBeeApiUrl ?? PUBLIC_SWARM_TESTNET_UPLOAD_GATEWAY_URL;
  const gatewayUrl = configuredGatewayUrl ?? beeApiUrl;
  const postageBatchId =
    process.env["SWARM_POSTAGE_BATCH_ID"] ??
    (usingPublicGatewayFallback ? PUBLIC_SWARM_TESTNET_DUMMY_POSTAGE_BATCH_ID : undefined);
  const missingConfig = [
    beeApiUrl ? null : "SWARM_KV_BEE_API_URL or SWARM_E2E_BEE_API_URL",
    postageBatchId ? null : "SWARM_POSTAGE_BATCH_ID"
  ].filter((value): value is string => Boolean(value));

  return {
    beeApiUrl,
    gatewayUrl,
    postageBatchId,
    missingConfig,
    hasConfig: Boolean(beeApiUrl && gatewayUrl && postageBatchId),
    usingPublicGatewayFallback,
    shouldCheckPostageBatch: !usingPublicGatewayFallback
  };
}

function normalizeOptionalUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return new URL(value).toString().replace(/\/$/, "");
}
