import type { ContractVerification } from "../../lib/contract-verification";

export function SourcifyBadge({
  verification,
  compact = false,
  asLink = true,
}: {
  verification: ContractVerification | undefined;
  compact?: boolean;
  /** Render as a span instead of an anchor — required when this badge sits inside another `<a>` (e.g. a market card link). */
  asLink?: boolean;
}) {
  if (!verification) return null;

  const text = compact && verification.status === "verified" ? "Sourcify" : verification.label;
  const className = `sourcify-badge sourcify-badge-${verification.status}`;

  if (asLink && verification.sourcifyUrl) {
    return (
      <a className={className} href={verification.sourcifyUrl} target="_blank" rel="noreferrer" title={verification.title}>
        {text}
      </a>
    );
  }

  return (
    <span className={className} title={verification.title}>
      {text}
    </span>
  );
}

