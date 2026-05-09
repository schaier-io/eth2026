"use client";

import { FormEvent, useMemo, useState } from "react";

type Screen = "feed" | "create" | "stake" | "dashboard";
type Direction = "Up" | "Down";
type Stage = "Voting" | "Jury selection" | "Reveal" | "Resolved";
type StatusKind = "" | "error" | "success";

type Market = {
  id: string;
  symbol: string;
  title: string;
  description: string;
  phase: string;
  uiStage: Stage;
  stake: number;
  commits: number;
  jurySize: number;
  minRevealedJurors: number;
  revealedJurors: number;
  juryUpCount: number;
  juryDownCount: number;
  pool: number;
  timeLeft: string;
  deadlineLabel: string;
  upPercent: number;
  image?: string | null;
  upMeaning: string;
  downMeaning: string;
  randomness: string;
  auditHash: string;
  jurors: string[];
};

type Position = {
  marketId: string;
  direction: Direction;
  stake: number;
  conviction: number;
  risked: number;
  commitmentHash: string;
};

const initialMarkets: Market[] = [
  {
    id: "agent-support",
    symbol: "AS",
    title: "Will agents close more support tickets than humans this week?",
    description: "A live claim about whether autonomous agents beat the human support queue under the locked rules.",
    phase: "Voting",
    uiStage: "Voting",
    stake: 18420,
    commits: 173,
    jurySize: 9,
    minRevealedJurors: 6,
    revealedJurors: 0,
    juryUpCount: 0,
    juryDownCount: 0,
    pool: 2310,
    timeLeft: "3h 12m",
    deadlineLabel: "Voting closes in 3h 12m",
    upPercent: 63,
    upMeaning: "Agents close a higher count of qualifying tickets before the cutoff.",
    downMeaning: "Humans close an equal or higher count of qualifying tickets before the cutoff.",
    randomness: "0x4f3a9b682dd4399f0291c8",
    auditHash: "0xb71ce3d96b100d2a42aa",
    jurors: ["0x3f2a...91E0", "agent.alice.eth", "0x71B4...0D2c", "0xA902...66Fd", "ops-voter.eth"],
  },
  {
    id: "gpu-clearing",
    symbol: "GPU",
    title: "Will spot GPU rental clear below 2.20 TMT per hour?",
    description: "A pricing claim resolved by selected staked belief, not an external truth source.",
    phase: "Reveal",
    uiStage: "Reveal",
    stake: 12670,
    commits: 98,
    jurySize: 7,
    minRevealedJurors: 5,
    revealedJurors: 3,
    juryUpCount: 2,
    juryDownCount: 1,
    pool: 1780,
    timeLeft: "54m",
    deadlineLabel: "Reveal closes in 54m",
    upPercent: 48,
    upMeaning: "The clearing price is below the rule-defined threshold.",
    downMeaning: "The clearing price is at or above the rule-defined threshold.",
    randomness: "0x86dec4b51d910754bb",
    auditHash: "0x2c0184ac7791fe29",
    jurors: ["0x9931...912a", "juror.base.eth", "0x20E0...B81c", "0x8f04...9170", "agent-17.eth"],
  },
  {
    id: "governance-ship",
    symbol: "JURY",
    title: "Will public jury replay tooling ship by Friday?",
    description: "A product-shipping claim for the auditability layer around SpaceComputer jury selection.",
    phase: "Voting",
    uiStage: "Jury selection",
    stake: 9310,
    commits: 61,
    jurySize: 5,
    minRevealedJurors: 3,
    revealedJurors: 0,
    juryUpCount: 0,
    juryDownCount: 0,
    pool: 890,
    timeLeft: "1d 4h",
    deadlineLabel: "Waiting for randomness",
    upPercent: 71,
    upMeaning: "The replay tool is public and reproduces the selected jury.",
    downMeaning: "The replay tool is missing, private, or cannot reproduce the selected jury.",
    randomness: "Pending",
    auditHash: "Pending",
    jurors: [],
  },
  {
    id: "model-release",
    symbol: "AI",
    title: "Will an open model top the coding benchmark this month?",
    description: "A fast-moving AI claim with hidden Up/Down positions until reveal.",
    phase: "Voting",
    uiStage: "Voting",
    stake: 22140,
    commits: 204,
    jurySize: 11,
    minRevealedJurors: 7,
    revealedJurors: 0,
    juryUpCount: 0,
    juryDownCount: 0,
    pool: 3180,
    timeLeft: "8h 41m",
    deadlineLabel: "Voting closes in 8h 41m",
    upPercent: 58,
    upMeaning: "An open model takes the top published score under the claim/rules document.",
    downMeaning: "No open model takes the top published score under the claim/rules document.",
    randomness: "Pending",
    auditHash: "Pending",
    jurors: [],
  },
];

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textEncoder(value: string) {
  return new TextEncoder().encode(value);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder(value));
  return `0x${bytesToHex(new Uint8Array(digest))}`;
}

