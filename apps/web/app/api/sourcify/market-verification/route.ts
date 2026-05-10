import { isAddress, type Address } from "viem";
import { getChainId, getPublicClient } from "../../../../lib/server/viem";
import { readRegistryImplementation, verifyMarketCloneContract } from "../../../../lib/server/sourcify";

export const revalidate = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market");
  if (!market || !isAddress(market)) {
    return Response.json({ error: "market must be a valid address" }, { status: 400 });
  }

  const client = getPublicClient();
  const chainId = getChainId();
  const implementation = await readRegistryImplementation(client);
  const verification = await verifyMarketCloneContract({
    client,
    chainId,
    market: market as Address,
    implementation,
  });

  return Response.json(verification);
}

