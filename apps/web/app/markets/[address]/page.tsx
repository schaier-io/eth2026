import Link from "next/link";
import { notFound } from "next/navigation";
import { formatUnits, isAddress, type Address, type Hex } from "viem";
import { TimeAgo } from "../../components/TimeAgo";
import { SourcifyBadge } from "../../components/SourcifyBadge";
import { SwarmBadge } from "../../components/SwarmBadge";
import { erc20Abi, truthMarketAbi, TRUTH_MARKET_CONTRACT_ID } from "../../../lib/truthmarket";
import { explorerAddressUrl, getChainId, getPublicClient } from "../../../lib/server/viem";
import { loadClaimDocument } from "../../../lib/server/swarm-claim";
import { readRegistryImplementation, verifyMarketCloneContract } from "../../../lib/server/sourcify";
import type { ContractVerification } from "../../../lib/contract-verification";
import { VotePanel } from "./VotePanel";
import { LifecycleActions } from "./LifecycleActions";

const TREASURY_HARDCODED: Address = "0x574F91bd4d8e83F84B62c3Ca75d24684813237Cc";

export const revalidate = 10;

const PHASE_LABEL = ["Voting", "Reveal", "Resolved"] as const;
const OUTCOME_LABEL = ["Unresolved", "YES", "NO", "Invalid"] as const;

