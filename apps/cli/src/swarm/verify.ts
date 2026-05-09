import { readFile } from "node:fs/promises";
import {
  type Hex,
  type PublicClient,
  bytesToHex,
  keccak256,
} from "viem";
import { truthMarketAbi } from "../abi.js";
import type { ResolvedConfig } from "../config.js";

export async function readIpfsHash(
  client: PublicClient,
  cfg: ResolvedConfig,
): Promise<Hex> {
  return (await client.readContract({
    address: cfg.contractAddress,
    abi: truthMarketAbi,
    functionName: "ipfsHash",
  })) as Hex;
}

/**
 * Compare keccak256(document) against the on-chain `ipfsHash` bytes.
 *
 * LIMITATION: this only matches deployments that store the raw keccak as
 * their `ipfsHash`. For CID/multihash deployments the comparison will fail
 * for any document — multihash decoding is not implemented yet. The default
 * policy keeps `requireSwarmVerification: false` for that reason; flip it
 * once the verifier matches your deployment's reference format.
 */
export async function verifyLocalDocument(
  expectedIpfsHash: Hex,
  documentPath: string,
): Promise<{ match: boolean; expected: Hex; computed: Hex }> {
  const buf = await readFile(documentPath);
  const computed = keccak256(bytesToHex(new Uint8Array(buf)));
  return {
    match: computed.toLowerCase() === expectedIpfsHash.toLowerCase(),
    expected: expectedIpfsHash,
    computed,
  };
}
