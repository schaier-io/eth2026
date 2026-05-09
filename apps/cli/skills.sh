#!/usr/bin/env bash
# TruthMarket Agent CLI — one-shot setup and demo runner.
#
# Designed to take a teammate from zero to a working agent environment in
# about five minutes. Every subcommand is idempotent: re-run it any time.
#
# Usage:
#   ./skills.sh doctor       check that node, forge, anvil, cast are installed
#   ./skills.sh install      one-time: npm install + npm run build + npm link
#   ./skills.sh bootstrap    install (if needed) + dev up + default policy
#   ./skills.sh demo         bootstrap + read-only CLI tour against the mock chain
#   ./skills.sh clean        dev down + remove dist/ + drop generated .env
#   ./skills.sh help         this message
#
# Quickstart from a fresh checkout:
#
#   cd apps/cli
#   ./skills.sh bootstrap
#   truthmarket market info        # read the live mock-chain market
#   truthmarket vote commit --vote yes --stake 1000000000000000000
#   truthmarket vault list
#   ./skills.sh clean              # tear it all down

set -euo pipefail

cd "$(dirname "$0")"

# ---------- pretty output ----------
if [[ -t 1 ]]; then
  CYAN=$'\033[1;36m'
  GREEN=$'\033[1;32m'
  YELLOW=$'\033[1;33m'
  RED=$'\033[1;31m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
else
  CYAN= GREEN= YELLOW= RED= DIM= RESET=
fi
step() { printf '\n%s▶ %s%s\n' "$CYAN" "$*" "$RESET"; }
ok()   { printf '%s✔%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
fail() { printf '%s✘%s %s\n' "$RED" "$RESET" "$*" >&2; }

# ---------- doctor ----------
have() { command -v "$1" >/dev/null 2>&1; }

check_dep() {
  local dep="$1" hint="$2"
  if have "$dep"; then
    ok "$dep ($($dep --version 2>&1 | head -n 1))"
    return 0
  fi
  fail "$dep not found"
  printf '%s%s%s\n' "$DIM" "  install: $hint" "$RESET" >&2
  return 1
}

cmd_doctor() {
  step "Checking dependencies"
  local missing=0
  check_dep node "https://nodejs.org/ (≥ 20)" || missing=1
  check_dep npm "ships with node" || missing=1
  check_dep forge "https://book.getfoundry.sh/getting-started/installation" || missing=1
  check_dep anvil "https://book.getfoundry.sh/getting-started/installation" || missing=1
  check_dep cast "https://book.getfoundry.sh/getting-started/installation" || missing=1
  if (( missing )); then
    fail "fix the above and re-run"
    exit 1
  fi
  ok "all dependencies present"
}

# ---------- install ----------
cmd_install() {
  cmd_doctor
  step "Installing npm dependencies"
  npm install --no-audit --no-fund
  step "Building TypeScript"
  npm run build
  step "Linking globally as 'truthmarket'"
  if npm link 2>/dev/null; then
    ok "linked"
  else
    warn "npm link failed (likely a permission issue)"
    warn "fall back: run via 'node $(pwd)/dist/cli.js' or add an alias"
  fi
  if have truthmarket; then
    ok "verified: $(truthmarket --version 2>&1 || echo missing)"
  else
    warn "'truthmarket' not on PATH yet — open a fresh shell or use the alias above"
  fi
}

# ---------- bootstrap ----------
DEFAULT_POLICY=$(cat <<'JSON'
{
  "autoReveal": true,
  "revealBufferMinutes": 30,
  "autoWithdraw": true,
  "maxStake": "100000000000000000000",
  "requireSwarmVerification": false,
  "allowCreateMarkets": false,
  "allowJuryCommit": false,
  "pollIntervalSeconds": 30
}
JSON
)

# Prefer the linked binary; fall back to the local dist build.
truthmarket() {
  if have truthmarket; then
    command truthmarket "$@"
  else
    node "$(pwd)/dist/cli.js" "$@"
  fi
}

cmd_bootstrap() {
  if [[ ! -f dist/cli.js ]]; then
    cmd_install
  fi
  step "Starting anvil + deploying mock TruthMarket"
  truthmarket dev up
  step "Writing default agent policy"
  local policy_file="${TMPDIR:-/tmp}/tm-default-policy.json"
  printf '%s\n' "$DEFAULT_POLICY" > "$policy_file"
  truthmarket policy set --file "$policy_file"
  rm -f "$policy_file"
  ok "ready"
  cat <<EOF

${DIM}You are now connected to a local mock chain. The .env in $(pwd) has:${RESET}
   TM_CHAIN=foundry
   TM_RPC_URL=http://127.0.0.1:8545
   TM_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
   PRIVATE_KEY=0xac09…ff80   ${DIM}(anvil deterministic deployer)${RESET}

Try one of these:
  truthmarket market info
  truthmarket wallet balance
  truthmarket erc20 approve
  truthmarket vote commit --vote yes --stake 1000000000000000000
  truthmarket vault list
  truthmarket tui
  ./skills.sh clean        ${DIM}# tear it down${RESET}
EOF
}

# ---------- demo ----------
cmd_demo() {
  cmd_bootstrap
  step "Reading market info"
  truthmarket market info
  step "Reading wallet balance"
  truthmarket wallet balance
  step "Reading current phase"
  truthmarket market phase
  step "Approving stake token (MaxUint256)"
  truthmarket erc20 approve >/dev/null && ok "approved"
  truthmarket erc20 allowance
  ok "demo finished — read-only commands all wired up"
  cat <<EOF

${DIM}For a full commit-reveal-withdraw lifecycle you need 7 voters
(minCommits=7); the contracts repo's forge SimulateAnvil script has
a commit() / commitJury() / reveal() / resolve() phase that drives
the full thing. Run ./skills.sh clean when you're done.${RESET}
EOF
}

# ---------- clean ----------
cmd_clean() {
  step "Stopping managed anvil"
  truthmarket dev down || true
  step "Removing build artifacts"
  rm -rf dist
  if [[ -f .env ]] && grep -q '^TM_RPC_URL=http://127.0.0.1:8545' .env 2>/dev/null; then
    step "Removing generated .env (anvil-pointing)"
    rm -f .env
  fi
  ok "clean"
}

# ---------- help ----------
cmd_help() {
  cat <<EOF
TruthMarket Agent CLI bootstrapper

  ${CYAN}./skills.sh doctor${RESET}      check node, npm, forge, anvil, cast
  ${CYAN}./skills.sh install${RESET}     npm install + build + npm link
  ${CYAN}./skills.sh bootstrap${RESET}   install (if needed) + dev up + default policy
  ${CYAN}./skills.sh demo${RESET}        bootstrap + read-only CLI tour
  ${CYAN}./skills.sh clean${RESET}       dev down + remove dist/ + drop generated .env

A typical first run:
  ${DIM}\$${RESET} ./skills.sh bootstrap
  ${DIM}\$${RESET} truthmarket market info
  ${DIM}\$${RESET} ./skills.sh clean
EOF
}

# ---------- dispatch ----------
case "${1:-help}" in
  doctor)    cmd_doctor ;;
  install)   cmd_install ;;
  bootstrap) cmd_bootstrap ;;
  demo)      cmd_demo ;;
  clean)     cmd_clean ;;
  help|-h|--help) cmd_help ;;
  *)
    fail "unknown subcommand: $1"
    cmd_help
    exit 1
    ;;
esac
