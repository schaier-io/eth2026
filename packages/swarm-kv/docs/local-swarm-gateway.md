# Local Swarm Gateway Setup

This guide sets up a local Swarm HTTP endpoint for `@truth-market/swarm-kv` development.

For this package, "gateway" means the HTTP endpoint the client can call for `/bzz`, `/bytes`, and related Bee APIs. For production public access, put a managed Swarm Gateway in front of Bee rather than exposing the raw Bee API.

## Source Docs

- Swarm Docker install: https://docs.ethswarm.org/docs/bee/installation/docker/
- Bee API safety and port `1633`: https://docs.ethswarm.org/docs/bee/working-with-bee/bee-api/
- Bee configuration, CORS, and node modes: https://docs.ethswarm.org/docs/bee/working-with-bee/configuration/
- Bee developer mode: https://docs.ethswarm.org/docs/develop/tools-and-features/bee-dev-mode/
- Upload and download flow: https://docs.ethswarm.org/docs/develop/upload-and-download/
- Gateway overview: https://docs.ethswarm.org/docs/develop/tools-and-features/gateway-proxy/

## Pick A Mode

Use `bee-dev` when you want fast local package research with no real xDAI, no xBZZ, no postage cost, and no persistence.

Use `bee-light` when you want a real network-connected local Bee endpoint that can upload and download from Swarm. This needs a funded Gnosis Chain address and postage stamps.

Use `bee-testnet` when you want a real network-connected Sepolia testnet Bee endpoint. This needs Sepolia ETH for gas and sBZZ for postage/storage, but no real xDAI or xBZZ.

Do not expose Bee API port `1633` to the public internet. The raw Bee API can control the node. Keep it bound to `127.0.0.1` for local development.

The Compose file pins `ethersphere/bee:2.6.0` because the official Docker guide recommends exact image tags. Check Docker Hub before longer-lived work and update the tag when Swarm publishes a newer full release.

## Dev Mode Gateway

This is the fastest path for package prototyping. Bee dev mode runs the usual HTTP endpoints with mocked volatile backends, so data disappears when the container stops. The Bee CLI currently marks dev mode as a development feature, so use it for local research only.

From the repository root:

```sh
docker compose \
  -f packages/swarm-kv/docker-compose.swarm.yml \
  --profile dev \
  up bee-dev
```

In another terminal, check the endpoint:

```sh
curl -s http://localhost:1633/health
curl -s http://localhost:1633/node
```

Configure the package against the local gateway:

```sh
SWARM_KV_BEE_API_URL=http://localhost:1633
SWARM_KV_GATEWAY_URL=http://localhost:1633
```

For browser app research, add the dev server origin to `BEE_CORS_ALLOWED_ORIGINS` if it is not one of the defaults in the Compose file.

Stop it with:

```sh
docker compose \
  -f packages/swarm-kv/docker-compose.swarm.yml \
  --profile dev \
  down
```

## Sepolia Testnet Gateway

This is the recommended mode when you want to exercise real Bee blockchain/postage behavior without spending real Swarm funds.

Copy the testnet environment:

```sh
cp packages/swarm-kv/.env.swarm.testnet.example packages/swarm-kv/.env.swarm
```

Edit `packages/swarm-kv/.env.swarm` and set:

- `BEE_PASSWORD`: a long local keystore password.
- `BEE_SEPOLIA_RPC_ENDPOINT`: a Sepolia RPC URL. The example uses PublicNode because it is a public Sepolia endpoint; an Infura or Alchemy Sepolia endpoint is also fine.
- `BEE_CORS_ALLOWED_ORIGINS`: the browser dev origins allowed to call Bee.

Start the testnet node:

```sh
docker compose \
  --env-file packages/swarm-kv/.env.swarm \
  -f packages/swarm-kv/docker-compose.swarm.yml \
  --profile testnet \
  up -d bee-testnet
```

Watch logs:

```sh
docker compose \
  --env-file packages/swarm-kv/.env.swarm \
  -f packages/swarm-kv/docker-compose.swarm.yml \
  --profile testnet \
  logs -f bee-testnet
```

Find the Bee wallet address. If the API is reachable:

```sh
curl -s http://localhost:1633/addresses | jq .ethereum
```

If the API is not ready yet, copy the `using ethereum address` value from the logs.

Fund that address on Sepolia with:

- Sepolia ETH for gas. The Swarm docs suggest a small amount such as `0.01` sETH to get started.
- Sepolia BZZ (`sBZZ`) for postage/storage. The Swarm docs point to buying it on Uniswap with Sepolia selected and testnet mode enabled.

The Sepolia sBZZ token address from the Swarm token docs is:

```text
0x543dDb01Ba47acB11de34891cD86B675F04840db
```

After funding, restart the node so Bee can deploy/check its chequebook and sync postage contract data:

```sh
docker compose \
  --env-file packages/swarm-kv/.env.swarm \
  -f packages/swarm-kv/docker-compose.swarm.yml \
  --profile testnet \
  restart bee-testnet
```

Check readiness:

```sh
curl -s http://localhost:1633/health
curl -s http://localhost:1633/status
curl -s http://localhost:1633/node
```

## Networked Local Gateway

This runs a light Bee node through Docker. A light node is enough for normal upload/download development, while avoiding the heavier full-node storage-incentive setup.

Copy the example environment:

```sh
cp packages/swarm-kv/.env.swarm.example packages/swarm-kv/.env.swarm
```

Edit `packages/swarm-kv/.env.swarm` and set:

