const LOOP_TITLE_AFTER = 22;

export function MarketCardTitle({ title }: { title: string }) {
  const shouldLoop = title.length > LOOP_TITLE_AFTER;

  return (
    <h2
      className={`market-card-name${shouldLoop ? " market-card-name-loop" : ""}`}
      title={title}
      aria-label={title}
    >
      {shouldLoop ? (
        <span className="market-card-name-track" aria-hidden="true">
          <span>{title}</span>
          <span>{title}</span>
        </span>
      ) : (
        title
      )}
    </h2>
  );
}
