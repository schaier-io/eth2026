"use client";

import { useEffect, useMemo, useState } from "react";

interface AgentMarketCountdownProps {
  intervalSeconds?: number;
  marketDurationSeconds?: number;
}

function nextIntervalBoundary(nowSeconds: number, intervalSeconds: number): number {
  return Math.floor(nowSeconds / intervalSeconds) * intervalSeconds + intervalSeconds;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

export function AgentMarketCountdown({
  intervalSeconds = 3600,
  marketDurationSeconds = 3600,
}: AgentMarketCountdownProps) {
  const [nowSeconds, setNowSeconds] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNowSeconds(Math.floor(Date.now() / 1000));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);

  const targetEpoch = useMemo(() => {
    if (nowSeconds === null) return null;
    return nextIntervalBoundary(nowSeconds, intervalSeconds);
  }, [intervalSeconds, nowSeconds]);

  const remainingSeconds =
    nowSeconds !== null && targetEpoch !== null ? Math.max(0, targetEpoch - nowSeconds) : null;

  return (
    <section className="agent-countdown" aria-label="Hourly Reddit market agent">
      <div className="agent-countdown-copy">
        <span className="agent-countdown-kicker">Apify Reddit agent</span>
        <strong>Next market launches in</strong>
      </div>
      <time className="agent-countdown-time" dateTime={targetEpoch ? new Date(targetEpoch * 1000).toISOString() : undefined}>
        {remainingSeconds === null ? "…" : formatDuration(remainingSeconds)}
      </time>
      <dl className="agent-countdown-meta">
        <div>
          <dt>Cadence</dt>
          <dd>{formatMinutes(intervalSeconds)}</dd>
        </div>
        <div>
          <dt>Market</dt>
          <dd>{formatMinutes(marketDurationSeconds)}</dd>
        </div>
      </dl>
    </section>
  );
}
