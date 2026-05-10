import Link from "next/link";
import type { Address, Hex } from "viem";
import { TimeAgo } from "./components/TimeAgo";
import { SourcifyBadge } from "./components/SourcifyBadge";
import { SwarmBadge } from "./components/SwarmBadge";
import { truthMarketRegistryAbi, registryAddress } from "../lib/registry";
import { truthMarketAbi, TRUTH_MARKET_CONTRACT_ID } from "../lib/truthmarket";
import { getChainId, getPublicClient } from "../lib/server/viem";
import { loadClaimDocument } from "../lib/server/swarm-claim";
import {
  lookupSourcifyMatch,
  readRegistryImplementation,
  verifyMarketCloneContract,
} from "../lib/server/sourcify";
import {
  acceptsRegistryCloneVerification,
  type ContractVerification,
} from "../lib/contract-verification";

export const revalidate = 10;

const PHASE_LABEL = ["Voting", "Reveal", "Resolved"] as const;
const OUTCOME_LABEL = ["Unresolved", "YES", "NO", "Invalid"] as const;

type SearchParams = Promise<{ page?: string; size?: string }>;

function parseInt32(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface MarketRow {
  address: Address;
  contractId: `0x${string}` | undefined;
  contractVersion: number | undefined;
  title: string | undefined;
  claimVerified: boolean | undefined;
  claimUrl: string | null | undefined;
  claimError: string | undefined;
  phase: number | undefined;
  outcome: number | undefined;
  votingDeadline: bigint | undefined;
  revealDeadline: bigint | undefined;
  commitCount: number | undefined;
  targetJurySize: number | undefined;
  creatorBond: bigint | undefined;
  bondPosted: boolean | undefined;
  contractVerification?: ContractVerification;
}

async function loadMarkets(opts: { offset: bigint; limit: bigint }): Promise<{
  total: bigint;
  rows: MarketRow[];
}> {
  if (!registryAddress) return { total: 0n, rows: [] };
  const client = getPublicClient();
  const chainId = getChainId();

  const [total, addresses, implementation] = await Promise.all([
    client.readContract({ address: registryAddress, abi: truthMarketRegistryAbi, functionName: "totalMarkets" }) as Promise<bigint>,
    client.readContract({
      address: registryAddress,
      abi: truthMarketRegistryAbi,
      functionName: "marketsPaginated",
      args: [opts.offset, opts.limit],
    }) as Promise<readonly Address[]>,
    readRegistryImplementation(client),
  ]);

  if (addresses.length === 0) return { total, rows: [] };
  const implementationSourcify = implementation
    ? await lookupSourcifyMatch(chainId, implementation)
    : undefined;

  const rows = await Promise.all(
    addresses.map(async (addr): Promise<MarketRow> => {
      const safe = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
        try {
          return await fn();
        } catch {
          return undefined;
        }
      };
      // CONTRACT_ID + CONTRACT_VERSION first — anything that doesn't respond with
      // the expected TruthMarket id is a foreign registration; skip the rest of
      // the metadata fetch.
      const [contractId, contractVersion] = await Promise.all([
        safe<`0x${string}`>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "CONTRACT_ID" }) as Promise<`0x${string}`>),
        safe<number>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "CONTRACT_VERSION" }) as Promise<number>),
      ]);
      if (contractId !== TRUTH_MARKET_CONTRACT_ID) {
        return {
          address: addr,
          contractId,
          contractVersion,
          title: undefined,
          phase: undefined,
          outcome: undefined,
          votingDeadline: undefined,
          revealDeadline: undefined,
          commitCount: undefined,
          targetJurySize: undefined,
          creatorBond: undefined,
          bondPosted: undefined,
          contractVerification: undefined,
          claimVerified: undefined,
          claimUrl: undefined,
          claimError: undefined,
        };
      }
      const [swarmReference, phase, outcome, votingDeadline, revealDeadline, commitCount, targetJurySize, creatorBond, bondPosted, contractVerification] = await Promise.all([
        safe<Hex>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "swarmReference" }) as Promise<Hex>),
        safe<number>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "phase" }) as Promise<number>),
        safe<number>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "outcome" }) as Promise<number>),
        safe<bigint>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "votingDeadline" }) as Promise<bigint>),
        safe<bigint>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "revealDeadline" }) as Promise<bigint>),
        safe<number>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "commitCount" }) as Promise<number>),
        safe<number>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "targetJurySize" }) as Promise<number>),
        safe<bigint>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "creatorBond" }) as Promise<bigint>),
        safe<boolean>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "bondPosted" }) as Promise<boolean>),
        verifyMarketCloneContract({ client, chainId, market: addr, implementation, implementationSourcify }),
      ]);
      const claim = await loadClaimDocument(swarmReference);
      return {
        address: addr,
        contractId,
        contractVersion,
        title: claim.document?.title,
        claimVerified: claim.verified,
        claimUrl: claim.url,
        claimError: claim.error,
        phase,
        outcome,
        votingDeadline,
        revealDeadline,
        commitCount,
        targetJurySize,
        creatorBond,
        bondPosted,
        contractVerification,
      };
    }),
  );

  return { total, rows };
}

function nextDeadline(row: MarketRow): { label: string; epoch: number } | null {
  const phase = row.phase ?? 0;
  if (phase === 0 && row.votingDeadline) return { label: "Voting ends", epoch: Number(row.votingDeadline) };
  if (phase === 1 && row.revealDeadline) return { label: "Reveal ends", epoch: Number(row.revealDeadline) };
  return null;
}

