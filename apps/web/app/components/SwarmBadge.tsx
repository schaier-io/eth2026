export function SwarmBadge({
  verified,
  url,
  error,
  compact = false,
  className = "",
  asLink = true,
}: {
  verified: boolean | undefined;
  url?: string | null;
  error?: string;
  compact?: boolean;
  className?: string;
  /** Render as a span instead of an anchor — required when this badge sits inside another `<a>` (e.g. a market card link). */
  asLink?: boolean;
}) {
  if (verified === undefined) return null;

  const label = verified ? (compact ? "Swarm" : "Swarm verified") : compact ? "Swarm issue" : "Swarm unverified";
  const title = verified
    ? "Immutable claim/rules document verified from Swarm."
    : `Claim/rules document failed Swarm verification${error ? `: ${error}` : "."}`;
  const cls = `swarm-badge ${verified ? "swarm-badge-verified" : "swarm-badge-unverified"} ${className}`.trim();
  const content = (
    <>
      <BeeIcon />
      <span>{label}</span>
    </>
  );

  if (asLink && url) {
    return (
      <a className={cls} href={url} target="_blank" rel="noreferrer" title={title}>
        {content}
      </a>
    );
  }

  return (
    <span className={cls} title={title}>
      {content}
    </span>
  );
}

function BeeIcon() {
  return (
    <svg className="swarm-badge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="swarm-badge-wing" d="M7.2 8.4C4.2 5.8 2.2 6.5 2 9.2c-.2 2.4 2.1 3.7 5.2 2.1" />
      <path className="swarm-badge-wing" d="M16.8 8.4c3-2.6 5-1.9 5.2.8.2 2.4-2.1 3.7-5.2 2.1" />
      <path className="swarm-badge-body" d="M7.4 12.2c0-3.5 2-5.7 4.6-5.7s4.6 2.2 4.6 5.7-2 5.7-4.6 5.7-4.6-2.2-4.6-5.7Z" />
      <path className="swarm-badge-stripe" d="M8.1 10.1h7.8" />
      <path className="swarm-badge-stripe" d="M7.8 13.2h8.4" />
      <path className="swarm-badge-stripe" d="M9.3 16h5.4" />
      <path className="swarm-badge-antenna" d="M10.3 6.9 8.9 4.8M13.7 6.9l1.4-2.1" />
    </svg>
  );
}
