"use client";

import { useEffect, useRef, useState } from "react";
import { formatEther, type Address } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useChains,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { WalletConnect } from "./WalletConnect";

const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);

export function WalletPill() {
  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const chains = useChains();
  const balance = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isConnected || !address) {
    return (
      <div className="wallet-pill-wrap" ref={ref}>
        <button
          type="button"
          className="wallet-pill wallet-pill-cta"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <span className="wallet-pill-cta-label-full">Connect wallet</span>
          <span className="wallet-pill-cta-label-short">Connect</span>
        </button>
        {open ? (
          <div className="wallet-popover" role="dialog" aria-label="Connect a wallet">
            <WalletConnect variant="inline" />
          </div>
        ) : null}
      </div>
    );
  }

  const wrongChain = walletChainId !== TARGET_CHAIN_ID;
  const targetChain = chains.find((c) => c.id === TARGET_CHAIN_ID);

  function copyAddress() {
    if (!address) return;
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="wallet-pill-wrap" ref={ref}>
      <button
        type="button"
        className={`wallet-pill ${wrongChain ? "wallet-pill-warn" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span
          className="wallet-pill-avatar"
          aria-hidden="true"
          style={{ background: avatarGradient(address) }}
        />
        <span className="wallet-pill-text">
          <span className="wallet-pill-addr">{shortAddress(address)}</span>
          {wrongChain ? (
            <span className="wallet-pill-meta wallet-pill-meta-warn">wrong chain</span>
          ) : balance.data ? (
            <span className="wallet-pill-meta">{formatBalance(balance.data.value)} ETH</span>
          ) : null}
        </span>
        <span className="wallet-pill-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="wallet-popover wallet-popover-menu" role="menu" aria-label="Wallet menu">
          <div className="wallet-menu-row wallet-menu-row-addr">
            <code title={address}>{address}</code>
            <button type="button" className="wallet-menu-copy" onClick={copyAddress}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          {wrongChain && targetChain ? (
            <button
              type="button"
              className="wallet-menu-action wallet-menu-action-warn"
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
              disabled={isSwitching}
            >
              {isSwitching ? "Switching…" : `Switch to ${targetChain.name}`}
            </button>
          ) : null}
          <button
            type="button"
            className="wallet-menu-action"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}

function shortAddress(addr: Address): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatBalance(wei: bigint): string {
  const eth = Number(formatEther(wei));
  if (eth === 0) return "0";
  if (eth < 0.0001) return "<0.0001";
  return eth.toFixed(eth < 1 ? 4 : 2);
}

/** Deterministic 2-stop gradient derived from the address — matches across all
 *  wallet UIs and acts as a recognizable identicon-lite. */
function avatarGradient(addr: Address): string {
  const a = parseInt(addr.slice(2, 8), 16);
  const b = parseInt(addr.slice(-6), 16);
  const h1 = a % 360;
  const h2 = b % 360;
  return `linear-gradient(135deg, hsl(${h1} 70% 60%), hsl(${h2} 70% 50%))`;
}
