"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";
import { TimeAgo } from "../components/TimeAgo";
import { WalletConnect } from "../components/WalletConnect";
import { SourcifyBadge } from "../components/SourcifyBadge";
import { SwarmBadge } from "../components/SwarmBadge";
import { registryAddress, truthMarketRegistryAbi } from "../../lib/registry";
import { TRUTH_MARKET_CONTRACT_ID, truthMarketAbi } from "../../lib/truthmarket";
import { getMarketDisplayPhase } from "../../lib/market-phase";
import type { ContractVerification } from "../../lib/contract-verification";

const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);

type FieldName =
  | "CONTRACT_ID"
  | "swarmReference"
  | "phase"
  | "outcome"
  | "creatorBond"
  | "bondPosted"
  | "stakeToken"
  | "votingDeadline"
  | "juryCommitDeadline"
  | "revealDeadline"
  | "commitCount";

const FIELDS: readonly FieldName[] = [
  "CONTRACT_ID",
  "swarmReference",
  "phase",
  "outcome",
  "creatorBond",
  "bondPosted",
  "stakeToken",
  "votingDeadline",
  "juryCommitDeadline",
  "revealDeadline",
  "commitCount",
];

interface MarketRow {
  address: Address;
  swarmReference?: `0x${string}`;
  phase?: number;
  outcome?: number;
  creatorBond?: bigint;
  bondPosted?: boolean;
  stakeToken?: Address;
  votingDeadline?: bigint;
  juryCommitDeadline?: bigint;
  revealDeadline?: bigint;
  commitCount?: number;
}

interface ClaimMeta {
  title: string;
  verified: boolean;
  url?: string | null;
  error?: string;
}

