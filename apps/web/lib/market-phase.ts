export const OUTCOME_LABEL = ["Unresolved", "YES", "NO", "Invalid"] as const;

type EpochLike = bigint | number | string | undefined | null;

export interface MarketPhaseInput {
  phase: number | undefined;
  outcome?: number | undefined;
  votingDeadline?: EpochLike;
  juryCommitDeadline?: EpochLike;
  revealDeadline?: EpochLike;
  now?: number;
}

export interface MarketDisplayPhase {
  label: string;
  className: string;
  outcomeLabel?: string;
  deadline: { label: string; epoch: number } | null;
}

function toEpoch(value: EpochLike): number | undefined {
  if (value === undefined || value === null) return undefined;
  const epoch = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(epoch) || epoch <= 0) return undefined;
  return epoch;
}

function resolvedClass(outcome: number): string {
  if (outcome === 1) return "phase-resolved-yes";
  if (outcome === 2) return "phase-resolved-no";
  if (outcome === 3) return "phase-resolved-invalid";
  return "phase-resolved";
}

export function getMarketDisplayPhase(input: MarketPhaseInput): MarketDisplayPhase {
  const phase = input.phase ?? 0;
  const outcome = input.outcome ?? 0;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const votingDeadline = toEpoch(input.votingDeadline);
  const juryCommitDeadline = toEpoch(input.juryCommitDeadline);
  const revealDeadline = toEpoch(input.revealDeadline);

  if (phase === 0) {
    if (votingDeadline && now >= votingDeadline) {
      if (!juryCommitDeadline || now < juryCommitDeadline) {
        return {
          label: "Jury forming",
          className: "phase-pill phase-jury",
          deadline: juryCommitDeadline ? { label: "Jury must form", epoch: juryCommitDeadline } : null,
        };
      }

      return {
        label: "Resolve pending",
        className: "phase-pill phase-pending",
        deadline: { label: "Jury deadline", epoch: juryCommitDeadline },
      };
    }

    return {
      label: "Voting",
      className: "phase-pill phase-voting",
      deadline: votingDeadline ? { label: "Voting ends", epoch: votingDeadline } : null,
    };
  }

  if (phase === 1) {
    if (revealDeadline && now >= revealDeadline) {
      return {
        label: "Resolve pending",
        className: "phase-pill phase-pending",
        deadline: { label: "Reveal closed", epoch: revealDeadline },
      };
    }

    return {
      label: "Reveal",
      className: "phase-pill phase-reveal",
      deadline: revealDeadline ? { label: "Reveal ends", epoch: revealDeadline } : null,
    };
  }

  return {
    label: "Resolved",
    className: `phase-pill ${resolvedClass(outcome)}`,
    outcomeLabel: outcome > 0 ? OUTCOME_LABEL[outcome] ?? "?" : undefined,
    deadline: null,
  };
}