type Params = Promise<{ address: string }>;

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtTimestamp(epoch: bigint | undefined): string {
  if (!epoch || epoch === 0n) return "—";
  return new Date(Number(epoch) * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

interface MarketView {
  contractId: `0x${string}`;
  contractVersion: number;
  creatorBond: bigint;
  bondPosted: boolean;
  title: string;
  context: string;
  tags: readonly string[];
  claimUrl: string | null;
  claimVerified: boolean;
  claimError?: string;
  swarmReference: Hex;
  phase: number;
  outcome: number;
  commitCount: number;
  totalCommittedStake: bigint;
  juryYesCount: number;
  juryNoCount: number;
  revealedJurorCount: number;
  votingDeadline: bigint;
  juryCommitDeadline: bigint;
  revealDeadline: bigint;
  minStake: bigint;
  targetJurySize: number;
  minRevealedJurors: number;
  protocolFeePercent: number;
  jury: readonly Address[];
  randomness: {
    randomness: bigint;
    randomnessHash: `0x${string}`;
    randomnessIpfsAddress: `0x${string}`;
    randomnessSequence: bigint;
    randomnessTimestamp: bigint;
    randomnessIndex: number;
    juryAuditHash: `0x${string}`;
  };
  creator: Address;
  stakeToken: Address;
  symbol: string;
  decimals: number;
  contractVerification: ContractVerification;
}

async function loadMarket(address: Address): Promise<MarketView | null> {
  const client = getPublicClient();
  const chainId = getChainId();
  const read = <T,>(functionName: string, args?: unknown[]): Promise<T> =>
    client.readContract({ address, abi: truthMarketAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

  let core;
  try {
    core = await Promise.all([
      read<`0x${string}`>("CONTRACT_ID"),
      read<number>("CONTRACT_VERSION"),
      read<Hex>("swarmReference"),
      read<number>("phase"),
      read<number>("outcome"),
      read<number>("commitCount"),
      read<bigint>("totalCommittedStake"),
      read<number>("juryYesCount"),
      read<number>("juryNoCount"),
      read<number>("revealedJurorCount"),
      read<bigint>("votingDeadline"),
      read<bigint>("juryCommitDeadline"),
      read<bigint>("revealDeadline"),
      read<bigint>("minStake"),
      read<number>("targetJurySize"),
      read<number>("minRevealedJurors"),
      read<number>("PROTOCOL_FEE_PERCENT"),
      read<readonly Address[]>("getJury"),
      read<MarketView["randomness"]>("getRandomnessEvidence"),
      read<Address>("creator"),
      read<Address>("stakeToken"),
      read<bigint>("creatorBond"),
      read<boolean>("bondPosted"),
    ]);
  } catch {
    return null;
  }

  if (core[0] !== TRUTH_MARKET_CONTRACT_ID) return null;

  const stakeToken = core[20];
  const [claim, implementation] = await Promise.all([
    loadClaimDocument(core[2]),
    readRegistryImplementation(client),
  ]);
  const contractVerification = await verifyMarketCloneContract({
    client,
    chainId,
    market: address,
    implementation,
  });
  let symbol = "TOKEN";
  let decimals = 18;
  try {
    const [sym, dec] = await Promise.all([
      client.readContract({ address: stakeToken, abi: erc20Abi, functionName: "symbol" }) as Promise<string>,
      client.readContract({ address: stakeToken, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
    ]);
    symbol = sym;
    decimals = Number(dec);
  } catch {
    // Token may not exist on this chain; keep defaults.
  }

  return {
    contractId: core[0],
    contractVersion: Number(core[1]),
    swarmReference: core[2],
    title: claim.document?.title ?? "(claim unavailable)",
    context: claim.document?.context ?? "",
    tags: claim.document?.tags ?? [],
    claimUrl: claim.url,
    claimVerified: claim.verified,
    claimError: claim.error,
    phase: Number(core[3]),
    outcome: Number(core[4]),
    commitCount: Number(core[5]),
    totalCommittedStake: core[6],
    juryYesCount: Number(core[7]),
    juryNoCount: Number(core[8]),
    revealedJurorCount: Number(core[9]),
    votingDeadline: core[10],
    juryCommitDeadline: core[11],
    revealDeadline: core[12],
    minStake: core[13],
    targetJurySize: Number(core[14]),
    minRevealedJurors: Number(core[15]),
    protocolFeePercent: Number(core[16]),
    jury: core[17],
    randomness: core[18],
    creator: core[19],
    stakeToken,
    symbol,
    decimals,
    creatorBond: core[21],
    bondPosted: core[22],
    contractVerification,
  };
}

export default async function MarketDetailPage({ params }: { params: Params }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const data = await loadMarket(address as Address);
  if (!data) notFound();

  const chainId = getChainId();
  const explorer = (a: Address) => explorerAddressUrl(a);
  const phaseLabel = PHASE_LABEL[data.phase] ?? "Unknown";
  const outcomeLabel = OUTCOME_LABEL[data.outcome] ?? "?";
  const resolvedVariant =
    data.outcome === 1 ? "phase-resolved-yes" : data.outcome === 2 ? "phase-resolved-no" : "phase-resolved-invalid";
  const phaseClass =
    data.phase === 0
      ? "phase-pill phase-voting"
      : data.phase === 1
        ? "phase-pill phase-reveal"
        : `phase-pill ${data.outcome > 0 ? resolvedVariant : "phase-resolved"}`;

  return (
    <main className="page-shell market-detail">
      <Link href="/" className="back-link">← All claims</Link>

      <header className="market-detail-head">
        <div>
          <p className="eyebrow">
            <span className={phaseClass}>{phaseLabel}</span>
            {data.phase === 2 && data.outcome > 0 ? (
              <span className={`outcome-pill outcome-${outcomeLabel.toLowerCase()}`}>{outcomeLabel}</span>
            ) : null}
          </p>
          <div className="market-title-row">
            <h1>{data.title}</h1>
          </div>
          {data.context ? (
            <div className="market-detail-desc-block">
              <p className="market-detail-desc">{data.context}</p>
            </div>
          ) : null}
          {!data.claimVerified ? (
            <p className="claim-warning">Claim/rules document failed Swarm verification: {data.claimError ?? "unknown error"}</p>
          ) : null}
          {data.tags.length > 0 ? (
            <ul className="tag-list">
              {data.tags.map((t) => (
                <li key={t} className="tag-chip">{t}</li>
              ))}
            </ul>
          ) : null}
          <div className="verification-row market-detail-verification-row">
            <SwarmBadge verified={data.claimVerified} url={data.claimUrl} error={data.claimError} />
            <SourcifyBadge verification={data.contractVerification} />
          </div>
        </div>
        <aside className="market-detail-addrs">
          <AddrRow label="Market" addr={address as Address} href={explorer(address as Address)} />
          <AddrRow label="Creator" addr={data.creator} href={explorer(data.creator)} />
          <AddrRow label="Stake token" addr={data.stakeToken} href={explorer(data.stakeToken)} extra={data.symbol} />
        </aside>
      </header>

      <section className="card stats-grid">
        <Stat label="Commits" value={`${data.commitCount} votes · max ${data.targetJurySize} jurors`} />
        <Stat
          label="Pot"
          value={`${formatUnits(data.totalCommittedStake, data.decimals)} ${data.symbol}`}
        />
        <Stat label="Min stake" value={`${formatUnits(data.minStake, data.decimals)} ${data.symbol}`} />
        <Stat label="Protocol cut" value={`${data.protocolFeePercent}%`} />
        <Stat label="Contract" value={`TruthMarket v${data.contractVersion}`} />
        <Stat label="Code check" value={<SourcifyBadge verification={data.contractVerification} />} />
        <Stat
          label="Jury verdict"
          value={
            <>
              <span className="tally-yes">YES {data.juryYesCount}</span>
              <span className="tally-divider"> · </span>
              <span className="tally-no">NO {data.juryNoCount}</span>
            </>
          }
        />
        <Stat label="Revealed" value={`${data.revealedJurorCount} / ${data.minRevealedJurors} min`} />
      </section>

      <section className="card timeline">
        <h2>Timeline</h2>
        <ol>
          <li>
            <span className="timeline-step">Voting closes</span>
            <span className="timeline-when">
              {fmtTimestamp(data.votingDeadline)} ·{" "}
              <TimeAgo deadline={Number(data.votingDeadline)} />
            </span>
          </li>
          <li>
            <span className="timeline-step">Jury must form</span>
            <span className="timeline-when">
              {fmtTimestamp(data.juryCommitDeadline)} ·{" "}
              <TimeAgo deadline={Number(data.juryCommitDeadline)} />
            </span>
          </li>
          <li>
            <span className="timeline-step">Reveal closes</span>
            <span className="timeline-when">
              {fmtTimestamp(data.revealDeadline)} ·{" "}
              <TimeAgo deadline={Number(data.revealDeadline)} />
            </span>
          </li>
        </ol>
      </section>

      <LifecycleActions
        market={address as Address}
        phase={data.phase}
        outcome={data.outcome}
        juryCommitDeadline={data.juryCommitDeadline.toString()}
        revealDeadline={data.revealDeadline.toString()}
        decimals={data.decimals}
        symbol={data.symbol}
        treasury={TREASURY_HARDCODED}
        creator={data.creator}
        chainId={chainId}
      />

      <VotePanel
        market={address as Address}
        stakeToken={data.stakeToken}
        decimals={data.decimals}
        symbol={data.symbol}
        minStake={data.minStake.toString()}
        phase={data.phase}
        outcome={data.outcome}
        chainId={chainId}
        creator={data.creator}
        creatorBond={data.creatorBond.toString()}
        bondPosted={data.bondPosted}
        votingDeadline={data.votingDeadline.toString()}
        revealDeadline={data.revealDeadline.toString()}
      />

      <section className="card jury-card">
        <h2>Jury ({data.jury.length})</h2>
        {data.jury.length === 0 ? (
          <p className="muted">Jury not yet drawn. Pulled from verifiable randomness once voting ends.</p>
        ) : (
          <ul className="jury-list">
            {data.jury.map((j) => (
              <li key={j}>
                <code>{j}</code>
                {explorer(j) ? (
                  <a href={explorer(j)} target="_blank" rel="noreferrer" className="external-link">
                    explorer ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card randomness-card">
        <h2>Randomness receipts</h2>
        {data.randomness.randomness === 0n ? (
          <p className="muted">No randomness committed yet.</p>
        ) : (
          <dl className="randomness-grid">
            <div>
              <dt>Sequence</dt>
              <dd><code>{data.randomness.randomnessSequence.toString()}</code></dd>
            </div>
            <div>
              <dt>Timestamp</dt>
              <dd>{fmtTimestamp(data.randomness.randomnessTimestamp)}</dd>
            </div>
            <div>
              <dt>Index</dt>
              <dd><code>{data.randomness.randomnessIndex}</code></dd>
            </div>
            <div className="span-2">
              <dt>Randomness hash</dt>
              <dd><code className="hash">{data.randomness.randomnessHash}</code></dd>
            </div>
            <div className="span-2">
              <dt>Audit hash</dt>
              <dd><code className="hash">{data.randomness.juryAuditHash}</code></dd>
            </div>
            <div className="span-2">
              <dt>IPFS pointer</dt>
              <dd><code className="hash">{data.randomness.randomnessIpfsAddress || "0x"}</code></dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function AddrRow({
  label,
  addr,
  href,
  extra,
}: {
  label: string;
  addr: Address;
  href: string | undefined;
  extra?: string;
}) {
  return (
    <div className="addr-row">
      <span className="addr-label">{label}</span>
      <span className="addr-value">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            <code>{shortAddress(addr)}</code>
          </a>
        ) : (
          <code>{shortAddress(addr)}</code>
        )}
        {extra ? <span className="addr-extra"> · {extra}</span> : null}
      </span>
    </div>
  );
}
