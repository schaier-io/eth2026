import { Box, Text } from "ink";
import React, { useMemo } from "react";
import { formatEther, formatUnits } from "viem";
import { makePublicClient } from "../../chain/client.js";
import { readStakeToken } from "../../chain/contract.js";
import { readAllowance, readBalance, readDecimals, readSymbol } from "../../chain/erc20.js";
import type { ResolvedConfig } from "../../config.js";
import { listVaultEntries } from "../../vault/vault.js";
import type { LoadedWallet } from "../../wallet/loader.js";
import { usePoll } from "../hooks/usePoll.js";

export function WalletPanel({ cfg, wallet }: { cfg: ResolvedConfig; wallet: LoadedWallet }) {
  const client = useMemo(() => makePublicClient(cfg), [cfg]);

  const { data, error } = usePoll(async () => {
    const stakeToken = await readStakeToken(client, cfg);
    const [eth, sym, dec, bal, allowance] = await Promise.all([
      client.getBalance({ address: wallet.account.address }),
      readSymbol(client, stakeToken),
      readDecimals(client, stakeToken),
      readBalance(client, stakeToken, wallet.account.address),
      readAllowance(client, stakeToken, wallet.account.address, cfg.contractAddress),
    ]);
    const vault = await listVaultEntries(cfg);
    return { stakeToken, sym, dec, bal, allowance, eth, vault };
  }, 7000);

  if (error) return <Text color="red">error: {error}</Text>;
  if (!data) return <Text>loading…</Text>;

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>address:</Text> {wallet.account.address} <Text color="gray">({wallet.source})</Text>
      </Text>
      <Text>
        <Text bold>chain:</Text> {cfg.chainKey} ({cfg.chain.id})
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>ETH:        {formatEther(data.eth)} ({data.eth.toString()} wei)</Text>
        <Text>{data.sym}: {formatUnits(data.bal, data.dec)} ({data.bal.toString()} base)</Text>
        <Text>allowance:  {formatUnits(data.allowance, data.dec)} ({data.allowance.toString()})</Text>
        <Text color="gray">stake token: {data.stakeToken}</Text>
        <Text color="gray">spender:     {cfg.contractAddress}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Vault ({data.vault.length})</Text>
        {data.vault.length === 0 && <Text color="gray">(no entries)</Text>}
        {data.vault.map((v) => (
          <Text key={v.path} color={v.voter.toLowerCase() === wallet.account.address.toLowerCase() ? undefined : "gray"}>
            chain={v.chainId} market={v.market.slice(0, 10)}… voter={v.voter.slice(0, 10)}…
          </Text>
        ))}
      </Box>
    </Box>
  );
}
