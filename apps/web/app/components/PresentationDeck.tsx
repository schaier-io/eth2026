"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

export type DeckSlide = {
  id: string;
  number: string;
  eyebrow: string;
  title: ReactNode;
  body: ReactNode;
  kind?: string;
};

type Props = {
  slides: DeckSlide[];
  ariaLabel: string;
  className?: string;
  /** Persist selected slide via this key in sessionStorage. */
  storageKey?: string;
  /** Read keyboard arrows globally. Default: true. */
  enableKeyboard?: boolean;
};

export function PresentationDeck({
  slides,
  ariaLabel,
  className,
  storageKey,
  enableKeyboard = true,
}: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const setSlideFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const nextIndex = slides.findIndex(
        (slide) => hash === slide.id || hash === `juror-deck-slide-${slide.id}`,
      );
      if (nextIndex < 0) return;

      setIndex(nextIndex);
      window.requestAnimationFrame(() => {
        document
          .getElementById(`juror-deck-slide-${slides[nextIndex].id}`)
          ?.scrollIntoView({ block: "start" });
      });
    };

    setSlideFromHash();
    window.addEventListener("hashchange", setSlideFromHash);
    return () => window.removeEventListener("hashchange", setSlideFromHash);
  }, [slides]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    const hashMatchesSlide = slides.some(
      (slide) => hash === slide.id || hash === `juror-deck-slide-${slide.id}`,
    );
    if (hashMatchesSlide) return;
    const saved = sessionStorage.getItem(storageKey);
    if (saved == null) return;
    const n = Number(saved);
    if (Number.isFinite(n) && n >= 0 && n < slides.length) {
      setIndex(n);
    }
  }, [storageKey, slides]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    sessionStorage.setItem(storageKey, String(index));
  }, [storageKey, index]);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, slides.length - 1));
  }, [slides.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    if (!enableKeyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          target.isContentEditable ||
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT"
        ) {
          return;
        }
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Home") {
        e.preventDefault();
        setIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setIndex(slides.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enableKeyboard, goNext, goPrev, slides.length]);

  const cur = slides[index];
  const total = slides.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;

  if (!cur) return null;

  return (
    <div
      className={`juror-deck ${className ?? ""}`.trim()}
      role="region"
      aria-roledescription="slideshow"
      aria-label={ariaLabel}
    >
      <div className="juror-deck-progress" role="tablist" aria-label="Slide navigation">
        {slides.map((s, i) => (
          <button
            type="button"
            key={s.id}
            role="tab"
            aria-selected={i === index}
            aria-controls={`juror-deck-slide-${s.id}`}
            className={`juror-deck-dot ${i === index ? "is-active" : ""} ${
              i < index ? "is-past" : ""
            }`}
            onClick={() => setIndex(i)}
          >
            <span aria-hidden>{s.number}</span>
            <span className="sr-only">{`Go to slide ${i + 1} of ${total}: ${s.eyebrow}`}</span>
          </button>
        ))}
      </div>

      <article
        className={`juror-deck-slide juror-deck-slide-${cur.kind ?? "default"}`}
        id={`juror-deck-slide-${cur.id}`}
        role="tabpanel"
        aria-live="polite"
        key={cur.id}
      >
        <header className="juror-deck-slide-head">
          <span className="juror-deck-slide-number">{cur.number}</span>
          <span className="juror-deck-slide-eyebrow">{cur.eyebrow}</span>
          <span className="juror-deck-slide-counter" aria-hidden>
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
        </header>
        <h2 className="juror-deck-slide-title">{cur.title}</h2>
        <div className="juror-deck-slide-body">{cur.body}</div>
      </article>

      <div className="juror-deck-controls">
        <button
          type="button"
          className="juror-deck-nav juror-deck-nav-prev"
          onClick={goPrev}
          disabled={isFirst}
          aria-label="Previous slide"
        >
          <span aria-hidden>&larr;</span> Previous
        </button>
        <button
          type="button"
          className="juror-deck-nav juror-deck-nav-next"
          onClick={goNext}
          disabled={isLast}
          aria-label="Next slide"
        >
          Next <span aria-hidden>&rarr;</span>
        </button>
      </div>
    </div>
  );
}
