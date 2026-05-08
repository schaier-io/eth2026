const markets = [
  {
    id: "agent-support",
    symbol: "AS",
    title: "Will agents close more support tickets than humans this week?",
    description:
      "A committed-position market for whether autonomous agents beat the human support queue under the immutable claim rules.",
    phase: "Voting",
    stake: 18420,
    commits: 173,
    jurySize: 9,
    revealWindow: "18h",
    upMeaning: "Agents close a higher count of qualifying tickets before the cutoff.",
    downMeaning: "Humans close an equal or higher count of qualifying tickets before the cutoff.",
    rulesUrl: "#",
    randomness: "0x4f3a...91c8",
    auditHash: "0xb71c...42aa",
    jurors: ["0x3f2a...91E0", "agent.alice.eth", "0x71B4...0D2c", "0xA902...66Fd", "ops-voter.eth"],
  },
  {
    id: "gpu-clearing",
    symbol: "GPU",
    title: "Will spot GPU rental clear below 2.20 TMT per hour?",
    description:
      "Resolution follows the posted market rules and settles by selected juror reveal, not by an external oracle.",
    phase: "Reveal",
    stake: 12670,
    commits: 98,
    jurySize: 7,
    revealWindow: "6h",
    upMeaning: "The clearing price is below the rule-defined threshold.",
    downMeaning: "The clearing price is at or above the rule-defined threshold.",
    rulesUrl: "#",
    randomness: "0x86de...54bb",
    auditHash: "0x2c01...fe29",
    jurors: ["0x9931...912a", "juror.base.eth", "0x20E0...B81c", "0x8f04...9170", "agent-17.eth"],
  },
  {
    id: "governance-ship",
    symbol: "JURY",
    title: "Will the protocol ship public jury replay tooling by Friday?",
    description:
      "The market resolves from randomly selected staked belief under the immutable claim/rules document.",
    phase: "Voting",
    stake: 9310,
    commits: 61,
    jurySize: 5,
    revealWindow: "24h",
    upMeaning: "The replay tool is public and can reproduce a jury selection.",
    downMeaning: "The replay tool is missing, private, or cannot reproduce the selected jury.",
    rulesUrl: "#",
    randomness: "Pending",
    auditHash: "Pending",
    jurors: [],
  },
];

const state = {
  selectedMarketId: markets[0].id,
  direction: "Up",
  wallet: null,
  revealed: false,
};

const els = {
  walletButton: document.getElementById("walletButton"),
  marketCards: document.getElementById("marketCards"),
  marketPhase: document.getElementById("marketPhase"),
  marketTitle: document.getElementById("marketTitle"),
  marketDescription: document.getElementById("marketDescription"),
  rulesLink: document.getElementById("rulesLink"),
  statStake: document.getElementById("statStake"),
  statCommits: document.getElementById("statCommits"),
  statJury: document.getElementById("statJury"),
  statReveal: document.getElementById("statReveal"),
  upMeaning: document.getElementById("upMeaning"),
  downMeaning: document.getElementById("downMeaning"),
  chooseUp: document.getElementById("chooseUp"),
  chooseDown: document.getElementById("chooseDown"),
  stakeInput: document.getElementById("stakeInput"),
  convictionInput: document.getElementById("convictionInput"),
  convictionValue: document.getElementById("convictionValue"),
  riskedStake: document.getElementById("riskedStake"),
  refundStake: document.getElementById("refundStake"),
  commitPassphrase: document.getElementById("commitPassphrase"),
  commitButton: document.getElementById("commitButton"),
  commitStatus: document.getElementById("commitStatus"),
  revealPassphrase: document.getElementById("revealPassphrase"),
  revealButton: document.getElementById("revealButton"),
  revealStatus: document.getElementById("revealStatus"),
  randomnessValue: document.getElementById("randomnessValue"),
  auditHash: document.getElementById("auditHash"),
  juryList: document.getElementById("juryList"),
  settlementState: document.getElementById("settlementState"),
  withdrawButton: document.getElementById("withdrawButton"),
  activityFeed: document.getElementById("activityFeed"),
};

