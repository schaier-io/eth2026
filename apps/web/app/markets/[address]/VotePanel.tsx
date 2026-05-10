"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { WalletConnect } from "../../components/WalletConnect";
import { erc20Abi, truthMarketAbi } from "../../../lib/truthmarket";
import {
  clearVault,
  computeCommitHash,
  createVaultEntry,
  downloadVaultBackup,
  generateNonce,
  readVault,
  writeVault,
  type VaultEntry,
} from "../../../lib/commit";

type Direction = "Yes" | "No";

interface Props {
  market: Address;
  stakeToken: Address;
  decimals: number;
  symbol: string;
  /** Stringified bigint (RSC → client safe). */
  minStake: string;
  phase: number;
  outcome: number;
  chainId: number;
  creator: Address;
  /** Stringified bigint. "0" means no bond required. */
  creatorBond: string;
  bondPosted: boolean;
  /** Stringified bigint — Unix epoch seconds. */
  votingDeadline: string;
  revealDeadline: string;
}

type StatusKind = "info" | "success" | "error" | "";

interface Status {
  kind: StatusKind;
  message: string;
}

const PHASE_VOTING = 0;
const PHASE_REVEAL = 1;

/** Ticks every second on the client. Used to gate UI on real-time deadlines
 *  rather than the (≤10s stale) server-rendered phase. */
