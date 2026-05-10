"use client";

import { useConnect, type Connector } from "wagmi";
import { WalletIcon, type WalletKind } from "./WalletIcon";

interface Props {
  /** Optional headline. Defaults to "Connect a wallet". */
  title?: string;
  /** Optional sub-line shown under the headline. */
  subtitle?: string;
  /** Compact variant uses smaller chips with no headline. */
  variant?: "card" | "inline";
}

export function WalletConnect({ title, subtitle, variant = "card" }: Props) {
  const { connectors, connect, isPending, variables } = useConnect();
  const visibleConnectors = dedupeConnectors(connectors);

  if (variant === "inline") {
    return (
      <div className="wallet-connect-inline">
        {visibleConnectors.map((c) => (
          <ConnectorButton
            key={c.uid}
            connector={c}
            onSelect={() => connect({ connector: c })}
            isPending={isPending && variables?.connector === c}
            disabled={isPending}
            compact
          />
        ))}
      </div>
    );
  }

  return (
    <section className="wallet-connect-card">
      <header>
        <h3>{title ?? "Pick a wallet"}</h3>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </header>
      <div className="wallet-connect-list">
        {visibleConnectors.map((c) => (
          <ConnectorButton
            key={c.uid}
            connector={c}
            onSelect={() => connect({ connector: c })}
            isPending={isPending && variables?.connector === c}
            disabled={isPending}
          />
        ))}
      </div>
    </section>
  );
}

function ConnectorButton({
  connector,
  onSelect,
  isPending,
  disabled,
  compact,
}: {
  connector: Connector;
  onSelect: () => void;
  isPending: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const meta = connectorMeta(connector);
  return (
    <button
      type="button"
      className={`wallet-connector${compact ? " is-compact" : ""}${isPending ? " is-pending" : ""}`}
      onClick={onSelect}
      disabled={disabled}
    >
      <span className="wallet-connector-icon" aria-hidden="true" style={{ background: meta.color }}>
        {meta.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.iconUrl} alt="" width={compact ? 20 : 24} height={compact ? 20 : 24} />
        ) : meta.kind ? (
          <WalletIcon kind={meta.kind} size={compact ? 22 : 28} />
        ) : (
          meta.initials
        )}
      </span>
      <span className="wallet-connector-body">
        <span className="wallet-connector-name">{connector.name}</span>
        {!compact ? <span className="wallet-connector-hint">{meta.hint}</span> : null}
      </span>
      {isPending ? <span className="wallet-connector-spinner" aria-hidden="true" /> : null}
    </button>
  );
}

interface ConnectorMeta {
  initials: string;
  color: string;
  hint: string;
  iconUrl?: string;
  /** Inline-SVG icon kind. Takes precedence over `initials`; falls back to it. */
  kind?: WalletKind;
}

function connectorMeta(c: Connector): ConnectorMeta {
  const id = c.id?.toLowerCase() ?? "";
  const name = c.name ?? "";
  const iconUrl = (c as Connector & { icon?: string }).icon;

  if (id === "metamasksdk" || id === "metamask" || /metamask/i.test(name)) {
    return {
      initials: "MM",
      color: "transparent",
      hint: "Extension on desktop · app deep-link on mobile",
      iconUrl,
      kind: "metamask",
    };
  }
  if (id === "coinbasewalletsdk" || id === "coinbasewallet" || /coinbase/i.test(name)) {
    return {
      initials: "CB",
      color: "transparent",
      hint: "Smart wallet, extension, or mobile app",
      iconUrl,
      kind: "coinbase",
    };
  }
  if (id === "walletconnect" || /walletconnect/i.test(name)) {
    return {
      initials: "WC",
      color: "transparent",
      hint: "Scan from any of 300+ mobile wallets",
      iconUrl,
      kind: "walletconnect",
    };
  }
  if (id === "safe" || /safe/i.test(name)) {
    return {
      initials: "SF",
      color: "transparent",
      hint: "Safe multisig",
      iconUrl,
      kind: "safe",
    };
  }
  if (id === "injected") {
    return {
      initials: initialsOf(name || "Browser wallet"),
      color: "transparent",
      hint: "Other browser extension (Rabby, Frame, …)",
      iconUrl,
      kind: "injected",
    };
  }
  return {
    initials: initialsOf(name || "?"),
    color: "transparent",
    hint: "External wallet",
    iconUrl,
    kind: "generic",
  };
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Hide duplicate "Injected" entries some wagmi setups produce. */
function dedupeConnectors(list: readonly Connector[]): Connector[] {
  const seen = new Set<string>();
  const out: Connector[] = [];
  for (const c of list) {
    const key = (c.id ?? c.name ?? "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