async function walletKey(wallet: string | null) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder(`truthmarket-demo:${wallet || "offline"}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: textEncoder("truthmarket-local-reveal-vault"),
      iterations: 120000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptVaultPayload(payload: unknown, wallet: string | null) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await walletKey(wallet);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder(JSON.stringify(payload)));
  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
  };
}

function vaultKey(marketId: string) {
  return `truthmarket:vault:${marketId}`;
}

function formatToken(value: number | string) {
  return `${Number(value).toLocaleString()} TMT`;
}

function shortHash(value: string) {
  if (!value || value.length < 16) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function lifecycleIndex(stage: Stage) {
  return ["Voting", "Jury selection", "Reveal", "Resolved"].indexOf(stage);
}

function processCopy(market: Market, position: Position | null) {
  if (market.uiStage === "Voting") {
    return position
      ? "Your committed position is hidden. The next automated check is voting close, then the jury draw."
      : "Commit before voting closes to enter the jury pool.";
  }
  if (market.uiStage === "Jury selection") {
    return "Voting is closed. The jury committer should fetch SpaceComputer randomness and call commitJury.";
  }
  if (market.uiStage === "Reveal") {
    return "Reveal is open. Everyone who committed should reveal; selected jurors are under the strongest penalty.";
  }
  return "The market is resolved. Revealed voters can withdraw according to the settlement rules.";
}

function nextStepCopy(market: Market, position: Position | null) {
  if (!position) return ["No position in this market yet.", "Open a market and commit Up or Down."];
  if (market.uiStage === "Voting") {
    return ["Keep the reveal key in this browser.", "Reminder: reveal opens after jury selection.", "You do not need to do anything until the reveal window opens."];
  }
  if (market.uiStage === "Jury selection") {
    return ["Waiting for SpaceComputer randomness.", "Once jurors are selected, check whether your wallet was selected.", "Reveal will open immediately after commitJury succeeds."];
  }
  if (market.uiStage === "Reveal") {
    return ["Reveal your position before the deadline.", "If you are selected as a juror and skip reveal, full stake is forfeited.", "Non-jurors also reveal to settle and avoid losing risked stake."];
  }
  return ["Market resolved.", "Withdraw your payout.", "Review settlement in developer settings if needed."];
}

function reminderCopy(market: Market, position: Position | null) {
  if (!position) return ["Connect wallet and commit to enable reminders."];
  if (market.uiStage === "Voting") {
    return [`Notify at voting close: ${market.deadlineLabel}.`, "Notify when jury is selected.", "Notify when reveal opens."];
  }
  if (market.uiStage === "Jury selection") {
    return ["Notify when SpaceComputer randomness is posted.", "Notify when selected jury appears on-chain."];
  }
  if (market.uiStage === "Reveal") {
    return [`Urgent: reveal before ${market.deadlineLabel.replace("Reveal closes in ", "")}.`, "Repeat reminder 15 minutes before close."];
  }
  return ["Notify when withdrawal is available."];
}

function symbolFromQuestion(question: string) {
  const words = question
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const symbol = words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return symbol || "NEW";
}

function StatusLine({ message, kind }: { message: string; kind: StatusKind }) {
  return (
    <p className={`inline-status${kind === "error" ? " is-error" : ""}${kind === "success" ? " is-success" : ""}`} role="status">
      {message}
    </p>
  );
}

function MarketArtwork({ market }: { market: Market }) {
  if (market.image) {
    return <img className="market-image" src={market.image} alt={`Reference artifact for ${market.title}`} />;
  }
  return (
    <div className="market-image empty-media" aria-hidden="true">
      <span>{market.symbol}</span>
    </div>
  );
}

export default function TruthMarketApp() {
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [screen, setScreen] = useState<Screen>("feed");
  const [selectedMarketId, setSelectedMarketId] = useState(initialMarkets[0].id);
  const [filter, setFilter] = useState<"Trending" | "New" | "Reveal soon">("Trending");
  const [direction, setDirection] = useState<Direction>("Up");
  const [wallet, setWallet] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [createImageData, setCreateImageData] = useState<string | null>(null);
  const [conviction, setConviction] = useState(25);
  const [stake, setStake] = useState(100);
  const [commitStatus, setCommitStatus] = useState({ message: "", kind: "" as StatusKind });
  const [createStatus, setCreateStatus] = useState({ message: "", kind: "" as StatusKind });
  const [revealStatus, setRevealStatus] = useState({ message: "", kind: "" as StatusKind });
  const [isCommitting, setIsCommitting] = useState(false);

  const selectedMarket = markets.find((market) => market.id === selectedMarketId) || markets[0];
  const positionForSelected = currentPosition?.marketId === selectedMarket.id ? currentPosition : null;
  const risked = Math.max(0, (stake * conviction) / 100);
  const refundable = Math.max(0, stake - risked);

  const visibleMarkets = useMemo(() => {
    if (filter === "New") return [...markets].reverse();
    if (filter === "Reveal soon") return markets.filter((market) => market.uiStage === "Reveal");
    return markets;
  }, [filter, markets]);

  function showScreen(nextScreen: Screen) {
    setScreen(nextScreen);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function openMarket(marketId: string) {
    setSelectedMarketId(marketId);
    setDirection("Up");
    setRevealed(false);
    setCommitStatus({ message: "", kind: "" });
    showScreen("stake");
  }

  function handleConnectWallet() {
    setWallet("0x7a18...c9E2");
  }

  function handleCreateImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setCreateImageData(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCreateStatus({ message: "Upload an image file.", kind: "error" });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setCreateImageData(String(reader.result));
      setCreateStatus({ message: "", kind: "" });
    });
    reader.addEventListener("error", () => {
      setCreateStatus({ message: "Could not read image.", kind: "error" });
    });
    reader.readAsDataURL(file);
  }

  function handleCreateMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("question") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const upMeaning = String(formData.get("upMeaning") || "").trim();
    const downMeaning = String(formData.get("downMeaning") || "").trim();
    const jurySize = Number.parseInt(String(formData.get("jurySize") || ""), 10);
    const minRevealedJurors = Number.parseInt(String(formData.get("minRevealed") || ""), 10);
    const votingWindow = String(formData.get("votingWindow") || "12h");
    const symbol = (String(formData.get("symbol") || "").trim() || symbolFromQuestion(title)).slice(0, 5).toUpperCase();

    if (!title || !description || !upMeaning || !downMeaning) {
      setCreateStatus({ message: "Add the question, description, and both outcome meanings.", kind: "error" });
      return;
    }
    if (!Number.isFinite(jurySize) || jurySize < 1 || jurySize % 2 === 0) {
      setCreateStatus({ message: "Jury size must be an odd number.", kind: "error" });
      return;
    }
    if (!Number.isFinite(minRevealedJurors) || minRevealedJurors < 1 || minRevealedJurors > jurySize) {
      setCreateStatus({ message: "Minimum revealed jurors must be between 1 and jury size.", kind: "error" });
      return;
    }

    const market: Market = {
      id: `custom-${Date.now()}`,
      symbol,
      title,
      description,
      phase: "Voting",
      uiStage: "Voting",
      stake: 0,
      commits: 0,
      jurySize,
      minRevealedJurors,
      revealedJurors: 0,
      juryUpCount: 0,
      juryDownCount: 0,
      pool: 0,
      timeLeft: votingWindow,
      deadlineLabel: `Voting closes in ${votingWindow}`,
      upPercent: 50,
      image: createImageData,
      upMeaning,
      downMeaning,
      randomness: "Pending",
      auditHash: "Pending",
      jurors: [],
    };

    setMarkets((current) => [market, ...current]);
    setSelectedMarketId(market.id);
    setDirection("Up");
    setCurrentPosition(null);
    setRevealed(false);
    setCreateImageData(null);
    setCreateStatus({ message: "", kind: "" });
    form.reset();
    showScreen("stake");
  }

  async function handleCommit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet) {
      setCommitStatus({ message: "Connect wallet first.", kind: "error" });
      return;
    }
    if (!Number.isFinite(stake) || stake < 10) {
      setCommitStatus({ message: "Minimum stake is 10 TMT.", kind: "error" });
      return;
    }

    setIsCommitting(true);
    setCommitStatus({ message: "Committing hidden position...", kind: "" });
    try {
      const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
      const nonce = `0x${bytesToHex(nonceBytes)}`;
      const vote = direction === "Up" ? 1 : 2;
      const commitmentHash = await sha256Hex(`${vote}|${nonce}|${wallet}|${selectedMarket.id}`);
      const encrypted = await encryptVaultPayload(
        {
          marketId: selectedMarket.id,
          wallet,
          direction,
          vote,
          nonce,
          commitmentHash,
          stake,
          convictionBps: conviction * 100,
        },
        wallet,
      );

      localStorage.setItem(vaultKey(selectedMarket.id), JSON.stringify(encrypted));
      setCurrentPosition({
        marketId: selectedMarket.id,
        direction,
        stake,
        conviction,
        risked,
        commitmentHash,
      });
      setRevealed(false);
      setCommitStatus({ message: "", kind: "" });
      showScreen("dashboard");
    } catch {
      setCommitStatus({ message: "Could not create the local reveal vault.", kind: "error" });
    } finally {
      setIsCommitting(false);
    }
  }

  function handleReveal() {
    if (!positionForSelected) {
      setRevealStatus({ message: "No position selected in this session.", kind: "error" });
      return;
    }
    setRevealed(true);
    setRevealStatus({
      message: `Reveal prepared for ${positionForSelected.direction}. In production this calls revealVote(vote, nonce).`,
      kind: "success",
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" aria-label="Go to market feed" onClick={() => showScreen("feed")}>
          <span className="brand-mark">TM</span>
          <span>TruthMarket</span>
        </button>
        <nav className="topnav" aria-label="Primary">
          <button type="button" onClick={() => showScreen("feed")}>
            Markets
          </button>
          <button type="button" onClick={() => showScreen("create")}>
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              showScreen("dashboard");
            }}
          >
            Developer
          </button>
        </nav>
        <button className="wallet-button" type="button" onClick={handleConnectWallet}>
          {wallet || "Connect wallet"}
        </button>
      </header>

      <main>
        {screen === "feed" && (
          <section className="view is-active" aria-labelledby="feedTitle">
            <div className="feed-shell">
              <div className="feed-hero">
                <p className="eyebrow">Live claims</p>
                <h1 id="feedTitle">Pick a market. Commit Up or Down.</h1>
                <p>Votes stay hidden until reveal. The selected jury resolves the claim.</p>
              </div>

              <div className="feed-toolbar" role="group" aria-label="Market filters">
                {(["Trending", "New", "Reveal soon"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`feed-tab${filter === tab ? " is-active" : ""}`}
                    type="button"
                    aria-pressed={filter === tab}
                    onClick={() => setFilter(tab)}
                  >
                    {tab}
                  </button>
                ))}
                <button className="feed-tab create-tab" type="button" onClick={() => showScreen("create")}>
                  Create market
                </button>
              </div>

              {visibleMarkets.length === 0 ? (
                <div className="empty-state">
                  <strong>No markets in this view</strong>
                  <p>Try another filter or create a new claim.</p>
                  <button className="primary-action" type="button" onClick={() => showScreen("create")}>
                    Create market
                  </button>
                </div>
              ) : (
                <div className="market-grid" aria-label="Ongoing markets">
                  {visibleMarkets.map((market) => (
                    <article className="market-card" key={market.id}>
                      <MarketArtwork market={market} />
                      <div className="market-card-top">
                        <span className="market-avatar">{market.symbol}</span>
                        <span className="phase-pill">{market.uiStage}</span>
                      </div>
                      <h2>{market.title}</h2>
                      <p>{market.description}</p>
                      <div className="mini-stats">
                        <span>{formatToken(market.stake)}</span>
                        <span>{market.commits} commits</span>
                        <span>{market.timeLeft}</span>
                      </div>
                      <div className={`market-bar${market.uiStage === "Voting" ? " is-private" : ""}`} aria-label={market.uiStage === "Voting" ? "Commit activity hidden until reveal" : "Current revealed market lean"}>
                        <span style={{ width: `${market.uiStage === "Voting" ? 100 : market.upPercent}%` }} />
                      </div>
                      <button className="open-market" type="button" onClick={() => openMarket(market.id)}>
                        Open market
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {screen === "create" && (
          <section className="view is-active" aria-labelledby="createTitle">
            <div className="create-shell">
              <button className="ghost-button" type="button" onClick={() => showScreen("feed")}>
                Back to markets
              </button>

              <article className="create-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">Create market</p>
                    <h1 id="createTitle">Start a custom claim</h1>
                  </div>
                  <strong className="deadline-pill">Prototype</strong>
                </div>

                <form className="create-form" onSubmit={handleCreateMarket}>
                  <label className="field">
                    <span>Market question</span>
                    <input name="question" type="text" autoComplete="off" placeholder="Will..." required />
                  </label>

                  <label className="field">
                    <span>Short description</span>
                    <textarea name="description" rows={3} placeholder="What should voters know before committing?" required />
                  </label>

                  <label className="field">
                    <span>Image or reference artifact</span>
                    <input name="image" type="file" accept="image/*" onChange={handleCreateImage} />
                  </label>
                  {createImageData && (
                    <div className="image-preview">
                      <img src={createImageData} alt="Uploaded market artifact preview" />
                    </div>
                  )}

                  <div className="meaning-grid">
                    <label className="field meaning-field">
                      <span>Up means</span>
                      <textarea name="upMeaning" rows={3} placeholder="Define the upward outcome" required />
                    </label>
                    <label className="field meaning-field">
                      <span>Down means</span>
                      <textarea name="downMeaning" rows={3} placeholder="Define the downward outcome" required />
                    </label>
                  </div>

                  <div className="create-grid">
                    <label className="field">
                      <span>Symbol</span>
                      <input name="symbol" type="text" autoComplete="off" maxLength={5} placeholder="AI" />
                    </label>
                    <label className="field">
                      <span>Jury size</span>
                      <input name="jurySize" type="number" min={1} step={2} defaultValue={5} inputMode="numeric" />
                    </label>
                    <label className="field">
                      <span>Minimum revealed jurors</span>
                      <input name="minRevealed" type="number" min={1} defaultValue={3} inputMode="numeric" />
                    </label>
                    <label className="field">
                      <span>Voting window</span>
                      <select name="votingWindow" defaultValue="12h">
                        <option value="6h">6h</option>
                        <option value="12h">12h</option>
                        <option value="1d">1d</option>
                        <option value="3d">3d</option>
                      </select>
                    </label>
                  </div>

                  <div className="create-preview">
                    <span>Next in production</span>
                    <p>Upload the claim/rules document to Swarm, then deploy a TruthMarket contract with these parameters.</p>
                  </div>

                  <button className="primary-action" type="submit">
                    Create market
                  </button>
                  <StatusLine message={createStatus.message} kind={createStatus.kind} />
                </form>
              </article>
            </div>
          </section>
        )}

        {screen === "stake" && (
          <section className="view is-active" aria-labelledby="stakeTitle">
            <div className="stake-shell">
              <button className="ghost-button" type="button" onClick={() => showScreen("feed")}>
                Back to markets
              </button>

              <article className="stake-card">
                {selectedMarket.image && (
                  <div className="stake-media">
                    <img src={selectedMarket.image} alt={`Reference artifact for ${selectedMarket.title}`} />
                  </div>
                )}

                <div className="market-summary">
                  <span className="market-avatar">{selectedMarket.symbol}</span>
                  <div>
                    <p className="phase-pill">{selectedMarket.phase}</p>
                    <h1 id="stakeTitle">{selectedMarket.title}</h1>
                    <p>{selectedMarket.description}</p>
                  </div>
                </div>

                <div className="meaning-grid">
                  <div>
                    <span className="direction-label up">Up</span>
                    <p>{selectedMarket.upMeaning}</p>
                  </div>
                  <div>
                    <span className="direction-label down">Down</span>
                    <p>{selectedMarket.downMeaning}</p>
                  </div>
                </div>

                <form className="stake-form" onSubmit={handleCommit}>
                  <div className="direction-picker" role="group" aria-label="Choose direction">
                    <button className={`direction-button up${direction === "Up" ? " is-selected" : ""}`} type="button" aria-pressed={direction === "Up"} onClick={() => setDirection("Up")}>
                      Up
                    </button>
                    <button className={`direction-button down${direction === "Down" ? " is-selected" : ""}`} type="button" aria-pressed={direction === "Down"} onClick={() => setDirection("Down")}>
                      Down
                    </button>
                  </div>

                  <label className="field">
                    <span>
                      Conviction <b>{conviction}%</b>
                    </span>
                    <input type="range" min={1} max={100} value={conviction} onChange={(event) => setConviction(Number(event.currentTarget.value))} />
                  </label>

                  <label className="field stake-field">
                    <span>Stake</span>
                    <input type="number" min={10} step={1} inputMode="decimal" value={stake} onChange={(event) => setStake(Number(event.currentTarget.value))} />
                  </label>

                  <div className="risk-preview" aria-live="polite">
                    <div>
                      <span>At risk</span>
                      <strong>{formatToken(risked.toFixed(2))}</strong>
                    </div>
                    <div>
                      <span>Protected</span>
                      <strong>{formatToken(refundable.toFixed(2))}</strong>
                    </div>
                  </div>

                  <button className="primary-action" type="submit" disabled={isCommitting} aria-busy={isCommitting}>
                    {isCommitting ? "Committing..." : "Commit position"}
                  </button>
                  <StatusLine message={commitStatus.message} kind={commitStatus.kind} />
                </form>
              </article>
            </div>
          </section>
        )}

        {screen === "dashboard" && (
          <section className="view is-active" aria-labelledby="dashboardTitle">
            <div className="dashboard-shell">
              <div className="dashboard-header">
                <button className="ghost-button" type="button" onClick={() => showScreen("feed")}>
                  Back to markets
                </button>
                <button className="ghost-button" type="button" onClick={() => showScreen("feed")}>
                  Change market
                </button>
              </div>

              <section className="dashboard-main">
                <article className="position-card">
                  <p className="eyebrow">Your position</p>
                  <h1 id="dashboardTitle">{selectedMarket.title}</h1>
                  <div className="position-summary">
                    {positionForSelected ? (
                      <>
                        <div>
                          <span>Direction</span>
                          <strong className={positionForSelected.direction.toLowerCase()}>{positionForSelected.direction}</strong>
                        </div>
                        <div>
                          <span>Stake</span>
                          <strong>{formatToken(positionForSelected.stake)}</strong>
                        </div>
                        <div>
                          <span>Conviction</span>
                          <strong>{positionForSelected.conviction}%</strong>
                        </div>
                        <div>
                          <span>At risk</span>
                          <strong>{formatToken(positionForSelected.risked.toFixed(2))}</strong>
                        </div>
                        <div>
                          <span>Reveal</span>
                          <strong>{revealed ? "Done" : "Required later"}</strong>
                        </div>
                        <div>
                          <span>Juror status</span>
                          <strong>{wallet && selectedMarket.jurors.includes(wallet) ? "Selected" : "Not selected yet"}</strong>
                        </div>
                      </>
                    ) : (
                      <p>No committed position in this session.</p>
                    )}
                  </div>
                  <button className="primary-action" type="button" disabled={!positionForSelected || selectedMarket.uiStage !== "Reveal"} onClick={handleReveal}>
                    {selectedMarket.uiStage === "Reveal" ? "Reveal position" : "Reveal when open"}
                  </button>
                  <StatusLine message={revealStatus.message} kind={revealStatus.kind} />
                </article>

                <article className="process-card">
                  <div className="card-heading">
                    <div>
                      <p className="eyebrow">Process</p>
                      <h2>{selectedMarket.uiStage}</h2>
                    </div>
                    <strong className="deadline-pill">{selectedMarket.deadlineLabel}</strong>
                  </div>
                  <div className="process-steps" aria-label="Market lifecycle">
                    {(["Voting", "Jury selection", "Reveal", "Resolved"] as Stage[]).map((stage, index) => {
                      const current = lifecycleIndex(selectedMarket.uiStage);
                      return (
                        <div className={`process-step${index < current ? " is-done" : ""}${index === current ? " is-current" : ""}`} key={stage}>
                          <span>{index + 1}</span>
                          <strong>{stage}</strong>
                        </div>
                      );
                    })}
                  </div>
                  <div className="process-note" role="status">
                    {processCopy(selectedMarket, positionForSelected)}
                  </div>
                </article>

                <article className="status-card">
                  <p className="eyebrow">Market status</p>
                  <div className="status-grid">
                    <div>
                      <span>Phase</span>
                      <strong>{selectedMarket.uiStage}</strong>
                    </div>
                    <div>
                      <span>Committed</span>
                      <strong>{selectedMarket.commits} positions</strong>
                    </div>
                    <div>
                      <span>Jury</span>
                      <strong>{selectedMarket.jurySize} selected</strong>
                    </div>
                    <div>
                      <span>Pool</span>
                      <strong>{formatToken(selectedMarket.pool)}</strong>
                    </div>
                    <div>
                      <span>Revealed jurors</span>
                      <strong>
                        {selectedMarket.revealedJurors} / {selectedMarket.minRevealedJurors} min
                      </strong>
                    </div>
                    <div>
                      <span>Jury vote</span>
                      <strong>
                        {selectedMarket.juryUpCount} Up / {selectedMarket.juryDownCount} Down
                      </strong>
                    </div>
                  </div>
                </article>

                <article className="status-card">
                  <p className="eyebrow">Selected jury</p>
                  <div className="jury-panel">
                    {selectedMarket.jurors.length === 0 ? (
                      <p>{selectedMarket.uiStage === "Jury selection" ? "Jury selection is in progress." : "Jury not selected yet."}</p>
                    ) : (
                      selectedMarket.jurors.map((juror, index) => (
                        <div className="jury-chip" key={`${selectedMarket.id}-${juror}`}>
                          <strong>{juror}</strong>
                          <span>{index < selectedMarket.revealedJurors ? "Revealed" : "Waiting"}</span>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                <article className="status-card reminders-card">
                  <p className="eyebrow">Reminders</p>
                  <ol className="next-steps">
                    {reminderCopy(selectedMarket, positionForSelected).map((row) => (
                      <li key={row}>{row}</li>
                    ))}
                  </ol>
                </article>

                <article className="status-card next-card">
                  <p className="eyebrow">What matters now</p>
                  <ol className="next-steps">
                    {nextStepCopy(selectedMarket, positionForSelected).map((row) => (
                      <li key={row}>{row}</li>
                    ))}
                  </ol>
                </article>
              </section>

              <details className="dev-panel">
                <summary>Developer settings</summary>
                <div className="dev-grid">
                  <div>
                    <span>Commitment hash</span>
                    <code>{positionForSelected ? shortHash(positionForSelected.commitmentHash) : "No position yet"}</code>
                  </div>
                  <div>
                    <span>Randomness</span>
                    <code>{selectedMarket.randomness}</code>
                  </div>
                  <div>
                    <span>Audit hash</span>
                    <code>{selectedMarket.auditHash}</code>
                  </div>
                  <div>
                    <span>Local vault</span>
                    <code>{typeof window !== "undefined" && localStorage.getItem(vaultKey(selectedMarket.id)) ? "Encrypted in browser" : "Empty"}</code>
                  </div>
                </div>
                <ul className="debug-list">
                  {(selectedMarket.jurors.length ? selectedMarket.jurors : ["Jury draw pending"]).map((juror) => (
                    <li key={juror}>{juror}</li>
                  ))}
                </ul>
              </details>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