- `BEE_PASSWORD`: a long local keystore password.
- `BEE_BLOCKCHAIN_RPC_ENDPOINT`: a Gnosis Chain RPC endpoint.
- `BEE_CORS_ALLOWED_ORIGINS`: the browser dev origins allowed to call Bee.

Start the node:

```sh
docker compose \
  --env-file packages/swarm-kv/.env.swarm \
  -f packages/swarm-kv/docker-compose.swarm.yml \
  --profile network \
  up -d bee-light
```

Inspect logs and copy the node's Gnosis Chain address:

```sh
docker compose \
  --env-file packages/swarm-kv/.env.swarm \
  -f packages/swarm-kv/docker-compose.swarm.yml \
  --profile network \
  logs -f bee-light
```

Fund that address with:

- a small amount of xDAI for gas;
- enough xBZZ to buy postage batches for uploads.

Check readiness:

```sh
curl -s http://localhost:1633/health
curl -s http://localhost:1633/status
```

## Buy A Postage Batch

Uploads require postage. For application code, prefer `bee-js` or `swarm-cli` because they can buy storage using size and duration abstractions. Raw Bee API calls require lower-level `amount` and `depth` parameters.

With raw HTTP:

```sh
curl -s -X POST http://localhost:1633/stamps/<amount>/<depth>
```

Save the returned `batchID` in `SWARM_POSTAGE_BATCH_ID`.

## Run Swarm KV E2E Tests

From `packages/swarm-kv`, `pnpm test:e2e` uses Swarm's public testnet upload gateway when no local Bee node is configured:

```sh
pnpm test:e2e
```

That fallback publishes through `https://api.gateway.testnet.ethswarm.org`, does not call `/stamps`, and does not require a local postage batch. Use it for quick live gateway verification when you do not need to exercise local Bee funding or postage behavior.

The public gateway may return gzipped Bee API JSON without a `Content-Encoding` header. The KV client auto-decodes that by default. Set `decodeGzippedBeeJson: false` in `createSwarmKvStore` only when you want strict plain-JSON responses from your own gateway.

To force the suite to use your local Bee node, point it at the Bee API and postage batch:

```sh
SWARM_KV_BEE_API_URL=http://localhost:1633 \
SWARM_POSTAGE_BATCH_ID=$SWARM_POSTAGE_BATCH_ID \
pnpm test:e2e
```

Use `SWARM_E2E_GATEWAY_URL` only when reads should verify through a different gateway than the Bee API that publishes writes:

```sh
SWARM_KV_BEE_API_URL=http://localhost:1633 \
SWARM_E2E_GATEWAY_URL=https://api.gateway.testnet.ethswarm.org \
SWARM_POSTAGE_BATCH_ID=$SWARM_POSTAGE_BATCH_ID \
pnpm test:e2e
```

The suite writes registry verifier references to `.e2e/live-registry-references.json` by default. Override that path with `SWARM_E2E_REGISTRY_FIXTURE=/path/to/live-registry-references.json` when coordinating with the sibling verifier package.

If `SWARM_KV_BEE_API_URL` is set but `SWARM_POSTAGE_BATCH_ID` is missing, the local Bee suites skip and print the exact variable needed to enable them.

## Smoke Test Upload And Download

Create a small immutable claim/rules-style payload:

```sh
printf '%s\n' '{"title":"Local Swarm smoke test","resolutionRules":"Selected jurors resolve belief under the immutable claim/rules document."}' > /tmp/truthmarket-claim-rules.json
```

Upload it:

```sh
curl -s -X POST \
  -H "Swarm-Postage-Batch-Id: $SWARM_POSTAGE_BATCH_ID" \
  -H "Content-Type: application/json" \
  --data-binary "@/tmp/truthmarket-claim-rules.json" \
  "http://localhost:1633/bzz?name=claim-rules.json"
```

Download it by reference:

```sh
curl -s "http://localhost:1633/bzz/<REFERENCE>" | jq
```

For browser reads, use:

```ts
import { createSwarmKvStore } from "@truth-market/swarm-kv";

const store = createSwarmKvStore({
  gatewayUrl: "http://localhost:1633"
});
```

For Node writes, use:

```ts
import { createSwarmKvStore, fixedPostage } from "@truth-market/swarm-kv";

const store = createSwarmKvStore({
  beeApiUrl: "http://localhost:1633",
  gatewayUrl: "http://localhost:1633",
  postage: fixedPostage(process.env.SWARM_POSTAGE_BATCH_ID!)
});
```

## Public Gateway Notes

The official docs describe Swarm Gateway as the standard public HTTP access layer in front of Bee. Gateway Proxy is still documented, but the docs say it is set for deprecation and recommend Swarm Gateway unless a specific Gateway Proxy feature is needed.

For local package development, keep the raw Bee endpoint private and local. For any public deployment:

- terminate TLS in front of the gateway;
- keep Bee API `1633` firewalled from the public internet;
- restrict uploads or require authentication;
- account for legal and bandwidth risk when serving arbitrary Swarm content.

## Cleanup

Stop the networked node without deleting the persisted volume:

```sh
docker compose \
  --env-file packages/swarm-kv/.env.swarm \
  -f packages/swarm-kv/docker-compose.swarm.yml \
  --profile network \
  down
```

Delete the persisted local Bee data only if you are sure you no longer need the node keys:

```sh
docker compose \
  --env-file packages/swarm-kv/.env.swarm \
  -f packages/swarm-kv/docker-compose.swarm.yml \
  --profile network \
  down --volumes
```
