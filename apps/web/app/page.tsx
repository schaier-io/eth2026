import Link from "next/link";
import { formatUnits, type Address, type Hex } from "viem";
import { TimeAgo } from "./components/TimeAgo";
import { SourcifyBadge } from "./components/SourcifyBadge";
import { SwarmBadge } from "./components/SwarmBadge";
import { truthMarketRegistryAbi, registryAddress } from "../lib/registry";
import { erc20Abi, truthMarketAbi, TRUTH_MARKET_CONTRACT_ID } from "../lib/truthmarket";
import { getChainId, getPublicClient } from "../lib/server/viem";
import { loadClaimDocument } from "../lib/server/swarm-claim";
import { getMarketDisplayPhase } from "../lib/market-phase";
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

function formatBondAmount(amount: bigint, decimals: number | undefined): string {
  const dec = decimals ?? 18;
  const raw = formatUnits(amount, dec);
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  if (num >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  // Sub-1 amounts: trim trailing zeros, keep up to 4 decimals.
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
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
  juryCommitDeadline: bigint | undefined;
  revealDeadline: bigint | undefined;
  commitCount: number | undefined;
  targetJurySize: number | undefined;
  creatorBond: bigint | undefined;
  bondPosted: boolean | undefined;
  stakeToken: Address | undefined;
  stakeSymbol: string | undefined;
  stakeDecimals: number | undefined;
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
  const tokenMetaCache = new Map<string, Promise<TokenMeta | undefined>>();

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
          juryCommitDeadline: undefined,
          revealDeadline: undefined,
          commitCount: undefined,
          targetJurySize: undefined,
          creatorBond: undefined,
          bondPosted: undefined,
          stakeToken: undefined,
          stakeSymbol: undefined,
          stakeDecimals: undefined,
          contractVerification: undefined,
          claimVerified: undefined,
          claimUrl: undefined,
          claimError: undefined,
        };
      }
      const [swarmReference, phase, outcome, votingDeadline, juryCommitDeadline, revealDeadline, commitCount, targetJurySize, creatorBond, bondPosted, stakeToken, contractVerification] = await Promise.all([
        safe<Hex>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "swarmReference" }) as Promise<Hex>),
        safe<number>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "phase" }) as Promise<number>),
        safe<number>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "outcome" }) as Promise<number>),
        safe<bigint>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "votingDeadline" }) as Promise<bigint>),
        safe<bigint>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "juryCommitDeadline" }) as Promise<bigint>),
        safe<bigint>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "revealDeadline" }) as Promise<bigint>),
        safe<number>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "commitCount" }) as Promise<number>),
        safe<number>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "targetJurySize" }) as Promise<number>),
        safe<bigint>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "creatorBond" }) as Promise<bigint>),
        safe<boolean>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "bondPosted" }) as Promise<boolean>),
        safe<Address>(() => client.readContract({ address: addr, abi: truthMarketAbi, functionName: "stakeToken" }) as Promise<Address>),
        verifyMarketCloneContract({ client, chainId, market: addr, implementation, implementationSourcify }),
      ]);
      const [claim, tokenMeta] = await Promise.all([
        loadClaimDocument(swarmReference),
        stakeToken ? loadTokenMeta(stakeToken, tokenMetaCache) : Promise.resolve(undefined),
      ]);
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
        juryCommitDeadline,
        revealDeadline,
        commitCount,
        targetJurySize,
        creatorBond,
        bondPosted,
        stakeToken,
        stakeSymbol: tokenMeta?.symbol,
        stakeDecimals: tokenMeta?.decimals,
        contractVerification,
      };
    }),
  );

  return { total, rows };
}

interface TokenMeta {
  symbol: string;
  decimals: number;
}

async function loadTokenMeta(
  token: Address,
  cache: Map<string, Promise<TokenMeta | undefined>>,
): Promise<TokenMeta | undefined> {
  const key = token.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const client = getPublicClient();
      const [symbol, decimals] = await Promise.all([
        client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }) as Promise<string>,
        client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
      ]);
      return { symbol, decimals: Number(decimals) };
    } catch {
      return undefined;
    }
  })();
  cache.set(key, promise);
  return promise;
}

