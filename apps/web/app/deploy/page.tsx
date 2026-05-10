"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  decodeEventLog,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { truthMarketRegistryAbi, registryAddress } from "../../lib/registry";
import { erc20Abi } from "../../lib/truthmarket";
import { presetsWithEnv, type TokenPreset } from "../../lib/tokens";
import { WalletConnect } from "../components/WalletConnect";

const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
const SECS_PER_MIN = 60n;

const ENV_STAKE_TOKEN = sanitizeAddress(process.env.NEXT_PUBLIC_STAKE_TOKEN);
const ENV_JURY_COMMITTER = sanitizeAddress(process.env.NEXT_PUBLIC_JURY_COMMITTER);
const TREASURY_HARDCODED: Address = "0x574F91bd4d8e83F84B62c3Ca75d24684813237Cc";
const SWARM_PUBLISH_TIMEOUT_MS = 45_000;

interface DurationPreset {
  label: string;
  totalMinutes: number;
}

const DURATION_PRESETS: DurationPreset[] = [
  { label: "5 min", totalMinutes: 5 },
  { label: "1 hour", totalMinutes: 60 },
  { label: "1 day", totalMinutes: 24 * 60 },
  { label: "1 week", totalMinutes: 7 * 24 * 60 },
];

interface JuryPreset {
  label: string;
  jurySize: number;
  minCommits: number;
  minRevealedJurors: number;
  hint: string;
}

const JURY_PRESETS: JuryPreset[] = [
  { label: "Small (max 3)", jurySize: 3, minCommits: 1, minRevealedJurors: 1, hint: "fast resolution, smaller pool" },
  { label: "Standard (max 5)", jurySize: 5, minCommits: 3, minRevealedJurors: 3, hint: "balanced" },
  { label: "Large (max 9)", jurySize: 9, minCommits: 5, minRevealedJurors: 5, hint: "more deliberation" },
];

type StatusKind = "info" | "success" | "error" | "";
interface Status {
  kind: StatusKind;
  message: string;
}

interface FormState {
  name: string;
  description: string;
  tags: string;
  /** index into DURATION_PRESETS, or -1 for custom. */
  durationPresetIdx: number;
  customMinutes: string;
  /** index into JURY_PRESETS, or -1 for custom. */
  juryPresetIdx: number;
  customJurySize: string;
  customMinCommits: string;
  customMinRevealedJurors: string;
  minStake: string;
  /** Optional creator-funded subsidy in token units (decimal). "" = no bond. */
  creatorBond: string;
  /** Selected token preset address, or "custom" for the customAddr below. */
  selectedTokenKey: string;
  customTokenAddr: string;
}

function defaultForm(presets: TokenPreset[]): FormState {
  return {
    name: "",
    description: "",
    tags: "",
    durationPresetIdx: 1, // 1 hour
    customMinutes: "60",
    juryPresetIdx: 0, // small
    customJurySize: "3",
    customMinCommits: "1",
    customMinRevealedJurors: "1",
    minStake: "1",
    creatorBond: "",
    selectedTokenKey: presets[0]?.address ?? "custom",
    customTokenAddr: "",
  };
}

function splitDuration(totalMinutes: number): { voting: bigint; admin: bigint; reveal: bigint } {
  // 40/20/40 split — same convention as the apify agent. Each phase enforced
  // ≥1 min by the contract; clamp to keep tiny totals deployable.
  const voting = Math.max(1, Math.round(totalMinutes * 0.4));
  const admin = Math.max(1, Math.round(totalMinutes * 0.2));
  const reveal = Math.max(1, totalMinutes - voting - admin);
  return {
    voting: BigInt(voting),
    admin: BigInt(admin),
    reveal: BigInt(Math.max(1, reveal)),
  };
}

