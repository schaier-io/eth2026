import { Box, Text, useApp, useInput } from "ink";
import React, { useState } from "react";
import type { ResolvedConfig } from "../config.js";
import type { LoadedWallet } from "../wallet/loader.js";
import { Dashboard } from "./panels/Dashboard.js";
import { HeartbeatPanel } from "./panels/Heartbeat.js";
import { VoteFlow } from "./panels/VoteFlow.js";
import { WalletPanel } from "./panels/Wallet.js";

type Tab = "dashboard" | "vote" | "heartbeat" | "wallet";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "1.Dashboard" },
  { key: "vote", label: "2.Vote/Reveal" },
  { key: "heartbeat", label: "3.Heartbeat" },
  { key: "wallet", label: "4.Wallet" },
];

export interface AppProps {
  cfg: ResolvedConfig;
  wallet: LoadedWallet;
  vaultPassphrase: string;
}

export function App({ cfg, wallet, vaultPassphrase }: AppProps) {
  const { exit } = useApp();
  const [tab, setTab] = useState<Tab>("dashboard");

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) exit();
    if (input === "1") setTab("dashboard");
    if (input === "2") setTab("vote");
    if (input === "3") setTab("heartbeat");
    if (input === "4") setTab("wallet");
    if (key.tab) {
      const idx = TABS.findIndex((t) => t.key === tab);
      const next = TABS[(idx + 1) % TABS.length];
      if (next) setTab(next.key);
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>TruthMarket Agent</Text>
        <Text color="gray">  {cfg.contractAddress}  ({cfg.chainKey})</Text>
      </Box>
      <Box>
        {TABS.map((t) => (
          <Box key={t.key} marginRight={2}>
            <Text color={tab === t.key ? "green" : "gray"}>{t.label}</Text>
          </Box>
        ))}
        <Text color="gray">  q=quit</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {tab === "dashboard" && <Dashboard cfg={cfg} wallet={wallet} />}
        {tab === "vote" && (
          <VoteFlow cfg={cfg} wallet={wallet} vaultPassphrase={vaultPassphrase} />
        )}
        {tab === "heartbeat" && (
          <HeartbeatPanel cfg={cfg} wallet={wallet} vaultPassphrase={vaultPassphrase} />
        )}
        {tab === "wallet" && <WalletPanel cfg={cfg} wallet={wallet} />}
      </Box>
    </Box>
  );
}
