import type { Metadata } from "next";
import Link from "next/link";
import { jurorDemos } from "../../lib/juror-demos";
import SplitText from "../components/reactbits/SplitText";
import { PresentationDeck, type DeckSlide } from "../components/PresentationDeck";

export const metadata: Metadata = {
  title: "Juror demos - TruthMarket",
  description:
    "Judge-facing demo pages for TruthMarket bounty tracks, integrations, code highlights, and fit.",
};

const SPONSOR_ACCENT: Record<string, string> = {
  "Ethereum public goods": "ethereum",
  Swarm: "swarm",
  SpaceComputer: "space",
  Apify: "apify",
  Umia: "umia",
  Sourcify: "sourcify",
};

const ROOT_PRESENTATION_SLIDES = [
  {
    number: "01",
    eyebrow: "Why so many bounties",
    title: "One protocol, seven sponsor lenses.",
    lede:
      "We took every track that fit — under one rule: each had to make the same protocol stronger, not earn a logo sticker. The result is one product with seven defendable receipts.",
    keywords: ["one protocol", "seven tracks", "receipts in code"],
  },
  {
    number: "02",
    eyebrow: "What we built",
    title: "Verify the unverifiable.",
    lede:
      "Prediction markets for probabilistic or hard-to-verify outputs: is this AI-generated, should we launch an MVP or full product, what AI framework should we use? People stake, commits stay hidden, public randomness draws a jury, and selected jurors resolve the outcome under locked rules.",
    keywords: ["probabilistic outputs", "unverifiable claims", "random jury", "locked rules"],
  },
  {
    number: "03",
    eyebrow: "Why it works",
    title: "Fairness is a process, not a person.",
    lede:
      "No oracle. No moderator. No operator back door. Trust comes from procedure — shared rules, private commits, public randomness, count-based jurors — not from the platform running the page.",
    keywords: ["no oracle", "no moderator", "one juror = one vote"],
  },
  {
    number: "04",
    eyebrow: "Sponsor strategy",
    title: "Each sponsor gets a real job.",
    lede:
      "No logo wallpaper. Apify + X402 feeds unresolved claims. Swarm freezes the immutable claim/rules document and stores the app index. SpaceComputer draws selected jurors. Sourcify lets judges verify the code. Future Society explains why this should exist; Umia explains how it can grow.",
    keywords: ["discover", "store", "randomness", "verify", "venture"],
  },
  {
    number: "05",
    eyebrow: "The judge pitch",
    title: "Lock. Hide. Draw. Reveal. Settle.",
    lede:
      "One breath, five verbs, one protocol. Disputed beliefs become markets, randomness selects jurors, and matching the jury wins. Memorable, demoable, defensible — not six side quests glued to a logo wall.",
    keywords: ["one breath", "five verbs", "one protocol"],
  },
];

type RootTrackRole = {
  stage: string;
  role: string;
};

const ROOT_TRACK_ROLES: Record<string, RootTrackRole> = {
  "apify-x402": {
    stage: "1 · Discover",
    role: "Agents pay Apify via X402 to find unresolved claims",
  },
  "swarm-verified-fetch": {
    stage: "2 · Lock rules",
    role: "Fetch rules from any gateway, verify the hash locally",
  },
  "swarm-kv": {
    stage: "3 · Index app data",
    role: "get / put / list / delete on Swarm — no central DB",
  },
  "space-powered-security": {
    stage: "4 · Pick jury",
    role: "cTRNG draws the resolving jury, on-chain, after commits lock",
  },
  sourcify: {
    stage: "5 · Verify code",
    role: "Prove every market clone runs the canonical contract",
  },
  "future-society": {
    stage: "Lens · Use case",
    role: "Public-good process for contested claims",
  },
  "agentic-venture": {
    stage: "Lens · Venture",
    role: "Community-owned token + revenue path via Umia",
  },
};

const ROOT_TRACK_ORDER: string[] = [
  "apify-x402",
  "swarm-verified-fetch",
  "swarm-kv",
  "space-powered-security",
  "sourcify",
  "future-society",
  "agentic-venture",
];

