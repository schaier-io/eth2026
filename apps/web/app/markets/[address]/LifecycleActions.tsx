"use client";

import { useEffect, useState } from "react";
import { formatUnits, type Address, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { truthMarketAbi } from "../../../lib/truthmarket";

const PHASE_VOTING = 0;
const PHASE_REVEAL = 1;
const PHASE_RESOLVED = 2;

interface Props {
  market: Address;
  phase: number;
  outcome: number;
  /** Stringified bigints — RSC → client safe. */
  votingDeadline: string;
  juryCommitDeadline: string;
  revealDeadline: string;
  decimals: number;
  symbol: string;
  treasury: Address;
  creator: Address;
  juryCommitter: Address;
  randomnessCommitted: boolean;
  chainId: number;
}

type StatusKind = "info" | "success" | "error" | "";
interface Status {
  kind: StatusKind;
  message: string;
}

export function LifecycleActions(props: Props) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
    return () => window.clearInterval(id);
  }, []);

  const isResolved = props.phase === PHASE_RESOLVED;
  const votingDeadline = Number(props.votingDeadline);
  const juryDeadline = Number(props.juryCommitDeadline);
  const revealDeadline = Number(props.revealDeadline);

  const canCommitJury =
    props.phase === PHASE_VOTING &&
    !props.randomnessCommitted &&
    now !== null &&
    now >= votingDeadline &&
    now < juryDeadline;

  // Voting → Invalid: triggerable when juryCommitDeadline has passed (no jury was drawn).
  // Reveal → Yes/No/Invalid: triggerable when revealDeadline has passed.
  const canResolve =
    !isResolved &&
    now !== null &&
    ((props.phase === PHASE_VOTING && now >= juryDeadline) ||
      (props.phase === PHASE_REVEAL && now >= revealDeadline));

  return (
    <>
      {canCommitJury ? <JuryCommitCard {...props} /> : null}
      {canResolve ? <ResolveCard {...props} /> : null}
      {isResolved ? <CreatorReturnCard {...props} /> : null}
      {isResolved ? <TreasuryReturnCard {...props} /> : null}
    </>
  );
}

interface LatestBeaconResponse {
  ok: boolean;
  error?: string;
  randomness: string;
  randomnessHex: Hex;
  auditHash: Hex;
  ipfsAddressText: string;
  metadata: {
    ipfsAddress: Hex;
    sequence: string;
    timestamp: string;
    valueIndex: number;
  };
}