function PhasePill({ display }: { display: ReturnType<typeof getMarketDisplayPhase> }) {
  return (
    <span className={display.className}>
      {display.label}
      {display.outcomeLabel ? ` · ${display.outcomeLabel}` : ""}
    </span>
  );
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
  const now = Math.floor(Date.now() / 1000);

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
            const display = getMarketDisplayPhase({
              phase: row.phase,
              outcome: row.outcome,
              votingDeadline: row.votingDeadline,
              juryCommitDeadline: row.juryCommitDeadline,
              revealDeadline: row.revealDeadline,
              now,
            });
            const dl = display.deadline;
            const bondAmount = row.creatorBond ?? 0n;
            const hasBond = bondAmount > 0n && row.bondPosted !== false;
            const symbol = row.stakeSymbol ?? "tokens";
            return (
              <li key={row.address} className="market-card">
                <Link href={`/markets/${row.address}`} className="market-card-link">
                  <header className="market-card-head">
                    <h2 className="market-card-name">{row.title ?? "(claim unavailable)"}</h2>
                    <div className="market-card-badges">
                      <PhasePill display={display} />
                    </div>
                  </header>
                  <div
                    className={`bond-hero${hasBond ? "" : " bond-hero-empty"}`}
                    title={hasBond ? "Creator bond joins the winner pool" : "No creator bond on this market"}
                  >
                    <span className="bond-hero-label">{hasBond ? "Bonus pot" : "Creator bond"}</span>
                    <span className="bond-hero-amount">
                      {hasBond ? (
                        <>
                          +{formatBondAmount(bondAmount, row.stakeDecimals)}{" "}
                          <span className="bond-hero-symbol">{symbol}</span>
                        </>
                      ) : (
                        "None"
                      )}
                    </span>
                  </div>
                  <dl className="market-card-meta">
                    <div className="market-card-progress-row">
                      <dt>Commits</dt>
                      <dd>
                        <span className="market-card-progress-num">
                          {row.commitCount ?? 0}
                        </span>
                        <span className="market-card-progress-target"> / {row.targetJurySize ?? "?"} jurors</span>
                      </dd>
                      <CommitProgress commits={row.commitCount ?? 0} target={row.targetJurySize ?? 0} />
                    </div>
                    {dl ? (
                      <div>
                        <dt>{dl.label}</dt>
                        <dd>
                          <TimeAgo deadline={dl.epoch} fallback={new Date(dl.epoch * 1000).toISOString().slice(11, 19)} />
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="market-card-footer">
                    <div className="market-card-verification">
                      <span className="market-card-verification-label">Verified via</span>
                      <div className="market-card-verification-badges">
                        <SwarmBadge verified={row.claimVerified} url={row.claimUrl} error={row.claimError} compact asLink={false} />
                        <SourcifyBadge verification={row.contractVerification} compact asLink={false} />
                      </div>
                    </div>
                    <div className="market-card-footer-top">
                      <code className="market-card-addr" title={row.address}>{shortAddress(row.address)}</code>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="pagination" aria-label="Pagination">
          <PageLink page={page - 1} disabled={page <= 1} label="← Prev" />
          <span className="pagination-status">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages} label="Next →" />
        </nav>
      ) : null}
    </main>
  );
}

function CommitProgress({ commits, target }: { commits: number; target: number }) {
  const safeTarget = target > 0 ? target : 1;
  const pct = Math.min(100, Math.round((commits / safeTarget) * 100));
  const variant = pct >= 100 ? "is-full" : pct >= 50 ? "is-mid" : "is-low";
  return (
    <span className={`market-card-progress ${variant}`} aria-hidden="true">
      <span className="market-card-progress-fill" style={{ width: `${pct}%` }} />
    </span>
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