function useNowSeconds(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function formatRemaining(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
const PHASE_RESOLVED = 2;

export function VotePanel(props: Props) {
  const { isConnected, address } = useAccount();
  const [localBondPosted, setLocalBondPosted] = useState(false);
  const bondRequired = BigInt(props.creatorBond) > 0n;
  const bondPosted = props.bondPosted || localBondPosted;
  const bondPending = bondRequired && !bondPosted;
  const isCreator = address?.toLowerCase() === props.creator.toLowerCase();

  useEffect(() => {
    setLocalBondPosted(false);
  }, [props.market, props.creatorBond]);

  // While the bond is pending, the contract rejects commitVote. Hide the
  // commit/reveal/withdraw card entirely so voters don't see a button that
  // can't fire. The creator still sees the BondBanner with the post-bond CTA;
  // resolved markets bypass this gate so withdrawals always work.
  const isResolved = props.phase === PHASE_RESOLVED;
  if (bondPending && !isResolved) {
    return (
      <BondBanner
        {...props}
        isConnected={isConnected}
        isCreator={isCreator}
        onBondPosted={() => setLocalBondPosted(true)}
      />
    );
  }

  const bondAmount = BigInt(props.creatorBond);
  const hasBond = bondAmount > 0n && bondPosted;
  return (
    <section className="card vote-panel">
      <h2>Your move</h2>
      <div
        className={`bond-hero bond-hero-lg${hasBond ? "" : " bond-hero-empty"}`}
        title={hasBond ? "Creator bond joins the winner pool" : "No creator bond on this market"}
      >
        <span className="bond-hero-label">{hasBond ? "Bonus pot" : "Creator bond"}</span>
        <span className="bond-hero-amount">
          {hasBond ? (
            <>
              +{formatBondAmount(bondAmount, props.decimals)}{" "}
              <span className="bond-hero-symbol">{props.symbol}</span>
            </>
          ) : (
            "None"
          )}
        </span>
      </div>
      {!isConnected ? <ConnectPrompt /> : <ChainGate {...props} />}
    </section>
  );
}

function formatBondAmount(amount: bigint, decimals: number): string {
  const raw = formatUnits(amount, decimals);
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  if (num >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function BondBanner({
  market,
  stakeToken,
  decimals,
  symbol,
  creatorBond,
  isConnected,
  isCreator,
  chainId,
  onBondPosted,
}: Props & { isConnected: boolean; isCreator: boolean; onBondPosted: () => void }) {
  const bondAmount = BigInt(creatorBond);
  const router = useRouter();
  const walletChainId = useChainId();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();
  const [status, setStatus] = useState<Status>({ kind: "", message: "" });
  const [busy, setBusy] = useState(false);

  const allowance = useReadContract({
    address: stakeToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, market] : undefined,
    query: { enabled: Boolean(address) && isCreator, refetchInterval: 4000 },
  });
  const allowanceVal = (allowance.data as bigint | undefined) ?? 0n;
  const needsApprove = allowanceVal < bondAmount;
  const wrongChain = walletChainId !== chainId;

  const { isLoading: txMining } = useWaitForTransactionReceipt({ hash: pendingTx });

  async function onApprove() {
    if (!address) return;
    setBusy(true);
    setStatus({ kind: "info", message: "Approving stake token…" });
    try {
      const hash = await writeContractAsync({
        address: stakeToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [market, bondAmount],
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      await allowance.refetch();
      setStatus({ kind: "success", message: "Approved. Post the bond to open commits." });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onPost() {
    if (!address) return;
    let posted = false;
    setBusy(true);
    setStatus({ kind: "info", message: "Posting bond…" });
    try {
      const hash = await writeContractAsync({
        address: market,
        abi: truthMarketAbi,
        functionName: "postBond",
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setStatus({ kind: "success", message: "Bond posted. Voters can now commit." });
      setBusy(false);
      posted = true;
      onBondPosted();
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      if (!posted) setBusy(false);
    }
  }

  const amountStr = `${formatUnits(bondAmount, decimals)} ${symbol}`;

  if (!isConnected) {
    return (
      <section className="card bond-banner bond-banner-pending">
        <div className="bond-banner-text">
          <h3>Waiting on the bond</h3>
          <p>The creator owes {amountStr} before voting opens. Connect — maybe it's you.</p>
        </div>
      </section>
    );
  }

  if (!isCreator) {
    return (
      <section className="card bond-banner bond-banner-pending">
        <div className="bond-banner-text">
          <h3>Waiting on the bond</h3>
          <p>
            Creator owes {amountStr} before voting opens. Check back — or ping them to drop by.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card bond-banner bond-banner-creator">
      <div className="bond-banner-text">
        <h3>Your bond is still pending</h3>
        <p>
          You sweetened the pot with {amountStr}. Drop it in to open voting. Two clicks: approve, then post.
        </p>
      </div>
      <div className="bond-banner-actions">
        {wrongChain ? (
          <p className="vote-status vote-status-error">Switch wallet to chain {chainId} first.</p>
        ) : needsApprove ? (
          <button type="button" className="primary" onClick={onApprove} disabled={busy}>
            {busy ? "Approving…" : `Approve ${amountStr}`}
          </button>
        ) : (
          <button type="button" className="primary" onClick={onPost} disabled={busy}>
            {busy ? "Posting…" : `Post bond (${amountStr})`}
          </button>
        )}
      </div>
      {pendingTx && txMining ? <p className="vote-status vote-status-info">Mining {pendingTx.slice(0, 10)}…</p> : null}
      <StatusBanner status={status} />
    </section>
  );
}

function ConnectPrompt() {
  return (
    <div className="vote-connect">
      <p className="muted">Connect to commit, reveal, and claim.</p>
      <WalletConnect variant="inline" />
    </div>
  );
}

function ChainGate(props: Props) {
  const walletChainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  if (walletChainId !== props.chainId) {
    return (
      <div className="vote-chain-warn">
        <p>
          Wallet's on chain <code>{walletChainId}</code>. This claim lives on <code>{props.chainId}</code>.
        </p>
        <button type="button" onClick={() => switchChain({ chainId: props.chainId })} disabled={isPending}>
          {isPending ? "Switching…" : `Switch to ${props.chainId}`}
        </button>
      </div>
    );
  }
  if (props.phase === PHASE_VOTING) return <CommitPanel {...props} />;
  if (props.phase === PHASE_REVEAL) return <RevealPanel {...props} />;
  if (props.phase === PHASE_RESOLVED) return <WithdrawPanel {...props} />;
  return <p className="muted">Unknown phase.</p>;
}

function StatusBanner({ status }: { status: Status }) {
  if (!status.message) return null;
  return <p className={`vote-status vote-status-${status.kind}`}>{status.message}</p>;
}

function CommitPanel(props: Props) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const minStakeBig = useMemo(() => BigInt(props.minStake), [props.minStake]);
  const [direction, setDirection] = useState<Direction>("Yes");
  const [stakeInput, setStakeInput] = useState<string>(() =>
    formatUnits(minStakeBig === 0n ? parseUnits("1", props.decimals) : minStakeBig, props.decimals),
  );
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();
  const [status, setStatus] = useState<Status>({ kind: "", message: "" });
  const [busy, setBusy] = useState(false);

  const now = useNowSeconds();
  const votingDeadlineSec = Number(props.votingDeadline);
  const secondsLeft = now === null ? null : votingDeadlineSec - now;
  const votingClosed = secondsLeft !== null && secondsLeft <= 0;

  const stakeBig = useMemo(() => {
    try {
      return parseUnits(stakeInput || "0", props.decimals);
    } catch {
      return 0n;
    }
  }, [stakeInput, props.decimals]);
  const stakeBelowMin = stakeBig < minStakeBig;
  const existing = address ? readVault(props.market, address, props.chainId) : null;

  const allowance = useReadContract({
    address: props.stakeToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, props.market] : undefined,
    query: { enabled: Boolean(address) && !existing, refetchInterval: 4000 },
  });
  const allowanceVal = (allowance.data as bigint | undefined) ?? 0n;
  const needsApprove = stakeBig > 0n && allowanceVal < stakeBig;

  const { isLoading: txMining, isSuccess: txMined } = useWaitForTransactionReceipt({ hash: pendingTx });

  useEffect(() => {
    if (txMined && pendingTx) {
      setStatus({ kind: "success", message: `Confirmed in tx ${pendingTx.slice(0, 10)}…` });
    }
  }, [txMined, pendingTx]);

  if (existing) {
    return (
      <div className="vote-form">
        {votingClosed ? (
          <p className="vote-status vote-status-error">
            Voting's closed. Keep your reveal backup ready for the reveal phase.
          </p>
        ) : (
          <p className="muted">
            Your committed vote is already saved for this wallet and clone.
            {secondsLeft !== null ? <> Voting closes in <strong>{formatRemaining(secondsLeft)}</strong>.</> : null}
          </p>
        )}

        <div className="vote-existing">
          <span>
            Committed vote: <strong>{existing.vote === 1 ? "YES" : "NO"}</strong> · stake{" "}
            <code>{formatUnits(BigInt(existing.stake), props.decimals)} {props.symbol}</code>
          </span>
          <button type="button" className="vault-download" onClick={() => downloadVaultBackup(existing)}>
            Download reveal backup
          </button>
        </div>

        {pendingTx && txMining ? <p className="vote-status vote-status-info">Mining {pendingTx.slice(0, 10)}…</p> : null}
        <StatusBanner status={status} />
      </div>
    );
  }

  async function onApprove() {
    if (!address) return;
    setBusy(true);
    setStatus({ kind: "info", message: "Approving stake token…" });
    try {
      const hash = await writeContractAsync({
        address: props.stakeToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [props.market, stakeBig],
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      await allowance.refetch();
      setStatus({
        kind: "success",
        message: `Approved ${formatUnits(stakeBig, props.decimals)} ${props.symbol}. You're cleared to commit.`,
      });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (!address) return;
    if (stakeBig === 0n || stakeBelowMin) {
      setStatus({ kind: "error", message: `Stake must be ≥ ${formatUnits(minStakeBig, props.decimals)} ${props.symbol}.` });
      return;
    }
    setBusy(true);
    setStatus({ kind: "info", message: "Sealing your vote…" });
    try {
      const nonce = generateNonce();
      const vote: 1 | 2 = direction === "Yes" ? 1 : 2;
      const commitHash = computeCommitHash({
        vote,
        nonce,
        voter: address,
        chainId: props.chainId,
        contract: props.market,
      });

      setStatus({ kind: "info", message: "Sending it on-chain…" });
      const hash = await writeContractAsync({
        address: props.market,
        abi: truthMarketAbi,
        functionName: "commitVote",
        args: [commitHash, stakeBig],
      });
      setPendingTx(hash);

      const entry: VaultEntry = createVaultEntry({
        market: props.market,
        wallet: address,
        chainId: props.chainId,
        vote,
        nonce,
        stake: stakeBig.toString(),
        commitHash,
        txHash: hash,
      });
      writeVault(props.market, address, props.chainId, entry);

      await publicClient!.waitForTransactionReceipt({ hash });
      setStatus({
        kind: "success",
        message: `Locked in: ${formatUnits(stakeBig, props.decimals)} ${props.symbol} on ${direction.toUpperCase()}. Reveal nonce saved in this browser — back it up.`,
      });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const inputsDisabled = busy || votingClosed;

  return (
    <div className="vote-form">
      {votingClosed ? (
        <p className="vote-status vote-status-error">
          Voting's closed. Anyone can hit <strong>Resolve</strong> above — reveal and claim open after.
        </p>
      ) : (
        <p className="muted">
          Pick a side. Commit a hidden vote with stake. Reveal once voting ends.
          {secondsLeft !== null ? <> Closes in <strong>{formatRemaining(secondsLeft)}</strong>.</> : null}
        </p>
      )}

      <div className="vote-direction">
        <button
          type="button"
          className={`vote-dir vote-dir-yes ${direction === "Yes" ? "is-active" : ""}`}
          onClick={() => setDirection("Yes")}
          disabled={inputsDisabled}
        >
          YES
        </button>
        <button
          type="button"
          className={`vote-dir vote-dir-no ${direction === "No" ? "is-active" : ""}`}
          onClick={() => setDirection("No")}
          disabled={inputsDisabled}
        >
          NO
        </button>
      </div>

      <label className="vote-stake-input">
        <span>Stake ({props.symbol})</span>
        <input
          type="text"
          inputMode="decimal"
          value={stakeInput}
          onChange={(e) => setStakeInput(e.target.value)}
          disabled={inputsDisabled}
        />
        <small className="muted">
          Min: {formatUnits(minStakeBig, props.decimals)} {props.symbol} · 20% on the line.
        </small>
      </label>

      <div className="vote-actions">
        {needsApprove && !votingClosed ? (
          <button
            type="button"
            className="primary"
            onClick={onApprove}
            disabled={inputsDisabled || stakeBelowMin || stakeBig === 0n}
          >
            {busy ? "Approving…" : `Approve ${formatUnits(stakeBig, props.decimals)} ${props.symbol}`}
          </button>
        ) : null}
        <button
          type="button"
          className="primary"
          onClick={onCommit}
          disabled={inputsDisabled || needsApprove || stakeBelowMin || stakeBig === 0n}
        >
          {votingClosed
            ? "Voting closed"
            : busy
              ? "Committing…"
              : `Lock in ${direction.toUpperCase()}`}
        </button>
      </div>
      {pendingTx && txMining ? <p className="vote-status vote-status-info">Mining {pendingTx.slice(0, 10)}…</p> : null}
      <StatusBanner status={status} />
    </div>
  );
}

function RevealPanel(props: Props) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();
  const [status, setStatus] = useState<Status>({ kind: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [vault, setVault] = useState<VaultEntry | null>(null);

  useEffect(() => {
    if (address) setVault(readVault(props.market, address, props.chainId));
  }, [address, props.market, props.chainId]);

  const { isLoading: txMining } = useWaitForTransactionReceipt({ hash: pendingTx });

  const now = useNowSeconds();
  const revealDeadlineSec = Number(props.revealDeadline);
  const secondsLeft = now === null ? null : revealDeadlineSec - now;
  const revealClosed = secondsLeft !== null && secondsLeft <= 0;

  async function onReveal() {
    if (!address || !vault) return;
    setBusy(true);
    setStatus({ kind: "info", message: "Sending reveal…" });
    try {
      const hash = await writeContractAsync({
        address: props.market,
        abi: truthMarketAbi,
        functionName: "revealVote",
        args: [vault.vote, vault.nonce],
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setStatus({ kind: "success", message: "Vote revealed." });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!vault) {
    return (
      <div className="vote-form">
        <p className="muted">
          No reveal nonce in this browser. Reveals only work from the browser that committed — nonce lives in <code>localStorage</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="vote-form">
      {revealClosed ? (
        <p className="vote-status vote-status-error">
          Reveal window closed. Anyone can hit <strong>Resolve</strong> above — claim opens after.
        </p>
      ) : null}
      <p>
        Time to reveal · <strong>{vault.vote === 1 ? "YES" : "NO"}</strong> · stake{" "}
        <code>{formatUnits(BigInt(vault.stake), props.decimals)} {props.symbol}</code>
        {!revealClosed && secondsLeft !== null ? (
          <>
            {" "}· closes in <strong>{formatRemaining(secondsLeft)}</strong>
          </>
        ) : null}
      </p>
      <div className="vote-actions">
        <button type="button" className="primary" onClick={onReveal} disabled={busy || revealClosed}>
          {revealClosed ? "Reveal closed" : busy ? "Revealing…" : "Reveal it"}
        </button>
        <button type="button" className="vault-download" onClick={() => downloadVaultBackup(vault)}>
          Backup nonce
        </button>
      </div>
      {pendingTx && txMining ? <p className="vote-status vote-status-info">Mining {pendingTx.slice(0, 10)}…</p> : null}
      <StatusBanner status={status} />
    </div>
  );
}

function WithdrawPanel(props: Props) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();
  const [status, setStatus] = useState<Status>({ kind: "", message: "" });
  const [busy, setBusy] = useState(false);

  const preview = useReadContract({
    address: props.market,
    abi: truthMarketAbi,
    functionName: "previewPayout",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  });
  const previewVal = (preview.data as bigint | undefined) ?? 0n;

  const { isLoading: txMining, isSuccess: txMined } = useWaitForTransactionReceipt({ hash: pendingTx });

  useEffect(() => {
    if (!address) return;
    if (txMined && pendingTx) {
      clearVault(props.market, address, props.chainId);
    }
  }, [txMined, pendingTx, address, props.market]);

  async function onWithdraw() {
    if (!address) return;
    setBusy(true);
    setStatus({ kind: "info", message: "Cashing out…" });
    try {
      const hash = await writeContractAsync({
        address: props.market,
        abi: truthMarketAbi,
        functionName: "withdraw",
      });
      setPendingTx(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      setStatus({ kind: "success", message: "Paid out. Nice." });
      preview.refetch();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const outcomeLine = withdrawCopy(props.outcome, previewVal, props.decimals, props.symbol);

  return (
    <div className="vote-form">
      <p className={`withdraw-status withdraw-status-${outcomeClass(props.outcome)}`}>
        <strong>{outcomeLine.headline}</strong>
        {outcomeLine.detail ? <> · {outcomeLine.detail}</> : null}
      </p>
      {previewVal > 0n ? (
        <p className="muted">
          Ready to claim:{" "}
          <code>
            {formatUnits(previewVal, props.decimals)} {props.symbol}
          </code>
        </p>
      ) : null}
      <button type="button" className="primary" onClick={onWithdraw} disabled={busy || previewVal === 0n}>
        {busy
          ? "Cashing out…"
          : previewVal === 0n
            ? "Nothing to claim"
            : `Claim ${formatUnits(previewVal, props.decimals)} ${props.symbol}`}
      </button>
      {pendingTx && txMining ? <p className="vote-status vote-status-info">Mining {pendingTx.slice(0, 10)}…</p> : null}
      <StatusBanner status={status} />
    </div>
  );
}

function withdrawCopy(
  outcome: number,
  previewVal: bigint,
  decimals: number,
  symbol: string,
): { headline: string; detail?: string } {
  switch (outcome) {
    case 1: // Yes
      return {
        headline: "Verdict: YES",
        detail: previewVal > 0n ? "your stake + share of the slashed pool" : "no participating stake to claim",
      };
    case 2: // No
      return {
        headline: "Verdict: NO",
        detail: previewVal > 0n ? "your stake + share of the slashed pool" : "no participating stake to claim",
      };
    case 3: // Invalid
      return {
        headline: "Verdict: Invalid — full refund",
        detail:
          previewVal > 0n
            ? `your full ${formatUnits(previewVal, decimals)} ${symbol} stake comes back`
            : "no-show jurors forfeit their stake; otherwise nothing to claim",
      };
    default:
      return {
        headline: "Resolved",
        detail: previewVal > 0n ? "ready to claim" : "nothing to claim",
      };
  }
}

function outcomeClass(outcome: number): string {
  if (outcome === 1) return "yes";
  if (outcome === 2) return "no";
  if (outcome === 3) return "invalid";
  return "unknown";
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "shortMessage" in err) {
    return String((err as { shortMessage: string }).shortMessage);
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
