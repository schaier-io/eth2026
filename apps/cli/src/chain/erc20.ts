import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  maxUint256,
} from "viem";
import { erc20Abi } from "../abi.js";

export async function readDecimals(
  client: PublicClient,
  token: Address,
): Promise<number> {
  return Number(
    await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  );
}

export async function readSymbol(
  client: PublicClient,
  token: Address,
): Promise<string> {
  return (await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "symbol",
  })) as string;
}

export async function readBalance(
  client: PublicClient,
  token: Address,
  owner: Address,
): Promise<bigint> {
  return (await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

export async function readAllowance(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return (await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;
}

export async function writeApprove(
  wallet: WalletClient,
  client: PublicClient,
  token: Address,
  spender: Address,
  amount: bigint = maxUint256,
): Promise<{ txHash: Hex; blockNumber: bigint }> {
  const { request } = await client.simulateContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
    account: wallet.account!,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, blockNumber: receipt.blockNumber };
}

export async function writeTransfer(
  wallet: WalletClient,
  client: PublicClient,
  token: Address,
  to: Address,
  amount: bigint,
): Promise<{ txHash: Hex; blockNumber: bigint }> {
  const { request } = await client.simulateContract({
    address: token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
    account: wallet.account!,
  });
  const txHash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, blockNumber: receipt.blockNumber };
}
