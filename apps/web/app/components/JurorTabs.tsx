"use client";

import { useEffect, useState, type ReactNode } from "react";

type TabKey = "implementation" | "presentation";

const STORAGE_KEY = "truthmarket:juror-detail-tab";

export function JurorTabs({
  implementation,
  presentation,
  presentationSlideCount,
}: {
  implementation: ReactNode;
  presentation: ReactNode;
  presentationSlideCount: number;
}) {
  const [tab, setTab] = useState<TabKey>("implementation");

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved === "implementation" || saved === "presentation") {
      setTab(saved);
    }
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash === "#presentation") setTab("presentation");
    if (hash === "#implementation") setTab("implementation");
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, tab);
  }, [tab]);

  return (
    <div className="juror-tabs" data-active-tab={tab}>
      <div className="juror-tabs-bar" role="tablist" aria-label="Juror view">
        <button
          type="button"
          role="tab"
          id="juror-tab-implementation"
          aria-selected={tab === "implementation"}
          aria-controls="juror-panel-implementation"
          tabIndex={tab === "implementation" ? 0 : -1}
          className={`juror-tab ${tab === "implementation" ? "is-active" : ""}`}
          onClick={() => setTab("implementation")}
        >
          <span className="juror-tab-eyebrow">Build proof</span>
          <span className="juror-tab-title">Evidence</span>
          <span className="juror-tab-meta">Build proof &middot; rubric &middot; code &middot; runbook</span>
        </button>
        <button
          type="button"
          role="tab"
          id="juror-tab-presentation"
          aria-selected={tab === "presentation"}
          aria-controls="juror-panel-presentation"
          tabIndex={tab === "presentation" ? 0 : -1}
          className={`juror-tab ${tab === "presentation" ? "is-active" : ""}`}
          onClick={() => setTab("presentation")}
        >
          <span className="juror-tab-eyebrow">Judge story</span>
          <span className="juror-tab-title">Story deck</span>
          <span className="juror-tab-meta">{presentationSlideCount} crisp slides</span>
        </button>
      </div>

      <div
        role="tabpanel"
        id="juror-panel-implementation"
        aria-labelledby="juror-tab-implementation"
        hidden={tab !== "implementation"}
        className="juror-tab-panel"
      >
        {implementation}
      </div>
      <div
        role="tabpanel"
        id="juror-panel-presentation"
        aria-labelledby="juror-tab-presentation"
        hidden={tab !== "presentation"}
        className="juror-tab-panel"
      >
        {presentation}
      </div>
    </div>
  );
}
