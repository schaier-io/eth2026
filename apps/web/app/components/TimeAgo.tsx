"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Unix epoch seconds. */
  deadline: number;
  /** Renders this string before the JS hook runs (avoids hydration mismatch). */
  fallback?: string;
}

function formatRelative(secondsLeft: number): string {
  if (secondsLeft <= 0) {
    return formatPast(-secondsLeft);
  }
  return `in ${formatDuration(secondsLeft)}`;
}

function formatPast(secondsAgo: number): string {
  return `${formatDuration(secondsAgo)} ago`;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ${secs % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function TimeAgo({ deadline, fallback }: Props) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (now === null) {
    return <span className="time-ago time-ago-pending">{fallback ?? "…"}</span>;
  }
  const delta = deadline - now;
  const cls = delta <= 0 ? "time-ago time-ago-past" : "time-ago time-ago-future";
  return <span className={cls}>{formatRelative(delta)}</span>;
}