function JuryCommitCard(props: Props) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const walletChainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();
  const [status, setStatus] = useState<Status>({ kind: "", message: "" });
  const [busy, setBusy] = useState(false);

  const { isLoading: txMining } = useWaitForTransactionReceipt({ hash: pendingTx });
  const isJuryCommitter = address?.toLowerCase() === props.juryCommitter.toLowerCase();
  const wrongChain = walletChainId !== props.chainId;

  async function onCommitJury() {
    if (!publicClient) return;
    setBusy(true);
    setStatus({ kind: "info", message: "Getting fresh randomness…" });
    try {
      const response = await fetch("/api/spacecomputer/latest-beacon", { cache: "no-store" });
      const beacon = (await response.json()) as LatestBeaconResponse;
      if (!response.ok || !beacon.ok) {
        throw new Error(beacon.error ?? "Could not fetch SpaceComputer randomness.");
      }

      setStatus({ kind: "info", message: `Confirm in your wallet to form the jury.` });
      const hash = await writeContractAsync({
        address: props.market,
        abi: truthMarketAbi,
        functionName: "commitJury",
        args: [
          BigInt(beacon.randomness),
          {
            ipfsAddress: beacon.metadata.ipfsAddress,
            sequence: BigInt(beacon.metadata.sequence),
            timestamp: BigInt(beacon.metadata.timestamp),
            valueIndex: beacon.metadata.valueIndex,
          },
          beacon.auditHash,
        ],
      });
      setPendingTx(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus({ kind: "success", message: "Jury formed. Refreshing…" });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!isJuryCommitter) return null;

  return (
    <section className="card lifecycle-card lifecycle-jury">
      <div className="lifecycle-card-text">
        <h3>Form the jury</h3>
        <p>
          Voting is over. This fetches fresh randomness and selects the jurors.
        </p>
      </div>
      <div className="lifecycle-card-actions">
        {wrongChain ? (
          <button type="button" onClick={() => switchChain({ chainId: props.chainId })} disabled={isSwitching}>
            {isSwitching ? "Switching…" : `Switch to chain ${props.chainId}`}
          </button>
        ) : (
          <button type="button" className="primary" onClick={onCommitJury} disabled={busy}>
            {busy ? "Submitting…" : "Form jury"}
          </button>
        )}
      </div>
      {pendingTx && txMining ? <p className="vote-status vote-status-info">Mining {pendingTx.slice(0, 10)}…</p> : null}
      <StatusBanner status={status} />
    </section>
  );
}

function ResolveCard(props: Props) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const walletChainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();
  const [status, setStatus] = useState<Status>({ kind: "", message: "" });
  const [busy, setBusy] = useState(false);

  const { isLoading: txMining, isSuccess: txMined } = useWaitForTransactionReceipt({ hash: pendingTx });
  useEffect(() => {
    if (txMined && pendingTx) {
      setStatus({ kind: "success", message: "Verdict in. Refreshing…" });
      // The page is RSC with revalidate=10; a soft refresh is enough.
      setTimeout(() => window.location.reload(), 1500);
    }
  }, [txMined, pendingTx]);

  const wrongChain = walletChainId !== props.chainId;

  async function onResolve() {
    setBusy(true);
    setStatus({ kind: "info", message: "Calling resolve…" });
    try {
      const hash = await writeContractAsync({
        address: props.market,
        abi: truthMarketAbi,
        functionName: "resolve",
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card lifecycle-card lifecycle-resolve">
      <div className="lifecycle-card-text">
        <h3>Resolve market</h3>
        <p>
          {props.phase === PHASE_VOTING
            ? "Jury did not form in time. Resolve as Invalid so claims can open."
            : "Reveal window closed. Resolve the verdict so claims can open."}{" "}
          Anyone can do this transaction.
        </p>
      </div>
      <div className="lifecycle-card-actions">
        {wrongChain ? (
          <button type="button" onClick={() => switchChain({ chainId: props.chainId })} disabled={isSwitching}>
            {isSwitching ? "Switching…" : `Switch to chain ${props.chainId}`}
          </button>
        ) : (
          <button type="button" className="primary" onClick={onResolve} disabled={busy}>
            {busy ? "Resolving…" : "Resolve"}
          </button>
        )}
      </div>
      {pendingTx && txMining ? <p className="vote-status vote-status-info">Mining {pendingTx.slice(0, 10)}…</p> : null}
      <StatusBanner status={status} />
    </section>
  );
}

function CreatorReturnCard(props: Props) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const walletChainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();
  const [status, setStatus] = useState<Status>({ kind: "", message: "" });
  const [busy, setBusy] = useState(false);

  const accrued = useReadContract({
    address: props.market,
    abi: truthMarketAbi,
    functionName: "creatorAccrued",
    query: { refetchInterval: 8000 },
  });
  const accruedVal = (accrued.data as bigint | undefined) ?? 0n;

  const { isLoading: txMining } = useWaitForTransactionReceipt({ hash: pendingTx });

  async function onWithdraw() {
    setBusy(true);
    setStatus({ kind: "info", message: "Sending creator payout…" });
    try {
      const hash = await writeContractAsync({
        address: props.market,
        abi: truthMarketAbi,
        functionName: "withdrawCreator",
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setStatus({ kind: "success", message: "Creator paid." });
      accrued.refetch();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (accruedVal === 0n) return null;
  const wrongChain = walletChainId !== props.chainId;
  const amountStr = `${formatUnits(accruedVal, props.decimals)} ${props.symbol}`;
  const isInvalid = props.outcome === 3;

  return (
    <section className="card lifecycle-card lifecycle-creator">
      <div className="lifecycle-card-text">
        <h3>Creator payout ready · {amountStr}</h3>
        <p>
          {isInvalid
            ? "This sends the creator bond and no-show juror penalties to the creator."
            : "This sends no-show juror penalties to the creator."}{" "}
          Anyone can do it. Funds go to <code>{shortAddress(props.creator)}</code>.
        </p>
      </div>
      <div className="lifecycle-card-actions">
        {wrongChain ? (
          <button type="button" onClick={() => switchChain({ chainId: props.chainId })} disabled={isSwitching}>
            {isSwitching ? "Switching…" : `Switch to chain ${props.chainId}`}
          </button>
        ) : (
          <button type="button" className="primary" onClick={onWithdraw} disabled={busy}>
            {busy ? "Sending…" : "Send payout"}
          </button>
        )}
      </div>
      {pendingTx && txMining ? <p className="vote-status vote-status-info">Mining {pendingTx.slice(0, 10)}…</p> : null}
      <StatusBanner status={status} />
    </section>
  );
}

function TreasuryReturnCard(props: Props) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const walletChainId = useChainId();
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();
  const [status, setStatus] = useState<Status>({ kind: "", message: "" });
  const [busy, setBusy] = useState(false);

  const accrued = useReadContract({
    address: props.market,
    abi: truthMarketAbi,
    functionName: "treasuryAccrued",
    query: { refetchInterval: 8000 },
  });
  const accruedVal = (accrued.data as bigint | undefined) ?? 0n;

  const { isLoading: txMining } = useWaitForTransactionReceipt({ hash: pendingTx });

  async function onWithdraw() {
    setBusy(true);
    setStatus({ kind: "info", message: "Sending treasury fee…" });
    try {
      const hash = await writeContractAsync({
        address: props.market,
        abi: truthMarketAbi,
        functionName: "withdrawTreasury",
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setStatus({ kind: "success", message: "Treasury paid." });
      accrued.refetch();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (accruedVal === 0n) return null;
  const wrongChain = walletChainId !== props.chainId;
  const amountStr = `${formatUnits(accruedVal, props.decimals)} ${props.symbol}`;

  return (
    <section className="card lifecycle-card lifecycle-treasury">
      <div className="lifecycle-card-text">
        <h3>Treasury cut ready · {amountStr}</h3>
        <p>
          This sends the protocol fee to <code>{shortAddress(props.treasury)}</code>. Anyone can do it.
        </p>
      </div>
      <div className="lifecycle-card-actions">
        <button type="button" onClick={onWithdraw} disabled={busy || wrongChain}>
          {busy ? "Sending…" : "Send fee"}
        </button>
      </div>
      {pendingTx && txMining ? <p className="vote-status vote-status-info">Mining {pendingTx.slice(0, 10)}…</p> : null}
      <StatusBanner status={status} />
    </section>
  );
}

function StatusBanner({ status }: { status: Status }) {
  if (!status.message) return null;
  return <p className={`vote-status vote-status-${status.kind}`}>{status.message}</p>;
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "shortMessage" in err) {
    return String((err as { shortMessage: string }).shortMessage);
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
