#!/usr/bin/env bash
# In-process TruthMarket scenario runner (no anvil).
#
# Usage:
#   ./sim.sh                              # lifecycle (default)
#   ./sim.sh lifecycle
#   ./sim.sh invalid-no-jury
#   ./sim.sh invalid-juror-penalty
#   ./sim.sh random [seed]                # default seed = 0xDEADBEEF
#   ./sim.sh all                          # run every scenario back to back

set -euo pipefail

SCENARIO="${1:-lifecycle}"

run() {
    local sig="$1"
    shift
    echo
    echo ">>> forge script script/Simulate.s.sol --sig '$sig' $*"
    echo
    forge script script/Simulate.s.sol --sig "$sig" "$@" -vv \
      | sed -n '/== Logs ==/,$p'
}

case "$SCENARIO" in
    lifecycle)              run 'lifecycle()' ;;
    invalid-no-jury)        run 'invalidNoJury()' ;;
    invalid-juror-penalty)  run 'invalidJurorPenalty()' ;;
    random)                 run 'randomScenario(uint256)' "${2:-0xDEADBEEF}" ;;
    all)
        run 'lifecycle()'
        run 'invalidNoJury()'
        run 'invalidJurorPenalty()'
        run 'randomScenario(uint256)' "${2:-0xDEADBEEF}"
        ;;
    *)
        echo "Unknown scenario: $SCENARIO" >&2
        echo "Valid: lifecycle | invalid-no-jury | invalid-juror-penalty | random [seed] | all" >&2
        exit 1
        ;;
esac