function PhasePill({ phase, outcome }: { phase: number | undefined; outcome: number | undefined }) {
  const label = PHASE_LABEL[phase ?? 0] ?? "Unknown";
  if (phase === 2 && outcome && outcome > 0) {
    const out = OUTCOME_LABEL[outcome] ?? "?";
    const variant =
      outcome === 1 ? "phase-resolved-yes" : outcome === 2 ? "phase-resolved-no" : "phase-resolved-invalid";
    return (
      <span className={`phase-pill ${variant}`}>
        Resolved · {out}
      </span>
    );
  }
  const cls = phase === 0 ? "phase-pill phase-voting" : phase === 1 ? "phase-pill phase-reveal" : "phase-pill phase-resolved";
  return <span className={cls}>{label}</span>;
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = parseInt32(sp.page, 1);
  const size = Math.min(parseInt32(sp.size, 20), 100);

  if (!registryAddress) {
    return (
      <main className="page-shell">
        <section className="empty-state">
          <h1>No registry wired up</h1>
          <p>
            Set <code>NEXT_PUBLIC_REGISTRY_ADDRESS</code> in <code>apps/web/.env</code>, then reload.
          </p>
          <p className="empty-state-hint">
            Local dev? <code>make anvil</code>, deploy a registry via the CLI, point this app at it.
          </p>
        </section>
      </main>
    );
  }

  const offset = BigInt((page - 1) * size);
  const { total, rows } = await loadMarkets({ offset, limit: BigInt(size) });
  const totalPages = total === 0n ? 1 : Math.ceil(Number(total) / size);

  // Public list hides:
  //   - foreign contracts (CONTRACT_ID mismatch)
  //   - TruthMarkets where the creator declared a bond but hasn't posted it yet
  //     (voters can't commit on these — surfacing them confuses people).
  // Creators can still see + manage their own pending markets via /my-markets.
  const visibleRows = rows.filter((row) => {
    if (row.contractId !== TRUTH_MARKET_CONTRACT_ID) return false;
    if (!acceptsRegistryCloneVerification(row.contractVerification)) return false;
    if ((row.creatorBond ?? 0n) > 0n && row.bondPosted === false) return false;
    return true;
  });
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="eyebrow">
          <span className="site-chain-dot" /> Live on-chain
        </p>
        <h1>
          {total === 0n
            ? "Bet on what's true."
            : `${total.toString()} ${total === 1n ? "claim" : "claims"} on the line.`}
        </h1>
        <p className="page-header-sub">
          Pick a side. Post a stake. A random jury rules — winners take the slashed pool.
          Refreshed live from chain every {revalidate}s.
        </p>
        <div className="page-header-actions">
          <Link href="/deploy" className="page-header-cta">
            Launch a claim →
          </Link>
          <Link href="/my-markets" className="page-header-cta page-header-cta-ghost">
            Your claims
          </Link>
        </div>
      </section>

      {visibleRows.length === 0 ? (
        <section className="empty-state">
          <h2>The board is empty.</h2>
          <p>
            Be the first to put truth on the line. <Link href="/deploy">Launch a claim →</Link>
          </p>
          {hiddenCount > 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>
              {hiddenCount} hidden (bond pending, unrecognized contract, or clone bytecode mismatch). Creators can manage their drafts at{" "}
              <Link href="/my-markets">/my-markets</Link>.
            </p>
          ) : null}
        </section>
      ) : (
        <ul className="markets-grid">
          {visibleRows.map((row) => {
            const dl = nextDeadline(row);
            return (
              <li key={row.address} className="market-card">
                <Link href={`/markets/${row.address}`} className="market-card-link">
                  <header className="market-card-head">
                    <h2 className="market-card-name">{row.title ?? "(claim unavailable)"}</h2>
                    <div className="market-card-badges">
                      <PhasePill phase={row.phase} outcome={row.outcome} />
                    </div>
                  </header>
                  <dl className="market-card-meta">
                    <div>
                      <dt>Commits</dt>
                      <dd>
                        {row.commitCount ?? "?"} votes · max {row.targetJurySize ?? "?"} jurors
                      </dd>
                    </div>
                    {dl ? (
                      <div>
                        <dt>{dl.label}</dt>
                        <dd>
                          <TimeAgo deadline={dl.epoch} fallback={new Date(dl.epoch * 1000).toISOString().slice(11, 19)} />
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Address</dt>
                      <dd>
                        <code>{shortAddress(row.address)}</code>
                      </dd>
                    </div>
                  </dl>
                  <div className="verification-row market-card-verification-row">
                    <SwarmBadge verified={row.claimVerified} url={row.claimUrl} error={row.claimError} compact asLink={false} />
                    <SourcifyBadge verification={row.contractVerification} compact asLink={false} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <nav className="pagination" aria-label="Pagination">
        <PageLink page={page - 1} disabled={page <= 1} label="← Prev" />
        <span className="pagination-status">
          Page {page} of {totalPages}
        </span>
        <PageLink page={page + 1} disabled={page >= totalPages} label="Next →" />
      </nav>
    </main>
  );
}

function PageLink({ page, disabled, label }: { page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="pagination-link is-disabled" aria-disabled="true">
        {label}
      </span>
    );
  }
  return (
    <Link href={`/?page=${page}`} className="pagination-link">
      {label}
    </Link>
  );
}
