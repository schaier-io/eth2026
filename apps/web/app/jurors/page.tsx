import type { Metadata } from "next";
import Link from "next/link";
import { jurorDemos } from "../../lib/juror-demos";

export const metadata: Metadata = {
  title: "Juror demos - TruthMarket",
  description:
    "Judge-facing demo pages for TruthMarket bounty tracks, integrations, code highlights, and fit.",
};

export default function JurorsPage() {
  return (
    <main className="page-shell jurors-page">
      <section className="page-header juror-hero">
        <p className="eyebrow">Juror presentation guide</p>
        <h1>Walk through the bounty story, one track at a time.</h1>
        <p className="page-header-sub">
          Start with the product frame, then open a track for a paced
          presentation: why it fits, what was implemented, what to demo, how it
          meets the criteria, and which code proves it.
        </p>
        <div className="juror-hero-flow" aria-label="TruthMarket flow">
          <span>Locked rules</span>
          <span>Private commit</span>
          <span>Random selected jurors</span>
          <span>Reveal and settle</span>
        </div>
      </section>

      <section className="juror-intro-grid" aria-label="What jurors can inspect">
        <div>
          <p className="eyebrow">Opening frame</p>
          <h2>Polymarket-style belief, resolved without a single resolver.</h2>
        </div>
        <p>
          TruthMarket is for claims that are too subjective, probabilistic, or
          disputed for a normal external answer. The product promise is process:
          immutable claim/rules documents, private committed votes,
          SpaceComputer-selected jurors, count-based reveals, slashing, and
          pull-pattern payouts.
        </p>
      </section>

      <section className="juror-market-hook" aria-label="Try TruthMarket yourself">
        <div>
          <p className="eyebrow">Or try it yourself</p>
          <h2>Open a market and feel the mechanism before the pitch.</h2>
          <p>
            Start from the live market surface: inspect the claim, read the
            locked rules, connect a wallet, and follow the commit, selected
            juror, reveal, and settlement flow.
          </p>
        </div>
        <div className="juror-market-hook-actions">
          <Link href="/" className="page-header-cta">
            Try a market yourself
          </Link>
          <Link href="/deploy" className="page-header-cta page-header-cta-ghost">
            Launch a market
          </Link>
        </div>
      </section>

      <section className="juror-review-steps" aria-label="Review steps">
        <article>
          <span>01</span>
          <h3>Pick a track</h3>
          <p>Choose the sponsor lens a judge cares about.</p>
        </article>
        <article>
          <span>02</span>
          <h3>Read the story</h3>
          <p>Each page opens with the fit before diving into proof.</p>
        </article>
        <article>
          <span>03</span>
          <h3>Inspect evidence</h3>
          <p>Implementation, demo path, criteria, and code appear in order.</p>
        </article>
        <article>
          <span>04</span>
          <h3>Run the flow</h3>
          <p>Use the live market surface after the track narrative is clear.</p>
        </article>
      </section>

      <section>
        <div className="juror-section-head">
          <div>
            <p className="eyebrow">Chapters</p>
            <h2>Select a presentation</h2>
          </div>
          <Link href="/" className="juror-inline-link">
            Open live markets
          </Link>
        </div>

        <div className="juror-track-list">
          {jurorDemos.map((demo, index) => (
            <Link
              href={`/jurors/${demo.slug}`}
              className="juror-track-row"
              key={demo.slug}
            >
              <span className="juror-track-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="juror-card-topline">
                <span>{demo.track}</span>
                <span>{demo.sponsor}</span>
              </div>
              <div className="juror-track-copy">
                <h3>{demo.shortTitle}</h3>
                <p>{demo.summary}</p>
              </div>
              <div className="juror-card-status">{demo.status}</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