export default function MyMarketsPage() {
  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const wrongChain = isConnected && walletChainId !== DEFAULT_CHAIN_ID;
  const [claimMeta, setClaimMeta] = useState<Record<string, ClaimMeta>>({});
  const [verifications, setVerifications] = useState<Record<string, ContractVerification>>({});

  const list = useReadContract({
    address: registryAddress,
    abi: truthMarketRegistryAbi,
    functionName: "marketsByCreatorPaginated",
    args: address ? [address, 0n, 100n] : undefined,
    query: { enabled: Boolean(address) && Boolean(registryAddress), refetchInterval: 8000 },
  });

  const addresses = (list.data as readonly Address[] | undefined) ?? [];

  const reads = useReadContracts({
    contracts: addresses.flatMap((addr) =>
      FIELDS.map((fn) => ({ address: addr, abi: truthMarketAbi, functionName: fn })),
    ),
    query: { enabled: addresses.length > 0, refetchInterval: 8000 },
  });

  const rows = useMemo<MarketRow[]>(() => {
    const data = reads.data as { result?: unknown }[] | undefined;
    return addresses.map((addr, i) => {
      const slice = data?.slice(i * FIELDS.length, (i + 1) * FIELDS.length) ?? [];
      return {
        address: addr,
        swarmReference: slice[1]?.result as `0x${string}` | undefined,
        phase: slice[2]?.result as number | undefined,
        outcome: slice[3]?.result as number | undefined,
        creatorBond: slice[4]?.result as bigint | undefined,
        bondPosted: slice[5]?.result as boolean | undefined,
        stakeToken: slice[6]?.result as Address | undefined,
        votingDeadline: slice[7]?.result as bigint | undefined,
        juryCommitDeadline: slice[8]?.result as bigint | undefined,
        revealDeadline: slice[9]?.result as bigint | undefined,
        commitCount: slice[10]?.result as number | undefined,
      };
    });
  }, [reads.data, addresses]);

  useEffect(() => {
    const pending = rows.filter((row) => row.swarmReference && !claimMeta[row.address.toLowerCase()]);
    if (pending.length === 0) return;

    let cancelled = false;
    Promise.all(
      pending.map(async (row) => {
        try {
          const res = await fetch(`/api/swarm/claim-doc?reference=${encodeURIComponent(row.swarmReference!)}`);
          const body = (await res.json()) as {
            document?: { title?: string } | null;
            verified?: boolean;
            url?: string | null;
            error?: string;
          };
          const title = body.verified && body.document?.title ? body.document.title : "(claim unavailable)";
          return [
            row.address.toLowerCase(),
            { title, verified: Boolean(body.verified), url: body.url, error: body.error },
          ] as const;
        } catch {
          return [
            row.address.toLowerCase(),
            { title: "(claim unavailable)", verified: false, error: "Claim document could not be loaded." },
          ] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setClaimMeta((prev) => {
        const next = { ...prev };
        for (const [market, meta] of entries) next[market] = meta;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [rows, claimMeta]);

  useEffect(() => {
    const pending = rows.filter((row) => !verifications[row.address.toLowerCase()]);
    if (pending.length === 0) return;

    let cancelled = false;
    Promise.all(
      pending.map(async (row) => {
        try {
          const res = await fetch(`/api/sourcify/market-verification?market=${row.address}`);
          if (!res.ok) return undefined;
          const body = (await res.json()) as ContractVerification;
          return [row.address.toLowerCase(), body] as const;
        } catch {
          return undefined;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setVerifications((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [rows, verifications]);

  if (!registryAddress) {
    return (
      <main className="page-shell">
        <section className="empty-state">
          <h1>No registry wired up</h1>
          <p>
            Set <code>NEXT_PUBLIC_REGISTRY_ADDRESS</code> in <code>apps/web/.env</code>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">Your launches</p>
        <h1>Every claim you've put on the line.</h1>
        <p className="page-header-sub">
          Includes drafts still waiting on a bond. Public board hides those — you don't.
        </p>
      </header>

      {!isConnected ? (
        <WalletConnect
          title="Connect to see your launches"
          subtitle="Wallet in, claims appear."
        />
      ) : wrongChain ? (
        <section className="card vote-chain-warn">
          <p>
            Your wallet's on chain <code>{walletChainId}</code>. Reading from chain{" "}
            <code>{DEFAULT_CHAIN_ID}</code>.
          </p>
        </section>
      ) : list.isLoading ? (
        <ul className="markets-grid" aria-busy="true" aria-label="Loading your launches">
          {[0, 1, 2].map((i) => (
            <li key={i} className="market-card skeleton-card">
              <div className="skeleton-line skeleton-line-md" />
              <div className="skeleton-line skeleton-line-sm" />
              <div className="skeleton-line skeleton-line-sm" />
              <div className="skeleton-line skeleton-line-xs" />
            </li>
          ))}
        </ul>
      ) : addresses.length === 0 ? (
        <section className="empty-state">
          <h2>Nothing here yet.</h2>
          <p>
            Put your first claim on the line. <Link href="/deploy">Launch one →</Link>
          </p>
        </section>
      ) : (
        <ul className="markets-grid">
          {rows.map((row) => (
            <MyMarketCard
              key={row.address}
              row={row}
              claim={claimMeta[row.address.toLowerCase()]}
              verification={verifications[row.address.toLowerCase()]}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function MyMarketCard({
  row,
  claim,
  verification,
}: {
  row: MarketRow;
  claim?: ClaimMeta;
  verification?: ContractVerification;
}) {
  const bondPending = (row.creatorBond ?? 0n) > 0n && row.bondPosted === false;
  const display = getMarketDisplayPhase({
    phase: row.phase,
    outcome: row.outcome,
    votingDeadline: row.votingDeadline,
    juryCommitDeadline: row.juryCommitDeadline,
    revealDeadline: row.revealDeadline,
  });

  return (
    <li className={`market-card ${bondPending ? "market-card-pending" : ""}`}>
      <Link href={`/markets/${row.address}`} className="market-card-link">
        <header className="market-card-head">
          <h2 className="market-card-name">{claim?.title ?? "Loading claim..."}</h2>
          <div className="market-card-badges">
            {bondPending ? (
              <span className="phase-pill phase-bond-pending" title="Voters can't commit until you post the bond">
                post your bond
              </span>
            ) : (
              <span className={display.className}>
                {display.label}
                {display.outcomeLabel ? ` · ${display.outcomeLabel}` : ""}
              </span>
            )}
          </div>
        </header>
        <dl className="market-card-meta">
          {bondPending ? (
            <div>
              <dt>Next</dt>
              <dd>
                <strong>Post bond to open voting →</strong>
              </dd>
            </div>
          ) : (
            <div>
              <dt>Commits</dt>
              <dd>{row.commitCount ?? "?"}</dd>
            </div>
          )}
          {display.deadline ? (
            <div>
              <dt>{display.deadline.label}</dt>
              <dd>
                <TimeAgo deadline={display.deadline.epoch} />
              </dd>
            </div>
          ) : row.phase === 2 ? (
            <div>
              <dt>Resolved</dt>
              <dd>
                <span className="muted">final</span>
              </dd>
            </div>
          ) : null}
          {(row.creatorBond ?? 0n) > 0n ? (
            <div>
              <dt>Bond</dt>
              <dd>
                <code>{formatUnits(row.creatorBond ?? 0n, 18)}</code> · {row.bondPosted ? "posted" : "pending"}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="verification-row market-card-verification-row">
          <SwarmBadge verified={claim?.verified} url={claim?.url} error={claim?.error} compact asLink={false} />
          <SourcifyBadge verification={verification} compact asLink={false} />
        </div>
      </Link>
    </li>
  );
}
