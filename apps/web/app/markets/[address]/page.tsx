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
import { getMarketDisplayPhase } from "../../../lib/market-phase";
import type { ContractVerification } from "../../../lib/contract-verification";
import { VotePanel } from "./VotePanel";
import { LifecycleActions } from "./LifecycleActions";

const TREASURY_HARDCODED: Address = "0x574F91bd4d8e83F84B62c3Ca75d24684813237Cc";
const PHASE_VOTING = 0;
const PHASE_REVEAL = 1;
const PHASE_RESOLVED = 2;
const OUTCOME_INVALID = 3;

export const revalidate = 10;

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
  minCommits: number;
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
  juryCommitter: Address;
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
      read<number>("minCommits"),
      read<number>("minRevealedJurors"),
      read<number>("PROTOCOL_FEE_PERCENT"),
      read<readonly Address[]>("getJury"),
      read<MarketView["randomness"]>("getRandomnessEvidence"),
      read<Address>("creator"),
      read<Address>("juryCommitter"),
      read<Address>("stakeToken"),
      read<bigint>("creatorBond"),
      read<boolean>("bondPosted"),
    ]);
  } catch {
    return null;
  }

  if (core[0] !== TRUTH_MARKET_CONTRACT_ID) return null;

  const [
    contractId,
    contractVersion,
    swarmReference,
    phase,
    outcome,
    commitCount,
    totalCommittedStake,
    juryYesCount,
    juryNoCount,
    revealedJurorCount,
    votingDeadline,
    juryCommitDeadline,
    revealDeadline,
    minStake,
    targetJurySize,
    minCommits,
    minRevealedJurors,
    protocolFeePercent,
    jury,
    randomness,
    creator,
    juryCommitter,
    stakeToken,
    creatorBond,
    bondPosted,
  ] = core;

  const [claim, implementation] = await Promise.all([
    loadClaimDocument(swarmReference),
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
    contractId,
    contractVersion: Number(contractVersion),
    swarmReference,
    title: claim.document?.title ?? "(claim unavailable)",
    context: claim.document?.context ?? "",
    tags: claim.document?.tags ?? [],
    claimUrl: claim.url,
    claimVerified: claim.verified,
    claimError: claim.error,
    phase: Number(phase),
    outcome: Number(outcome),
    commitCount: Number(commitCount),
    totalCommittedStake,
    juryYesCount: Number(juryYesCount),
    juryNoCount: Number(juryNoCount),
    revealedJurorCount: Number(revealedJurorCount),
    votingDeadline,
    juryCommitDeadline,
    revealDeadline,
    minStake,
    targetJurySize: Number(targetJurySize),
    minCommits: Number(minCommits),
    minRevealedJurors: Number(minRevealedJurors),
    protocolFeePercent: Number(protocolFeePercent),
    jury,
    randomness,
    creator,
    juryCommitter,
    stakeToken,
    symbol,
    decimals,
    creatorBond,
    bondPosted,
    contractVerification,
  };
}

type TimelineState = "complete" | "current" | "failed" | "pending";

interface TimelineItem {
  label: string;
  timestamp: bigint;
  state: TimelineState;
  status: string;
  detail: string;
}

