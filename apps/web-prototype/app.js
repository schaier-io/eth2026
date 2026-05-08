const markets = [
  {
    id: "agent-support",
    symbol: "AS",
    title: "Will agents close more support tickets than humans this week?",
    description: "A live claim about whether autonomous agents beat the human support queue under the locked rules.",
    phase: "Voting",
    stake: 18420,
    commits: 173,
    jurySize: 9,
    pool: 2310,
    timeLeft: "3h 12m",
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
    stake: 12670,
    commits: 98,
    jurySize: 7,
    pool: 1780,
    timeLeft: "54m",
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
    stake: 9310,
    commits: 61,
    jurySize: 5,
    pool: 890,
    timeLeft: "1d 4h",
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
    stake: 22140,
    commits: 204,
    jurySize: 11,
    pool: 3180,
    timeLeft: "8h 41m",
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
  dashPhase: document.getElementById("dashPhase"),
  dashCommits: document.getElementById("dashCommits"),
  dashJury: document.getElementById("dashJury"),
  dashPool: document.getElementById("dashPool"),
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
        <span class="phase-pill">${market.phase}</span>
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
  els.dashPhase.textContent = market.phase;
  els.dashCommits.textContent = `${market.commits} positions`;
  els.dashJury.textContent = `${market.jurySize} selected`;
  els.dashPool.textContent = formatToken(market.pool);
  els.debugRandomness.textContent = market.randomness;
  els.debugAudit.textContent = market.auditHash;
  els.debugVault.textContent = localStorage.getItem(vaultKey(market.id)) ? "Encrypted in browser" : "Empty";
  els.revealButton.disabled = !position || market.phase !== "Reveal";
  els.revealButton.textContent = market.phase === "Reveal" ? "Reveal position" : "Reveal when open";

  if (!position) {
    els.positionSummary.innerHTML = `<p>No committed position in this session.</p>`;
    els.debugCommitHash.textContent = "No position yet";
  } else {
    els.positionSummary.innerHTML = `
      <div><span>Direction</span><strong class="${position.direction.toLowerCase()}">${position.direction}</strong></div>
      <div><span>Stake</span><strong>${formatToken(position.stake)}</strong></div>
      <div><span>Conviction</span><strong>${position.conviction}%</strong></div>
      <div><span>At risk</span><strong>${formatToken(position.risked.toFixed(2))}</strong></div>
    `;
    els.debugCommitHash.textContent = shortHash(position.commitmentHash);
  }

  const steps =
    market.phase === "Voting"
      ? ["Your position is hidden.", "Wait for the SpaceComputer jury draw.", "Reveal when the reveal window opens."]
      : ["Reveal your position to settle.", "Selected jurors decide by count.", "Withdraw after resolution."];
  els.nextSteps.innerHTML = "";
  steps.forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    els.nextSteps.appendChild(item);
  });

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