export default function JurorsPage() {
  return (
    <main className="page-shell jurors-page">
      <section className="page-header juror-hero juror-hero-v2">
        <p className="eyebrow">Juror presentation guide</p>
        <h1>Pick a sponsor. Judge in five minutes.</h1>
        <p className="page-header-sub">
          Every track opens on a Judging view (proof, criteria, code, install). Flip to the
          Presentation deck for a paced pitch &mdash; QR + share live on the last slide.
        </p>
        <div className="juror-hero-cta">
          <Link href="/" className="page-header-cta">
            Try a live market
          </Link>
          <a
            href="https://github.com/schaier-io/eth2026/blob/main/CONTEXT.md"
            className="page-header-cta page-header-cta-ghost"
            target="_blank"
            rel="noreferrer"
          >
            Read the protocol context
          </a>
        </div>
        <div className="juror-hero-flow" aria-label="TruthMarket flow">
          <span>Locked rules</span>
          <span>Private commit</span>
          <span>Random selected jurors</span>
          <span>Reveal and settle</span>
        </div>
      </section>

      <section className="juror-root-presentation" aria-labelledby="root-pitch-title">
        <div className="juror-section-head juror-root-presentation-head">
          <div>
            <p className="eyebrow">Root presentation</p>
            <SplitText
              text="The all-tracks story judges should remember"
              id="root-pitch-title"
              tag="h2"
              className="juror-root-split-title"
              splitType="words"
              textAlign="left"
              delay={60}
              duration={0.8}
              from={{ opacity: 0, y: 28, filter: "blur(8px)" }}
              to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            />
            <p className="juror-root-sub">
              Six slides, one breath. End on a sponsor grid &mdash; open any track or jump
              straight to its judging criteria.
            </p>
          </div>
          <Link href="/" className="juror-inline-link">
            Open live markets &rarr;
          </Link>
        </div>

        <PresentationDeck
          ariaLabel="TruthMarket all-tracks story"
          className="juror-deck-root"
          storageKey="truthmarket:juror-root-deck"
          slides={[
            ...ROOT_PRESENTATION_SLIDES.map((slide, idx): DeckSlide => {
              const isHero = idx === 0;
              const lede = (
                <p className="juror-pres-slide-lede">{slide.lede}</p>
              );
              const keywords = (
                <div
                  className="juror-root-keywords"
                  aria-label={`${slide.eyebrow} keywords`}
                >
                  {slide.keywords.map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
              );
              const mantra =
                idx === 1 ? (
                  <p className="juror-deck-mantra">
                    <span>You get the truth.</span>
                    <span>Or you get the decision.</span>
                  </p>
                ) : null;
              const body = isHero ? (
                <div className="juror-deck-hero-grid">
                  <div className="juror-deck-hero-copy">
                    {lede}
                    {keywords}
                  </div>
                  <div className="juror-deck-hero-video">
                    <p className="juror-deck-hero-video-label">Watch the demo</p>
                    <div className="juror-video-frame">
                      <iframe
                        src="https://www.youtube.com/embed/IiOAxkoWmYs?rel=0&modestbranding=1"
                        title="TruthMarket demo video"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>
                    <a
                      className="juror-deck-hero-video-link"
                      href="https://www.youtube.com/watch?v=IiOAxkoWmYs"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open on YouTube &rarr;
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  {mantra}
                  {lede}
                  {keywords}
                </>
              );
              return {
                id: `root-${slide.number}`,
                number: slide.number,
                eyebrow: slide.eyebrow,
                title: slide.title,
                kind: isHero ? "hero" : "act",
                body,
              };
            }),
            {
              id: "root-06",
              number: "06",
              eyebrow: "Go into the details",
              title: "The sponsor stack — pick a lens.",
              kind: "stack",
              body: (
                <div className="juror-deck-stack-wrap">
                  <div className="juror-deck-stack-copy">
                    <p className="juror-pres-slide-lede">
                      Same flow the protocol runs at execution time. Open any track for
                      the full pitch, or jump straight to the judging criteria card.
                    </p>
                    <ol className="juror-deck-stack-list">
                      {ROOT_TRACK_ORDER.map((slug) => {
                        const demo = jurorDemos.find((d) => d.slug === slug);
                        const role = ROOT_TRACK_ROLES[slug];
                        if (!demo || !role) return null;
                        const accent = SPONSOR_ACCENT[demo.sponsor] ?? "default";
                        return (
                          <li
                            className="juror-deck-stack-item"
                            data-accent={accent}
                            key={slug}
                          >
                            <div className="juror-deck-stack-copy-block">
                              <span className="juror-deck-stack-stage">{role.stage}</span>
                              <span className="juror-deck-stack-name">{demo.shortTitle}</span>
                              <span className="juror-deck-stack-role">{role.role}</span>
                            </div>
                            <div className="juror-deck-stack-links">
                              <Link
                                href={`/jurors/${slug}`}
                                className="juror-deck-stack-cta"
                              >
                                Open track &rarr;
                              </Link>
                              <Link
                                href={`/jurors/${slug}#judging-criteria`}
                                className="juror-deck-stack-secondary"
                              >
                                Judging criteria &rarr;
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  <a
                    className="juror-qr-card juror-deck-qr-card"
                    href="https://www.truth-market.xyz/jurors"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open the juror presentation guide at truth-market.xyz"
                  >
                    <span className="juror-qr-kicker">Scan &middot; share &middot; revisit</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/juror-qr/index.svg"
                      alt="QR code linking to truth-market.xyz/jurors"
                    />
                    <span className="juror-qr-url">www.truth-market.xyz/jurors</span>
                    <span className="juror-qr-note">
                      Carries the whole judging surface. Scan to revisit any track later.
                    </span>
                  </a>
                </div>
              ),
            },
          ]}
        />
      </section>
    </main>
  );
}
