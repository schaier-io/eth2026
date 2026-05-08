const markets = [
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

const state = {
  screen: "feed",
  selectedMarketId: markets[0].id,
  direction: "Up",
  wallet: null,
  currentPosition: null,
  revealed: false,
};

const els = {
  homeButton: document.getElementById("homeButton"),
  marketsNav: document.getElementById("marketsNav"),
  devNav: document.getElementById("devNav"),
  walletButton: document.getElementById("walletButton"),
  feedView: document.getElementById("feedView"),
  stakeView: document.getElementById("stakeView"),
  dashboardView: document.getElementById("dashboardView"),
  marketCards: document.getElementById("marketCards"),
  backToFeed: document.getElementById("backToFeed"),
  dashboardBack: document.getElementById("dashboardBack"),
  newPositionButton: document.getElementById("newPositionButton"),
  stakeSymbol: document.getElementById("stakeSymbol"),
  stakePhase: document.getElementById("stakePhase"),
  stakeTitle: document.getElementById("stakeTitle"),
  stakeDescription: document.getElementById("stakeDescription"),
  stakeUpMeaning: document.getElementById("stakeUpMeaning"),
  stakeDownMeaning: document.getElementById("stakeDownMeaning"),
  chooseUp: document.getElementById("chooseUp"),
  chooseDown: document.getElementById("chooseDown"),
  convictionInput: document.getElementById("convictionInput"),
  convictionValue: document.getElementById("convictionValue"),
  stakeInput: document.getElementById("stakeInput"),
  riskedStake: document.getElementById("riskedStake"),
  refundStake: document.getElementById("refundStake"),
  stakeForm: document.getElementById("stakeForm"),
  commitButton: document.getElementById("commitButton"),
  commitStatus: document.getElementById("commitStatus"),
  dashboardTitle: document.getElementById("dashboardTitle"),
  positionSummary: document.getElementById("positionSummary"),
  revealButton: document.getElementById("revealButton"),
  revealStatus: document.getElementById("revealStatus"),
  processTitle: document.getElementById("processTitle"),
  deadlineText: document.getElementById("deadlineText"),
  processSteps: document.getElementById("processSteps"),
  processNote: document.getElementById("processNote"),
  dashPhase: document.getElementById("dashPhase"),
  dashCommits: document.getElementById("dashCommits"),
  dashJury: document.getElementById("dashJury"),
  dashPool: document.getElementById("dashPool"),
  dashRevealedJurors: document.getElementById("dashRevealedJurors"),
  dashJuryVote: document.getElementById("dashJuryVote"),
  juryPanel: document.getElementById("juryPanel"),
  reminderList: document.getElementById("reminderList"),
  nextSteps: document.getElementById("nextSteps"),
  devPanel: document.getElementById("devPanel"),
  debugCommitHash: document.getElementById("debugCommitHash"),
  debugRandomness: document.getElementById("debugRandomness"),
  debugAudit: document.getElementById("debugAudit"),
  debugVault: document.getElementById("debugVault"),
  debugJury: document.getElementById("debugJury"),
};

function selectedMarket() {
  return markets.find((market) => market.id === state.selectedMarketId);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textEncoder(value) {
  return new TextEncoder().encode(value);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder(value));
  return `0x${bytesToHex(new Uint8Array(digest))}`;
}

async function walletKey() {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder(`truthmarket-demo:${state.wallet || "offline"}`),
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

async function encryptVaultPayload(payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await walletKey();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder(JSON.stringify(payload)));
  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
  };
}

function vaultKey(marketId) {
  return `truthmarket:vault:${marketId}`;
}

function formatToken(value) {
  return `${Number(value).toLocaleString()} TMT`;
}

