"use client";

import { useEffect, useState } from "react";
import { formatUnits, type Address, type Hex } from "viem";
import {
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
  juryCommitDeadline: string;
  revealDeadline: string;
  decimals: number;
  symbol: string;
  treasury: Address;
  creator: Address;
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
  const juryDeadline = Number(props.juryCommitDeadline);
  const revealDeadline = Number(props.revealDeadline);

  // Voting → Invalid: triggerable when juryCommitDeadline has passed (no jury was drawn).
  // Reveal → Yes/No/Invalid: triggerable when revealDeadline has passed.
  const canResolve =
    !isResolved &&
    now !== null &&
    ((props.phase === PHASE_VOTING && now >= juryDeadline) ||
      (props.phase === PHASE_REVEAL && now >= revealDeadline));

  return (
    <>
      {canResolve ? <ResolveCard {...props} /> : null}
      {isResolved ? <CreatorReturnCard {...props} /> : null}
      {isResolved ? <TreasuryReturnCard {...props} /> : null}
    </>
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
        <h3>Ready to resolve.</h3>
        <p>
          {props.phase === PHASE_VOTING
            ? "Jury didn't form in time — resolving locks this in as Invalid."
            : "Reveal window closed — resolve to lock the verdict."}{" "}
          Permissionless: anyone pays gas to push the state. After this, voters claim, creators collect, and the treasury fee unlocks.
        </p>
      </div>
      <div className="lifecycle-card-actions">
        {wrongChain ? (
          <button type="button" onClick={() => switchChain({ chainId: props.chainId })} disabled={isSwitching}>
            {isSwitching ? "Switching…" : `Switch to chain ${props.chainId}`}
          </button>
        ) : (
          <button type="button" className="primary" onClick={onResolve} disabled={busy}>
            {busy ? "Resolving…" : "Resolve it"}
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
    setStatus({ kind: "info", message: "Pushing creator return…" });
    try {
      const hash = await writeContractAsync({
        address: props.market,
        abi: truthMarketAbi,
        functionName: "withdrawCreator",
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setStatus({ kind: "success", message: "Sent to creator." });
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
        <h3>Creator return ready · {amountStr}</h3>
        <p>
          {isInvalid
            ? "Resolved Invalid — creator bond plus no-show juror penalties go back to the creator."
            : "No-show juror penalties accrued to the creator. No protocol cut."}{" "}
          Always lands at <code>{shortAddress(props.creator)}</code> — anyone can hit the button.
        </p>
      </div>
      <div className="lifecycle-card-actions">
        {wrongChain ? (
          <button type="button" onClick={() => switchChain({ chainId: props.chainId })} disabled={isSwitching}>
            {isSwitching ? "Switching…" : `Switch to chain ${props.chainId}`}
          </button>
        ) : (
          <button type="button" className="primary" onClick={onWithdraw} disabled={busy}>
            {busy ? "Sending…" : `Send to creator (${amountStr})`}
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
    setStatus({ kind: "info", message: "Pushing treasury fee…" });
    try {
      const hash = await writeContractAsync({
        address: props.market,
        abi: truthMarketAbi,
        functionName: "withdrawTreasury",
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setStatus({ kind: "success", message: "Sent to treasury." });
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
          1% of the slashed pool. Locked to <code>{shortAddress(props.treasury)}</code> — anyone can push it.
        </p>
      </div>
      <div className="lifecycle-card-actions">
        <button type="button" onClick={onWithdraw} disabled={busy || wrongChain}>
          {busy ? "Sending…" : `Send to treasury (${amountStr})`}
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
