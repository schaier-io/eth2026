import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import React, { useEffect, useMemo, useState } from "react";
import { writeRevealVote } from "../../chain/contract.js";
import { makePublicClient, makeWalletClient } from "../../chain/client.js";
import { commitVoteCore } from "../../commands/vote-core.js";
import type { ResolvedConfig } from "../../config.js";
import { type Policy, loadPolicy } from "../../policy/policy.js";
import { loadVaultEntry } from "../../vault/vault.js";
import type { LoadedWallet } from "../../wallet/loader.js";

type Step =
  | { kind: "menu" }
  | { kind: "commit-vote" }
  | { kind: "commit-stake"; vote: 1 | 2 }
  | { kind: "committing"; vote: 1 | 2; stake: bigint }
  | { kind: "result"; ok: boolean; message: string }
  | { kind: "revealing" };

const choices = [
  { label: "Commit a new vote", value: "commit" },
  { label: "Reveal an existing commit (from local vault)", value: "reveal" },
];

const voteChoices = [
  { label: "YES", value: "1" },
  { label: "NO", value: "2" },
];

export function VoteFlow({
  cfg,
  wallet,
  vaultPassphrase,
}: {
  cfg: ResolvedConfig;
  wallet: LoadedWallet;
  vaultPassphrase: string;
}) {
  const [step, setStep] = useState<Step>({ kind: "menu" });
  const [stakeText, setStakeText] = useState("");
  const [policy, setPolicy] = useState<Policy | null>(null);
  const publicClient = useMemo(() => makePublicClient(cfg), [cfg]);
  const walletClient = useMemo(
    () => makeWalletClient(cfg, wallet.account),
    [cfg, wallet.account],
  );

  useEffect(() => {
    loadPolicy(cfg).then(setPolicy).catch(() => setPolicy(null));
  }, [cfg]);

  useInput((input, key) => {
    if (key.escape && step.kind !== "menu") {
      setStep({ kind: "menu" });
      setStakeText("");
    }
  });

  if (step.kind === "menu") {
    return (
      <Box flexDirection="column">
        <Text bold>Vote Flow</Text>
        <SelectInput
          items={choices}
          onSelect={(item) => {
            if (item.value === "commit") setStep({ kind: "commit-vote" });
            else doReveal();
          }}
        />
        <Text color="gray">esc returns to menu</Text>
      </Box>
    );
  }

  if (step.kind === "commit-vote") {
    return (
      <Box flexDirection="column">
        <Text>Choose a vote:</Text>
        <SelectInput
          items={voteChoices}
          onSelect={(item) =>
            setStep({ kind: "commit-stake", vote: Number(item.value) as 1 | 2 })
          }
        />
      </Box>
    );
  }

  if (step.kind === "commit-stake") {
    return (
      <Box flexDirection="column">
        <Text>Stake amount (token base units, e.g. 1000000000000000000):</Text>
        <TextInput
          value={stakeText}
          onChange={setStakeText}
          onSubmit={() => {
            try {
              const stake = BigInt(stakeText);
              if (stake <= 0n) throw new Error("stake must be > 0");
              setStep({ kind: "committing", vote: step.vote, stake });
              doCommit(step.vote, stake);
            } catch (e) {
              setStep({ kind: "result", ok: false, message: (e as Error).message });
            }
          }}
        />
      </Box>
    );
  }

  if (step.kind === "committing") {
    return (
      <Text>
        committing vote={step.vote} stake={step.stake.toString()} …
      </Text>
    );
  }

  if (step.kind === "revealing") {
    return <Text>revealing…</Text>;
  }

  if (step.kind === "result") {
    return (
      <Box flexDirection="column">
        <Text color={step.ok ? "green" : "red"}>{step.message}</Text>
        <Text color="gray">esc returns to menu</Text>
      </Box>
    );
  }

  return null;

  async function doCommit(vote: 1 | 2, stake: bigint) {
    if (!policy) {
      setStep({ kind: "result", ok: false, message: "policy not loaded yet — try again in a moment" });
      return;
    }
    try {
      const r = await commitVoteCore({
        cfg,
        publicClient,
        walletClient,
        account: wallet.account,
        policy,
        vote,
        stake,
        vaultPassphrase,
        // TUI does not currently surface a --document picker; users that need
        // requireSwarmVerification: true should use the CLI command.
      });
      setStep({
        kind: "result",
        ok: true,
        message: `committed: tx=${r.txHash}\nvault=${r.vaultPath}`,
      });
    } catch (e) {
      setStep({ kind: "result", ok: false, message: (e as Error).message });
    }
  }

  async function doReveal() {
    setStep({ kind: "revealing" });
    try {
      const entry = await loadVaultEntry(cfg, wallet.account.address, vaultPassphrase);
      if (!entry) {
        setStep({
          kind: "result",
          ok: false,
          message: `no vault entry for ${wallet.account.address}`,
        });
        return;
      }
      const tx = await writeRevealVote(walletClient, publicClient, cfg, {
        vote: entry.vote,
        nonce: entry.nonce,
      });
      setStep({
        kind: "result",
        ok: true,
        message: `revealed vote=${entry.vote} tx=${tx.txHash}`,
      });
    } catch (e) {
      setStep({ kind: "result", ok: false, message: (e as Error).message });
    }
  }
}