export default function DeployPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const presets = useMemo(() => presetsWithEnv(DEFAULT_CHAIN_ID, ENV_STAKE_TOKEN), []);
  const [form, setForm] = useState<FormState>(() => defaultForm(presets));
  const [pendingTx, setPendingTx] = useState<Hex | undefined>();
  const [status, setStatus] = useState<Status>({ kind: "", message: "" });
  const [busy, setBusy] = useState(false);

  const selectedPreset = presets.find((p) => p.address === form.selectedTokenKey);
  const customTokenValid =
    form.selectedTokenKey === "custom" &&
    form.customTokenAddr.trim().length > 0 &&
    isAddress(form.customTokenAddr.trim());
  const stakeTokenAddr: Address | undefined = selectedPreset
    ? selectedPreset.address
    : customTokenValid
      ? (form.customTokenAddr.trim() as Address)
      : undefined;

  // Live token-meta lookup. For known presets we already have symbol/decimals,
  // but verify on-chain in case a label is stale; for custom we depend on it.
  const tokenMeta = useReadContracts({
    contracts: stakeTokenAddr
      ? [
          { address: stakeTokenAddr, abi: erc20Abi, functionName: "symbol" },
          { address: stakeTokenAddr, abi: erc20Abi, functionName: "decimals" },
        ]
      : [],
    query: { enabled: Boolean(stakeTokenAddr) },
  });
  const symbol =
    (tokenMeta.data?.[0]?.result as string | undefined) ?? selectedPreset?.symbol ?? "TOKEN";
  const decimals = Number(tokenMeta.data?.[1]?.result ?? selectedPreset?.decimals ?? 18);

  const juryCommitterAddr = (ENV_JURY_COMMITTER as Address | undefined) ?? address;

  const receipt = useWaitForTransactionReceipt({ hash: pendingTx });

  useEffect(() => {
    if (!receipt.data || !registryAddress) return;
    try {
      let market: Address | undefined;
      for (const log of receipt.data.logs) {
        if (log.address.toLowerCase() !== registryAddress.toLowerCase()) continue;
        const decoded = decodeEventLog({ abi: truthMarketRegistryAbi, data: log.data, topics: log.topics });
        if (decoded.eventName === "MarketCreated") {
          const args = decoded.args as { id: bigint; market: Address; creator: Address };
          market = args.market;
          break;
        }
        if (decoded.eventName === "MarketRegistered") {
          const args = decoded.args as { market: Address; creator: Address; index: bigint; registeredAt: bigint };
          market = args.market;
          break;
        }
      }
      if (market) {
        setStatus({ kind: "success", message: `Live at ${market}. Taking you there…` });
        router.push(`/markets/${market}`);
        return;
      }
      setStatus({ kind: "error", message: "Mined, but couldn't find the launch event." });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  }, [receipt.data, router]);

  const validation = useMemo(() => validate(form), [form]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyJuryPreset(idx: number) {
    if (idx < 0 || idx >= JURY_PRESETS.length) {
      update("juryPresetIdx", -1);
      return;
    }
    const p = JURY_PRESETS[idx];
    setForm((prev) => ({
      ...prev,
      juryPresetIdx: idx,
      customJurySize: String(p.jurySize),
      customMinCommits: String(p.minCommits),
      customMinRevealedJurors: String(p.minRevealedJurors),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!registryAddress) {
      setStatus({ kind: "error", message: "Registry address not configured." });
      return;
    }
    if (!stakeTokenAddr) {
      setStatus({ kind: "error", message: "Pick a token." });
      return;
    }
    if (!isConnected || !address) {
      setStatus({ kind: "error", message: "Wallet first." });
      return;
    }
    if (walletChainId !== DEFAULT_CHAIN_ID) {
      setStatus({ kind: "error", message: `Switch to chain ${DEFAULT_CHAIN_ID} first.` });
      return;
    }
    if (!validation.ok || !validation.spec) {
      setStatus({ kind: "error", message: validation.errors.join(" · ") });
      return;
    }

    setBusy(true);
    setStatus({ kind: "info", message: "Stashing the claim on Swarm…" });

    try {
      const claimDoc = await publishClaimDocument(validation.spec);
      const marketSpec = buildMarketSpec({
        v: validation.spec,
        swarmReference: claimDoc.referenceBytes,
        stakeToken: stakeTokenAddr,
        juryCommitter: juryCommitterAddr ?? address,
        decimals,
      });
      setStatus({ kind: "info", message: "Claim stored. Sign to launch…" });
      const hash = await writeContractAsync({
        address: registryAddress,
        abi: truthMarketRegistryAbi,
        functionName: "createMarket",
        args: [marketSpec],
      });
      setPendingTx(hash);
      setStatus({ kind: "info", message: `Tx ${hash.slice(0, 10)}… submitted. Mining…` });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!registryAddress) {
    return (
      <main className="page-shell">
        <section className="empty-state">
          <h1>No registry wired up</h1>
          <p>Set <code>NEXT_PUBLIC_REGISTRY_ADDRESS</code> in <code>apps/web/.env</code>.</p>
        </section>
      </main>
    );
  }

  const totalMinutes = totalMinutesForForm(form);
  const phases = totalMinutes !== null ? splitDuration(totalMinutes) : null;
  const formEditable = isConnected && walletChainId === DEFAULT_CHAIN_ID;
  const formReady = formEditable && Boolean(stakeTokenAddr);

  return (
    <main className="page-shell deploy-page">
      <header className="page-header">
        <p className="eyebrow">Launch</p>
        <h1>Put truth on the line.</h1>
        <p className="page-header-sub">
          Three steps. Smart defaults. Write the claim, set the stake, ship it.
        </p>
      </header>

      {!isConnected ? (
        <WalletConnect
          title="Connect to launch"
          subtitle={`Wallet on chain ${DEFAULT_CHAIN_ID} with a touch of ETH for gas.`}
        />
      ) : walletChainId !== DEFAULT_CHAIN_ID ? (
        <section className="card vote-chain-warn">
          <p>
            Your wallet is on chain <code>{walletChainId}</code>. Launches go to chain{" "}
            <code>{DEFAULT_CHAIN_ID}</code>.
          </p>
          <button type="button" onClick={() => switchChain({ chainId: DEFAULT_CHAIN_ID })} disabled={isSwitching}>
            {isSwitching ? "Switching…" : `Switch to ${DEFAULT_CHAIN_ID}`}
          </button>
        </section>
      ) : null}

      <form className="deploy-form-v2" onSubmit={onSubmit} aria-disabled={!formEditable}>
        <section className="step">
          <StepHeader number={1} title="What's the claim?" />
          <input
            className="step-name-input"
            type="text"
            placeholder="e.g. Will agents close more support tickets than humans this week?"
            aria-label="Claim title"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            disabled={!formEditable}
          />
          <textarea
            className="step-description"
            rows={6}
            placeholder="Spell out YES and NO in concrete terms. What evidence counts? What's the cutoff? When does it resolve Invalid? The clearer the rules, the cleaner the verdict."
            aria-label="Detailed YES/NO resolution rules"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            disabled={!formEditable}
          />
          <div className="step-meta-row">
            <input
              type="text"
              placeholder="Tags (comma-separated, optional)"
              aria-label="Tags"
              value={form.tags}
              onChange={(e) => update("tags", e.target.value)}
              disabled={!formEditable}
            />
          </div>
        </section>

        <section className="step">
          <StepHeader number={2} title="What's on the line?" />
          <div className="chip-row" role="radiogroup" aria-label="Stake token">
            {presets.map((p) => (
              <Chip
                key={p.address}
                label={p.label}
                sublabel={p.symbol}
                active={form.selectedTokenKey === p.address}
                onSelect={() => update("selectedTokenKey", p.address)}
                disabled={!formEditable}
              />
            ))}
            <Chip
              label="Custom address"
              sublabel="0x…"
              active={form.selectedTokenKey === "custom"}
              onSelect={() => update("selectedTokenKey", "custom")}
              disabled={!formEditable}
            />
          </div>
          {form.selectedTokenKey === "custom" ? (
            <input
              className="step-custom-input"
              type="text"
              placeholder="0x… ERC-20 contract address"
              value={form.customTokenAddr}
              onChange={(e) => update("customTokenAddr", e.target.value)}
              disabled={!formEditable}
            />
          ) : selectedPreset?.description ? (
            <p className="muted step-hint">{selectedPreset.description}</p>
          ) : null}

          {stakeTokenAddr ? (
            <div className="step-stake-row">
              <label className="step-stake-input">
                <span>Min stake per vote</span>
                <div className="step-stake-value">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.minStake}
                    onChange={(e) => update("minStake", e.target.value)}
                    disabled={!formEditable}
                  />
                  <span>{symbol}</span>
                </div>
              </label>
              <p className="muted step-hint">
                20% of every stake gets slashed. Losers fund the winners.
              </p>
              <label className="step-stake-input">
                <span>Creator bond (optional)</span>
                <div className="step-stake-value">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={form.creatorBond}
                    onChange={(e) => update("creatorBond", e.target.value)}
                    disabled={!formEditable}
                  />
                  <span>{symbol}</span>
                </div>
              </label>
              <p className="muted step-hint">
                Sweeten the pot. Joins the winner payout on Yes/No · refunds to you on Invalid. Voters wait until you post it. Leave blank to skip.
              </p>
            </div>
          ) : (
            <p className="muted step-hint">Pick a token to set the min stake.</p>
          )}
        </section>

        <section className="step">
          <StepHeader number={3} title="How long is it open?" />
          <div className="chip-row" role="radiogroup" aria-label="Market duration">
            {DURATION_PRESETS.map((d, i) => (
              <Chip
                key={d.label}
                label={d.label}
                active={form.durationPresetIdx === i}
                onSelect={() => update("durationPresetIdx", i)}
                disabled={!formEditable}
              />
            ))}
            <Chip
              label="Custom"
              active={form.durationPresetIdx === -1}
              onSelect={() => update("durationPresetIdx", -1)}
              disabled={!formEditable}
            />
          </div>
          {form.durationPresetIdx === -1 ? (
            <label className="step-custom-input-row">
              <span>Total minutes</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.customMinutes}
                onChange={(e) => update("customMinutes", e.target.value)}
                disabled={!formEditable}
              />
            </label>
          ) : null}
          {phases ? (
            <ol className="phase-preview">
              <li>
                <span>Voting open</span>
                <strong>{formatMins(Number(phases.voting))}</strong>
              </li>
              <li>
                <span>Jury draws</span>
                <strong>{formatMins(Number(phases.admin))}</strong>
              </li>
              <li>
                <span>Reveal</span>
                <strong>{formatMins(Number(phases.reveal))}</strong>
              </li>
            </ol>
          ) : null}
        </section>

        <details className="advanced-disclosure">
          <summary>Advanced — jury size</summary>
          <div className="advanced-body">
            <div className="chip-row" role="radiogroup" aria-label="Jury sizing">
              {JURY_PRESETS.map((j, i) => (
                <Chip
                  key={j.label}
                  label={j.label}
                  sublabel={j.hint}
                  active={form.juryPresetIdx === i}
                  onSelect={() => applyJuryPreset(i)}
                  disabled={!formEditable}
                />
              ))}
              <Chip
                label="Custom"
                active={form.juryPresetIdx === -1}
                onSelect={() => update("juryPresetIdx", -1)}
                disabled={!formEditable}
              />
            </div>
            <div className="advanced-grid">
              <SmallField
                label="Max jury size"
                value={form.customJurySize}
                onChange={(v) => update("customJurySize", v)}
                disabled={!formEditable || form.juryPresetIdx !== -1}
              />
              <SmallField
                label="Min commits"
                value={form.customMinCommits}
                onChange={(v) => update("customMinCommits", v)}
                disabled={!formEditable || form.juryPresetIdx !== -1}
              />
              <SmallField
                label="Min revealed jurors"
                value={form.customMinRevealedJurors}
                onChange={(v) => update("customMinRevealedJurors", v)}
                disabled={!formEditable || form.juryPresetIdx !== -1}
              />
            </div>
            <p className="muted step-hint">
              Draw size: largest odd ≤ min(max jury, max(min jurors, active votes × 15%)).
            </p>
          </div>
        </details>

        {validation.errors.length > 0 && formEditable ? (
          <ul className="deploy-errors">
            {validation.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        ) : null}

        <div className="deploy-submit-row">
          <button type="submit" className="primary deploy-submit" disabled={!formReady || busy || !validation.ok}>
            {busy ? "Launching…" : "Launch it"}
          </button>
          {pendingTx ? <span className="muted">tx {pendingTx.slice(0, 10)}…</span> : null}
        </div>
        <StatusBanner status={status} />
      </form>

      <footer className="deploy-footer">
        <p className="muted">
          Protocol takes <strong>1%</strong> of the slashed pool · Treasury{" "}
          <code title={TREASURY_HARDCODED}>{shortAddress(TREASURY_HARDCODED)}</code> · Registry{" "}
          <code title={registryAddress}>{shortAddress(registryAddress)}</code>
          {address ? (
            <>
              {" "}· You <code title={address}>{shortAddress(address)}</code>
            </>
          ) : null}
        </p>
        <p className="muted">
          Each claim deploys its own clone. <Link href="/">← Back to claims</Link>
        </p>
      </footer>
    </main>
  );
}

function totalMinutesForForm(form: FormState): number | null {
  if (form.durationPresetIdx >= 0 && form.durationPresetIdx < DURATION_PRESETS.length) {
    return DURATION_PRESETS[form.durationPresetIdx].totalMinutes;
  }
  const trimmed = form.customMinutes.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 3) return null;
  return n;
}

function formatMins(m: number): string {
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h} h` : `${h}h ${rem}m`;
  }
  const d = Math.floor(m / (24 * 60));
  const remH = Math.floor((m % (24 * 60)) / 60);
  return remH === 0 ? `${d} d` : `${d}d ${remH}h`;
}

function StepHeader({ number, title }: { number: number; title: string }) {
  return (
    <h2 className="step-header">
      <span className="step-number">{number}</span>
      <span>{title}</span>
    </h2>
  );
}

function Chip({
  label,
  sublabel,
  active,
  onSelect,
  disabled,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`chip ${active ? "is-active" : ""}`}
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      disabled={disabled}
    >
      <span className="chip-label">{label}</span>
      {sublabel ? <span className="chip-sub">{sublabel}</span> : null}
    </button>
  );
}

function SmallField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="small-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function StatusBanner({ status }: { status: Status }) {
  if (!status.message) return null;
  return <p className={`vote-status vote-status-${status.kind}`}>{status.message}</p>;
}

interface ValidatedSpec {
  name: string;
  description: string;
  tags: string[];
  votingMinutes: bigint;
  adminMinutes: bigint;
  revealMinutes: bigint;
  minStakeRaw: string;
  /** "" = no bond, otherwise a decimal-token-units string. */
  creatorBondRaw: string;
  jurySize: number;
  minCommits: number;
  minRevealedJurors: number;
}

function validate(form: FormState): { ok: boolean; errors: string[]; spec: ValidatedSpec | null } {
  const errors: string[] = [];

  const name = form.name.trim();
  const description = form.description.trim();
  const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);

  if (!name) errors.push("Give the claim a title.");
  if (new TextEncoder().encode(name).length > 120) errors.push("Title too long (>120 bytes).");
  if (!description) errors.push("Spell out YES and NO.");
  if (new TextEncoder().encode(description).length > 4096) errors.push("Rules too long (>4096 bytes).");
  if (tags.length > 5) errors.push("Max 5 tags.");
  for (const t of tags) {
    if (new TextEncoder().encode(t).length > 32) errors.push(`Tag "${t}" too long.`);
  }

  const totalMinutes = totalMinutesForForm(form);
  if (totalMinutes === null) {
    errors.push("Duration: at least 3 minutes.");
  }
  const phases = totalMinutes !== null ? splitDuration(totalMinutes) : null;

  const jurySize = parseIntField("Max jury size", form.customJurySize, 1, 100, errors);
  if (jurySize !== null && jurySize % 2 === 0) errors.push("Max jury size must be odd.");
  const minCommits = parseIntField("Min commits", form.customMinCommits, 1, 1_000_000, errors);
  const minRevealedJurors = parseIntField("Min revealed jurors", form.customMinRevealedJurors, 1, 1_000_000, errors);

  if (jurySize !== null && minRevealedJurors !== null && minRevealedJurors > jurySize) {
    errors.push("Min revealed jurors can't exceed jury size.");
  }
  if (minRevealedJurors !== null && minRevealedJurors % 2 === 0) {
    errors.push("Min revealed jurors must be odd.");
  }
  if (minCommits !== null && minRevealedJurors !== null && minCommits < minRevealedJurors) {
    errors.push("Min commits must be at least min revealed jurors.");
  }

  const minStakeRaw = form.minStake.trim();
  if (!minStakeRaw || Number(minStakeRaw) <= 0) errors.push("Min stake must be greater than 0.");

  const creatorBondRaw = form.creatorBond.trim();
  if (creatorBondRaw && (!/^[0-9]+(\.[0-9]+)?$/.test(creatorBondRaw) || Number(creatorBondRaw) < 0)) {
    errors.push("Creator bond must be 0 or more.");
  }

  if (
    errors.length > 0 ||
    phases === null ||
    jurySize === null ||
    minCommits === null ||
    minRevealedJurors === null
  ) {
    return { ok: false, errors, spec: null };
  }

  return {
    ok: true,
    errors: [],
    spec: {
      name,
      description,
      tags,
      votingMinutes: phases.voting,
      adminMinutes: phases.admin,
      revealMinutes: phases.reveal,
      minStakeRaw,
      creatorBondRaw,
      jurySize,
      minCommits,
      minRevealedJurors,
    },
  };
}

interface FactoryMarketSpec {
  stakeToken: Address;
  juryCommitter: Address;
  swarmReference: Hex;
  votingPeriod: bigint;
  adminTimeout: bigint;
  revealPeriod: bigint;
  minStake: bigint;
  jurySize: number;
  minCommits: number;
  maxCommits: number;
  minRevealedJurors: number;
  creatorBond: bigint;
}

function buildMarketSpec(args: {
  v: ValidatedSpec;
  swarmReference: Hex;
  stakeToken: Address;
  juryCommitter: Address;
  decimals: number;
}): FactoryMarketSpec {
  const { v, swarmReference, stakeToken, juryCommitter, decimals } = args;
  return {
    stakeToken,
    juryCommitter,
    swarmReference,
    votingPeriod: v.votingMinutes * SECS_PER_MIN,
    adminTimeout: v.adminMinutes * SECS_PER_MIN,
    revealPeriod: v.revealMinutes * SECS_PER_MIN,
    minStake: parseUnits(v.minStakeRaw, decimals),
    jurySize: v.jurySize,
    minCommits: v.minCommits,
    maxCommits: 0,
    minRevealedJurors: v.minRevealedJurors,
    creatorBond: v.creatorBondRaw ? parseUnits(v.creatorBondRaw, decimals) : 0n,
  };
}

async function publishClaimDocument(v: ValidatedSpec): Promise<{ referenceBytes: Hex }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SWARM_PUBLISH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/swarm/claim-doc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        title: v.name,
        context: v.description,
        tags: v.tags,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { referenceBytes?: Hex; error?: string };
    if (!res.ok || !body.referenceBytes) {
      throw new Error(body.error || "Could not store the claim document in Swarm.");
    }
    return { referenceBytes: body.referenceBytes };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        "Swarm timed out. Is Bee running? Check SWARM_BEE_API_URL and SWARM_POSTAGE_BATCH_ID.",
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseIntField(label: string, raw: string, min: number, max: number, errors: string[]): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    errors.push(`${label} is required.`);
    return null;
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n)) {
    errors.push(`${label} is not a valid integer.`);
    return null;
  }
  if (n < min) errors.push(`${label} must be ≥ ${min}.`);
  if (n > max) errors.push(`${label} must be ≤ ${max}.`);
  return n;
}

function sanitizeAddress(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || !isAddress(trimmed)) return undefined;
  return trimmed;
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