function buildTimeline(data: MarketView, now: number): TimelineItem[] {
  const votingDeadline = Number(data.votingDeadline);
  const juryCommitDeadline = Number(data.juryCommitDeadline);
  const revealDeadline = Number(data.revealDeadline);
  const hasJury = data.randomness.randomness !== 0n;
  const resolvedInvalid = data.phase === PHASE_RESOLVED && data.outcome === OUTCOME_INVALID;
  const votingUnderfilled = data.commitCount < data.minCommits;
  const juryMissed =
    !hasJury &&
    ((now >= votingDeadline && votingUnderfilled) || now >= juryCommitDeadline || data.phase === PHASE_RESOLVED);
  const revealTied =
    hasJury &&
    data.revealedJurorCount >= data.minRevealedJurors &&
    data.juryYesCount === data.juryNoCount;
  const revealQuorumMissed = hasJury && data.revealedJurorCount < data.minRevealedJurors;
  const revealFailed =
    hasJury &&
    (resolvedInvalid || (now >= revealDeadline && (revealQuorumMissed || revealTied)));

  return [
    {
      label: "Voting closes",
      timestamp: data.votingDeadline,
      state:
        now < votingDeadline && data.phase === PHASE_VOTING
          ? "current"
          : votingUnderfilled && !hasJury
            ? "failed"
            : "complete",
      status:
        now < votingDeadline && data.phase === PHASE_VOTING
          ? "Open"
          : votingUnderfilled && !hasJury
            ? "Failed"
            : "Done",
      detail:
        votingUnderfilled && !hasJury
          ? `${data.commitCount} / ${data.minCommits} commits`
          : "Commit window closed",
    },
    {
      label: "Jury must form",
      timestamp: data.juryCommitDeadline,
      state: hasJury ? "complete" : juryMissed ? "failed" : now >= votingDeadline ? "current" : "pending",
      status: hasJury ? "Done" : juryMissed ? "Failed" : now >= votingDeadline ? "Waiting" : "Pending",
      detail: hasJury
        ? `${data.jury.length} selected jurors`
        : juryMissed
          ? votingUnderfilled
            ? "Commit minimum was not met"
            : "Randomness was not posted in time"
          : "Waiting for SpaceComputer randomness",
    },
    {
      label: "Reveal closes",
      timestamp: data.revealDeadline,
      state: !hasJury
        ? juryMissed
          ? "failed"
          : "pending"
        : revealFailed
          ? "failed"
          : data.phase === PHASE_REVEAL && now < revealDeadline
            ? "current"
            : now >= revealDeadline || data.phase === PHASE_RESOLVED
              ? "complete"
              : "pending",
      status: !hasJury
        ? juryMissed
          ? "Skipped"
          : "Pending"
        : revealFailed
          ? "Failed"
          : data.phase === PHASE_REVEAL && now < revealDeadline
            ? "Open"
            : now >= revealDeadline || data.phase === PHASE_RESOLVED
              ? "Done"
              : "Pending",
      detail: !hasJury
        ? juryMissed
          ? "No jury formed"
          : "Reveal waits for jury selection"
        : revealQuorumMissed && (resolvedInvalid || now >= revealDeadline)
          ? `${data.revealedJurorCount} / ${data.minRevealedJurors} jurors revealed`
          : revealTied && (resolvedInvalid || now >= revealDeadline)
            ? "Selected juror count tied"
            : `${data.revealedJurorCount} / ${data.minRevealedJurors} minimum reveals`,
    },
  ];
}

export default async function MarketDetailPage({ params }: { params: Params }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const data = await loadMarket(address as Address);
  if (!data) notFound();

  const chainId = getChainId();
  const explorer = (a: Address) => explorerAddressUrl(a);
  const now = Math.floor(Date.now() / 1000);
  const displayPhase = getMarketDisplayPhase({
    phase: data.phase,
    outcome: data.outcome,
    votingDeadline: data.votingDeadline,
    juryCommitDeadline: data.juryCommitDeadline,
    revealDeadline: data.revealDeadline,
    now,
  });
  const timeline = buildTimeline(data, now);

  return (
    <main className="page-shell market-detail">
      <Link href="/" className="back-link">← All markets</Link>

      <header className="market-detail-head">
        <div>
          <p className="eyebrow">
            <span className={displayPhase.className}>{displayPhase.label}</span>
            {displayPhase.outcomeLabel ? (
              <span className={`outcome-pill outcome-${displayPhase.outcomeLabel.toLowerCase()}`}>
                {displayPhase.outcomeLabel}
              </span>
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
          {timeline.map((item) => (
            <li key={item.label} className={`timeline-item timeline-${item.state}`}>
              <span className="timeline-main">
                <span className="timeline-step">{item.label}</span>
                <span className="timeline-detail">{item.detail}</span>
              </span>
              <span className="timeline-side">
                <span className={`timeline-status timeline-status-${item.state}`}>{item.status}</span>
                <span className="timeline-when">
                  {fmtTimestamp(item.timestamp)} ·{" "}
                  <TimeAgo deadline={Number(item.timestamp)} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <LifecycleActions
        market={address as Address}
        phase={data.phase}
        outcome={data.outcome}
        votingDeadline={data.votingDeadline.toString()}
        juryCommitDeadline={data.juryCommitDeadline.toString()}
        revealDeadline={data.revealDeadline.toString()}
        decimals={data.decimals}
        symbol={data.symbol}
        treasury={TREASURY_HARDCODED}
        creator={data.creator}
        juryCommitter={data.juryCommitter}
        randomnessCommitted={data.randomness.randomness !== 0n}
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
