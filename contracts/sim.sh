#!/usr/bin/env bash
# TruthMarket scenario runner.
#
# Usage:
#   ./sim.sh                              # lifecycle (default)
#   ./sim.sh lifecycle
#   ./sim.sh invalid-no-jury
#   ./sim.sh invalid-too-few-reveals
#   ./sim.sh tie-invalid
#   ./sim.sh random [seed]                # default seed = 0xDEADBEEF
#   ./sim.sh all                          # run every scenario back to back

set -euo pipefail

SCENARIO="${1:-lifecycle}"

run() {
    local sig="$1"; shift
    echo
    echo ">>> forge script script/Simulate.s.sol --sig '$sig' $*"
    echo
    forge script script/Simulate.s.sol --sig "$sig" "$@" -vv \
      | sed -n '/== Logs ==/,$p'
}

case "$SCENARIO" in
    lifecycle)               run 'lifecycle()' ;;
    invalid-no-jury)         run 'invalidNoJury()' ;;
    invalid-too-few-reveals) run 'invalidTooFewReveals()' ;;
    tie-invalid)             run 'tieInvalid()' ;;
    random)                  run 'randomScenario(uint256)' "${2:-0xDEADBEEF}" ;;
    all)
        run 'lifecycle()'
        run 'invalidNoJury()'
        run 'invalidTooFewReveals()'
        run 'tieInvalid()'
        run 'randomScenario(uint256)' "${2:-0xDEADBEEF}"
        ;;
    *)
        echo "Unknown scenario: $SCENARIO" >&2
        echo "Valid: lifecycle | invalid-no-jury | invalid-too-few-reveals | tie-invalid | random [seed] | all" >&2
        exit 1
        ;;
esac