function shortHash(value) {
  if (!value || value.length < 16) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function lifecycleIndex(stage) {
  return ["Voting", "Jury selection", "Reveal", "Resolved"].indexOf(stage);
}

function processCopy(market, position) {
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

function nextStepCopy(market, position) {
  if (!position) return ["No position in this market yet.", "Open a market and commit Up or Down."];
  if (market.uiStage === "Voting") {
    return [
      "Keep the reveal key in this browser.",
      `Reminder: reveal opens after jury selection.`,
      "You do not need to do anything until the reveal window opens.",
    ];
  }
  if (market.uiStage === "Jury selection") {
    return [
      "Waiting for SpaceComputer randomness.",
      "Once jurors are selected, check whether your wallet was selected.",
      "Reveal will open immediately after commitJury succeeds.",
    ];
  }
  if (market.uiStage === "Reveal") {
    return [
      "Reveal your position before the deadline.",
      "If you are selected as a juror and skip reveal, full stake is forfeited.",
      "Non-jurors also reveal to settle and avoid losing risked stake.",
    ];
  }
  return ["Market resolved.", "Withdraw your payout.", "Review settlement in developer settings if needed."];
}

function reminderCopy(market, position) {
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

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.classList.toggle("is-error", kind === "error");
  element.classList.toggle("is-success", kind === "success");
}

function showScreen(screen) {
  state.screen = screen;
  els.feedView.classList.toggle("is-active", screen === "feed");
  els.stakeView.classList.toggle("is-active", screen === "stake");
  els.dashboardView.classList.toggle("is-active", screen === "dashboard");
  window.scrollTo({ top: 0, behavior: "auto" });
  render();
}

function renderMarketCards() {
  els.marketCards.innerHTML = "";
  for (const market of markets) {
    const article = document.createElement("article");
    article.className = "market-card";
    article.innerHTML = `
      <div class="market-card-top">
        <span class="market-avatar">${market.symbol}</span>
        <span class="phase-pill">${market.uiStage}</span>
      </div>
      <h2>${market.title}</h2>
      <p>${market.description}</p>
      <div class="mini-stats">
        <span>${formatToken(market.stake)}</span>
        <span>${market.commits} commits</span>
        <span>${market.timeLeft}</span>
      </div>
      <div class="market-bar" aria-label="Current visible market lean">
        <span style="width: ${market.upPercent}%"></span>
      </div>
      <button class="open-market" type="button">Open market</button>
    `;
    article.querySelector(".open-market").addEventListener("click", () => {
      state.selectedMarketId = market.id;
      state.direction = "Up";
      state.revealed = false;
      setStatus(els.commitStatus, "");
      showScreen("stake");
    });
    els.marketCards.appendChild(article);
  }
}

function renderStakeScreen() {
  const market = selectedMarket();
  els.stakeSymbol.textContent = market.symbol;
  els.stakePhase.textContent = market.phase;
  els.stakeTitle.textContent = market.title;
  els.stakeDescription.textContent = market.description;
  els.stakeUpMeaning.textContent = market.upMeaning;
  els.stakeDownMeaning.textContent = market.downMeaning;
  els.chooseUp.classList.toggle("is-selected", state.direction === "Up");
  els.chooseDown.classList.toggle("is-selected", state.direction === "Down");
  renderRiskPreview();
}

function renderRiskPreview() {
  const stake = Number.parseFloat(els.stakeInput.value || "0");
  const conviction = Number.parseInt(els.convictionInput.value, 10);
  const risked = Math.max(0, (stake * conviction) / 100);
  const refund = Math.max(0, stake - risked);
  els.convictionValue.textContent = `${conviction}%`;
  els.riskedStake.textContent = formatToken(risked.toFixed(2));
  els.refundStake.textContent = formatToken(refund.toFixed(2));
}

function renderDashboard() {
  const market = selectedMarket();
  const position = state.currentPosition;
  els.dashboardTitle.textContent = market.title;
  els.processTitle.textContent = market.uiStage;
  els.deadlineText.textContent = market.deadlineLabel;
  els.processNote.textContent = processCopy(market, position);
  els.dashPhase.textContent = market.uiStage;
  els.dashCommits.textContent = `${market.commits} positions`;
  els.dashJury.textContent = `${market.jurySize} selected`;
  els.dashPool.textContent = formatToken(market.pool);
  els.dashRevealedJurors.textContent = `${market.revealedJurors} / ${market.minRevealedJurors} min`;
  els.dashJuryVote.textContent = `${market.juryUpCount} Up / ${market.juryDownCount} Down`;
  els.debugRandomness.textContent = market.randomness;
  els.debugAudit.textContent = market.auditHash;
  els.debugVault.textContent = localStorage.getItem(vaultKey(market.id)) ? "Encrypted in browser" : "Empty";
  els.revealButton.disabled = !position || market.uiStage !== "Reveal";
  els.revealButton.textContent = market.uiStage === "Reveal" ? "Reveal position" : "Reveal when open";

  if (!position) {
    els.positionSummary.innerHTML = `<p>No committed position in this session.</p>`;
    els.debugCommitHash.textContent = "No position yet";
  } else {
    els.positionSummary.innerHTML = `
      <div><span>Direction</span><strong class="${position.direction.toLowerCase()}">${position.direction}</strong></div>
      <div><span>Stake</span><strong>${formatToken(position.stake)}</strong></div>
      <div><span>Conviction</span><strong>${position.conviction}%</strong></div>
      <div><span>At risk</span><strong>${formatToken(position.risked.toFixed(2))}</strong></div>
      <div><span>Reveal</span><strong>${state.revealed ? "Done" : "Required later"}</strong></div>
      <div><span>Juror status</span><strong>${market.jurors.includes(state.wallet) ? "Selected" : "Not selected yet"}</strong></div>
    `;
    els.debugCommitHash.textContent = shortHash(position.commitmentHash);
  }

  renderProcessSteps(market);
  renderJuryPanel(market);
  renderList(els.reminderList, reminderCopy(market, position));
  const steps = nextStepCopy(market, position);
  renderList(els.nextSteps, steps);
  renderDebugJury(market);
}

function renderProcessSteps(market) {
  const stages = ["Voting", "Jury selection", "Reveal", "Resolved"];
  const current = lifecycleIndex(market.uiStage);
  els.processSteps.innerHTML = "";
  stages.forEach((stage, index) => {
    const item = document.createElement("div");
    item.className = `process-step${index < current ? " is-done" : ""}${index === current ? " is-current" : ""}`;
    item.innerHTML = `<span>${index + 1}</span><strong>${stage}</strong>`;
    els.processSteps.appendChild(item);
  });
}

function renderList(target, rows) {
  target.innerHTML = "";
  rows.forEach((row) => {
    const item = document.createElement("li");
    item.textContent = row;
    target.appendChild(item);
  });
}

function renderJuryPanel(market) {
  els.juryPanel.innerHTML = "";
  if (market.jurors.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = market.uiStage === "Jury selection" ? "Jury selection is in progress." : "Jury not selected yet.";
    els.juryPanel.appendChild(empty);
    return;
  }
  market.jurors.forEach((juror, index) => {
    const item = document.createElement("div");
    item.className = "jury-chip";
    const revealed = index < market.revealedJurors;
    item.innerHTML = `<strong>${juror}</strong><span>${revealed ? "Revealed" : "Waiting"}</span>`;
    els.juryPanel.appendChild(item);
  });
}

function renderDebugJury(market) {
  els.debugJury.innerHTML = "";
  const jurors = market.jurors.length ? market.jurors : ["Jury draw pending"];
  jurors.forEach((juror) => {
    const item = document.createElement("li");
    item.textContent = juror;
    els.debugJury.appendChild(item);
  });
}

function render() {
  renderMarketCards();
  renderStakeScreen();
  renderDashboard();
}

async function handleCommit(event) {
  event.preventDefault();
  const market = selectedMarket();
  const stake = Number.parseFloat(els.stakeInput.value || "0");
  const conviction = Number.parseInt(els.convictionInput.value, 10);

  if (!state.wallet) {
    setStatus(els.commitStatus, "Connect wallet first.", "error");
    return;
  }
  if (!Number.isFinite(stake) || stake < 10) {
    setStatus(els.commitStatus, "Minimum stake is 10 TMT.", "error");
    return;
  }

  els.commitButton.disabled = true;
  setStatus(els.commitStatus, "Committing hidden position...");
  try {
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = `0x${bytesToHex(nonceBytes)}`;
    const vote = state.direction === "Up" ? 1 : 2;
    const commitmentHash = await sha256Hex(`${vote}|${nonce}|${state.wallet}|${market.id}`);
    const risked = (stake * conviction) / 100;
    const encrypted = await encryptVaultPayload({
      marketId: market.id,
      wallet: state.wallet,
      direction: state.direction,
      vote,
      nonce,
      commitmentHash,
      stake,
      convictionBps: conviction * 100,
    });

    localStorage.setItem(vaultKey(market.id), JSON.stringify(encrypted));
    state.currentPosition = {
      marketId: market.id,
      direction: state.direction,
      stake,
      conviction,
      risked,
      commitmentHash,
    };
    state.revealed = false;
    setStatus(els.commitStatus, "");
    showScreen("dashboard");
  } catch (error) {
    setStatus(els.commitStatus, "Could not create the local reveal vault.", "error");
  } finally {
    els.commitButton.disabled = false;
  }
}

function handleReveal() {
  const market = selectedMarket();
  if (!state.currentPosition || state.currentPosition.marketId !== market.id) {
    setStatus(els.revealStatus, "No position selected in this session.", "error");
    return;
  }
  state.revealed = true;
  setStatus(
    els.revealStatus,
    `Reveal prepared for ${state.currentPosition.direction}. In production this calls revealVote(vote, nonce).`,
    "success",
  );
}

els.homeButton.addEventListener("click", () => showScreen("feed"));
els.marketsNav.addEventListener("click", () => showScreen("feed"));
els.devNav.addEventListener("click", () => {
  showScreen("dashboard");
  els.devPanel.open = true;
});
els.backToFeed.addEventListener("click", () => showScreen("feed"));
els.dashboardBack.addEventListener("click", () => showScreen("feed"));
els.newPositionButton.addEventListener("click", () => showScreen("feed"));
els.walletButton.addEventListener("click", () => {
  state.wallet = "0x7a18...c9E2";
  els.walletButton.textContent = state.wallet;
});
els.chooseUp.addEventListener("click", () => {
  state.direction = "Up";
  renderStakeScreen();
});
els.chooseDown.addEventListener("click", () => {
  state.direction = "Down";
  renderStakeScreen();
});
els.convictionInput.addEventListener("input", renderRiskPreview);
els.stakeInput.addEventListener("input", renderRiskPreview);
els.stakeForm.addEventListener("submit", handleCommit);
els.revealButton.addEventListener("click", handleReveal);

render();