function selectedMarket() {
  return markets.find((market) => market.id === state.selectedMarketId);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const pairs = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(pairs.map((pair) => Number.parseInt(pair, 16)));
}

function textEncoder(value) {
  return new TextEncoder().encode(value);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder(value));
  return `0x${bytesToHex(new Uint8Array(digest))}`;
}

async function deriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey("raw", textEncoder(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptRevealKey(payload, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder(JSON.stringify(payload)));
  return {
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
  };
}

async function decryptRevealKey(record, passphrase) {
  const salt = hexToBytes(record.salt);
  const iv = hexToBytes(record.iv);
  const ciphertext = hexToBytes(record.ciphertext);
  const key = await deriveKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
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

function renderMarketCards() {
  els.marketCards.innerHTML = "";
  for (const market of markets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `market-card${market.id === state.selectedMarketId ? " is-selected" : ""}`;
    button.innerHTML = `
      <span class="market-avatar">${market.symbol}</span>
      <span class="market-copy">
        <strong>${market.title}</strong>
        <span>${market.phase} / ${formatToken(market.stake)} / ${market.commits} positions</span>
      </span>
      <span class="market-move">Up ${Math.round((market.commits / 210) * 100)}%</span>
    `;
    button.addEventListener("click", () => {
      state.selectedMarketId = market.id;
      state.revealed = false;
      render();
    });
    els.marketCards.appendChild(button);
  }
}

function renderMarket() {
  const market = selectedMarket();
  els.marketPhase.textContent = market.phase;
  els.marketTitle.textContent = market.title;
  els.marketDescription.textContent = market.description;
  els.rulesLink.href = market.rulesUrl;
  els.statStake.textContent = formatToken(market.stake);
  els.statCommits.textContent = market.commits.toString();
  els.statJury.textContent = `${market.jurySize} selected`;
  els.statReveal.textContent = market.revealWindow;
  els.upMeaning.textContent = market.upMeaning;
  els.downMeaning.textContent = market.downMeaning;
  els.randomnessValue.textContent = market.randomness;
  els.auditHash.textContent = market.auditHash;

  els.juryList.innerHTML = "";
  if (market.jurors.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Jury draw pending. SpaceComputer randomness has not been committed.";
    els.juryList.appendChild(item);
  } else {
    market.jurors.forEach((juror, index) => {
      const item = document.createElement("li");
      item.innerHTML = `<strong>${index + 1}.</strong> ${juror}`;
      els.juryList.appendChild(item);
    });
  }
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

function renderDirection() {
  els.chooseUp.classList.toggle("is-selected", state.direction === "Up");
  els.chooseDown.classList.toggle("is-selected", state.direction === "Down");
}

function renderVaultState() {
  const market = selectedMarket();
  const hasVault = Boolean(localStorage.getItem(vaultKey(market.id)));
  if (!hasVault) {
    els.settlementState.textContent = "No committed position found in this browser.";
    els.withdrawButton.disabled = true;
    return;
  }
  if (!state.revealed) {
    els.settlementState.textContent =
      "Reveal required. Until this wallet reveals, the app will not classify the position as won or lost.";
    els.withdrawButton.disabled = true;
    return;
  }
  els.settlementState.textContent = "Position revealed. Withdrawal becomes available after on-chain resolution.";
  els.withdrawButton.disabled = false;
}

function renderActivity() {
  const market = selectedMarket();
  const rows = [
    `${market.commits} committed positions are hidden until reveal.`,
    `${market.jurySize} jurors decide by count, not stake weight.`,
    "Non-jurors also reveal to settle; unrevealed positions lose risked stake.",
    "Selected juror non-reveal forfeits full stake into the penalty pool.",
  ];
  els.activityFeed.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("li");
    item.textContent = row;
    els.activityFeed.appendChild(item);
  }
}

function renderRoutes() {
  const hash = window.location.hash || "#board";
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
  if (hash === "#create") {
    document.getElementById("create").classList.add("is-active");
  } else {
    document.getElementById("board").classList.add("is-active");
  }
}

function render() {
  renderRoutes();
  renderMarketCards();
  renderMarket();
  renderDirection();
  renderRiskPreview();
  renderVaultState();
  renderActivity();
}

async function handleCommit() {
  const market = selectedMarket();
  const passphrase = els.commitPassphrase.value.trim();
  const stake = Number.parseFloat(els.stakeInput.value || "0");
  const conviction = Number.parseInt(els.convictionInput.value, 10);

  if (!state.wallet) {
    setStatus(els.commitStatus, "Connect a wallet before committing.", "error");
    return;
  }
  if (!passphrase || passphrase.length < 8) {
    setStatus(els.commitStatus, "Use at least 8 characters to encrypt the local reveal key.", "error");
    return;
  }
  if (!Number.isFinite(stake) || stake < 10) {
    setStatus(els.commitStatus, "Stake must be at least 10 TMT.", "error");
    return;
  }

  els.commitButton.disabled = true;
  setStatus(els.commitStatus, "Creating local nonce and encrypted reveal key...");
  try {
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = `0x${bytesToHex(nonceBytes)}`;
    const vote = state.direction === "Up" ? 1 : 2;
    const commitmentHash = await sha256Hex(`${vote}|${nonce}|${state.wallet}|${market.id}`);
    const encrypted = await encryptRevealKey(
      {
        marketId: market.id,
        wallet: state.wallet,
        direction: state.direction,
        vote,
        nonce,
        commitmentHash,
        stake,
        convictionBps: conviction * 100,
      },
      passphrase,
    );
    localStorage.setItem(vaultKey(market.id), JSON.stringify(encrypted));
    setStatus(
      els.commitStatus,
      `Committed locally. Submit ${shortHash(commitmentHash)} on-chain with ${formatToken(stake)} and ${conviction}% conviction.`,
      "success",
    );
    renderVaultState();
  } catch (error) {
    setStatus(els.commitStatus, "Could not create encrypted reveal key.", "error");
  } finally {
    els.commitButton.disabled = false;
  }
}

async function handleReveal() {
  const market = selectedMarket();
  const passphrase = els.revealPassphrase.value.trim();
  const raw = localStorage.getItem(vaultKey(market.id));
  if (!raw) {
    setStatus(els.revealStatus, "No encrypted reveal key exists for this market in this browser.", "error");
    return;
  }
  if (!passphrase) {
    setStatus(els.revealStatus, "Enter the passphrase used when committing.", "error");
    return;
  }

  els.revealButton.disabled = true;
  setStatus(els.revealStatus, "Unlocking local reveal key...");
  try {
    const payload = await decryptRevealKey(JSON.parse(raw), passphrase);
    state.revealed = true;
    setStatus(
      els.revealStatus,
      `Reveal ready: ${payload.direction}, nonce ${shortHash(payload.nonce)}. Submit revealVote(${payload.vote}, nonce) on-chain.`,
      "success",
    );
    renderVaultState();
  } catch (error) {
    setStatus(els.revealStatus, "Passphrase failed or reveal key is corrupted.", "error");
  } finally {
    els.revealButton.disabled = false;
  }
}

els.walletButton.addEventListener("click", () => {
  state.wallet = "0x7a18...c9E2";
  els.walletButton.textContent = state.wallet;
  renderVaultState();
});

els.chooseUp.addEventListener("click", () => {
  state.direction = "Up";
  renderDirection();
});

els.chooseDown.addEventListener("click", () => {
  state.direction = "Down";
  renderDirection();
});

els.stakeInput.addEventListener("input", renderRiskPreview);
els.convictionInput.addEventListener("input", renderRiskPreview);
els.commitButton.addEventListener("click", handleCommit);
els.revealButton.addEventListener("click", handleReveal);
window.addEventListener("hashchange", renderRoutes);

render();
