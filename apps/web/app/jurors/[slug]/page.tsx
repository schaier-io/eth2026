import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getJurorDemo,
  githubSourceUrl,
  jurorBootstrapScript,
  jurorDemos,
  jurorPackageLinks,
  jurorPresentationUrl,
  jurorQrCodeSrc,
  type JurorDemo,
} from "../../../lib/juror-demos";
import { JurorTabs } from "../../components/JurorTabs";
import BlurText from "../../components/reactbits/BlurText";
import { PresentationDeck, type DeckSlide } from "../../components/PresentationDeck";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return jurorDemos.map((demo) => ({ slug: demo.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const demo = getJurorDemo(slug);
  if (!demo) return {};

  return {
    title: `${demo.shortTitle} - TruthMarket juror demo`,
    description: demo.summary,
  };
}

export default async function JurorDemoPage({ params }: { params: Params }) {
  const { slug } = await params;
  const demo = getJurorDemo(slug);
  if (!demo) notFound();

  const presentationSlides = buildPresentationSlides(demo);

  return (
    <main className="page-shell juror-detail-page">
      <Link href="/jurors" className="back-link">
        Back to juror demos
      </Link>

      <section className="page-header juror-detail-hero">
        <div className="juror-detail-kicker">
          <span>{demo.track}</span>
          <span>{demo.sponsor}</span>
          <span className="juror-status-pill">{demo.status}</span>
        </div>
        <h1>{demo.title}</h1>
        <p className="page-header-sub">{demo.summary}</p>
        <div className="juror-detail-meta">
          <div className="juror-detail-meta-item">
            <span className="juror-detail-meta-label">Shipped claims</span>
            <span className="juror-detail-meta-value">{demo.implemented.length}</span>
          </div>
          <div className="juror-detail-meta-item">
            <span className="juror-detail-meta-label">Code receipts</span>
            <span className="juror-detail-meta-value">{demo.code.length}</span>
          </div>
          <div className="juror-detail-meta-item">
            <span className="juror-detail-meta-label">Demo steps</span>
            <span className="juror-detail-meta-value">{demo.demoFlow.length}</span>
          </div>
          <div className="juror-detail-meta-item">
            <span className="juror-detail-meta-label">Rubric items</span>
            <span className="juror-detail-meta-value">{demo.criteria.length}</span>
          </div>
        </div>
      </section>

      <JurorTabs
        presentationSlideCount={presentationSlides.length}
        implementation={<JudgingView demo={demo} />}
        presentation={
          <PresentationView demo={demo} slides={presentationSlides} />
        }
      />
    </main>
  );
}

function JudgingView({ demo }: { demo: JurorDemo }) {
  return (
    <div className="juror-impl">
      <section className="juror-impl-grid juror-impl-build">
        <header className="juror-section-card-head">
          <span className="juror-section-step">01</span>
          <div>
            <p className="eyebrow">What we shipped</p>
            <h2>What you can verify, line by line</h2>
            <p className="juror-section-sub">
              Each item is a defendable claim. Open the code below or follow the GitHub link
              on any snippet to confirm against the source.
            </p>
          </div>
        </header>
        <ul className="juror-proof-list juror-proof-list-rich">
          {demo.implemented.map((item) => (
            <li key={item}>
              <span className="juror-proof-tag">Shipped</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="judging-criteria"
        className="juror-impl-grid juror-impl-criteria"
        style={{ scrollMarginTop: 96 }}
      >
        <header className="juror-section-card-head">
          <span className="juror-section-step">02</span>
          <div>
            <p className="eyebrow">Judging rubric</p>
            <h2>How we meet your published criteria</h2>
            <p className="juror-section-sub">
              One card per criterion from the {demo.sponsor} bounty brief. Direct, specific,
              and tied back to shipped behavior — no rubric padding.
            </p>
          </div>
        </header>
        <div className="juror-criteria-grid">
          {demo.criteria.map((criterion, idx) => (
            <article className="juror-criterion juror-criterion-rich" key={criterion.label}>
              <span className="juror-criterion-num">{String(idx + 1).padStart(2, "0")}</span>
              <h3>{criterion.label}</h3>
              <p>{criterion.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="juror-impl-grid juror-impl-code">
        <header className="juror-section-card-head">
          <span className="juror-section-step">03</span>
          <div>
            <p className="eyebrow">Receipts</p>
            <h2>The exact lines, on GitHub</h2>
            <p className="juror-section-sub">
              First snippet is open; the rest expand on click. Every header links straight
              to the source on the {`'main'`} branch — no deep-link guessing.
            </p>
          </div>
        </header>
        <div className="juror-code-accordion">
          {demo.code.map((block, idx) => (
            <details
              className="juror-code-card"
              key={`${block.source}-${block.title}`}
              open={idx === 0}
            >
              <summary>
                <div>
                  <h3>{block.title}</h3>
                  <a
                    className="juror-source-link"
                    href={githubSourceUrl(block.source, block.line)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {block.source}:L{block.line}
                  </a>
                </div>
                <span>{block.language}</span>
              </summary>
              <pre>
                <code>{block.snippet}</code>
              </pre>
            </details>
          ))}
        </div>
      </section>

      <section className="juror-impl-grid juror-impl-install">
        <header className="juror-section-card-head">
          <span className="juror-section-step">04</span>
          <div>
            <p className="eyebrow">Run it yourself</p>
            <h2>Two published packages, one bootstrap script</h2>
            <p className="juror-section-sub">
              The Swarm packages are live on npm. The CLI script installs, builds, starts anvil,
              deploys mock contracts, and writes a default policy — full local stack in one command.
            </p>
          </div>
        </header>
        <div className="juror-install-grid">
          {jurorPackageLinks.map((pkg) => (
            <article className="juror-install-card" key={pkg.name}>
              <h3>{pkg.name}</h3>
              <p>{pkg.description}</p>
              <pre className="juror-command">
                <code>{pkg.install}</code>
              </pre>
              <a href={pkg.url} target="_blank" rel="noreferrer">
                Open npm package &rarr;
              </a>
            </article>
          ))}
          <article className="juror-install-card juror-script-card">
            <h3>{jurorBootstrapScript.label}</h3>
            <p>{jurorBootstrapScript.description}</p>
            <pre className="juror-command">
              <code>{jurorBootstrapScript.command}</code>
            </pre>
            <a
              href={githubSourceUrl(jurorBootstrapScript.source, jurorBootstrapScript.line)}
              target="_blank"
              rel="noreferrer"
            >
              Open skills.sh &rarr;
            </a>
          </article>
        </div>
      </section>

      {demo.limits?.length ? (
        <section className="juror-impl-grid juror-impl-limits">
          <header className="juror-section-card-head">
            <span className="juror-section-step juror-section-step-warn">!</span>
            <div>
              <p className="eyebrow">Honest scope</p>
              <h2>What we are not claiming</h2>
              <p className="juror-section-sub">
                Hackathon-honest: here is exactly where the implementation stops and what would
                land next.
              </p>
            </div>
          </header>
          <ul className="juror-proof-list juror-limits-list">
            {demo.limits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type PresentationSlide = {
  number: string;
  eyebrow: string;
  title: string;
  lede?: string;
  kind: "fit" | "flow" | "limits" | "cta";
  bullets?: string[];
};

function buildPresentationSlides(demo: JurorDemo): PresentationSlide[] {
  const slides: PresentationSlide[] = [];

  slides.push({
    number: "01",
    eyebrow: "Why this fits",
    title: demo.fitTagline,
    lede: demo.status,
    kind: "fit",
    bullets: demo.pitchHighlights,
  });

  slides.push({
    number: "02",
    eyebrow: "Demo flow",
    title: "Show, don't tell",
    kind: "flow",
    bullets: demo.demoFlow,
  });

  if (demo.limits?.length) {
    slides.push({
      number: "03",
      eyebrow: "Honest scope",
      title: "What not to overclaim",
      kind: "limits",
      bullets: demo.limits,
    });
  }

  slides.push({
    number: String(slides.length + 1).padStart(2, "0"),
    eyebrow: "Take it with you",
    title: demo.cta.headline,
    lede: demo.cta.body,
    kind: "cta",
  });

  return slides;
}

function PresentationView({
  demo,
  slides,
}: {
  demo: JurorDemo;
  slides: PresentationSlide[];
}) {
  const publicPresentationUrl = jurorPresentationUrl(demo.slug);
  const publicPresentationLabel = publicPresentationUrl.replace(/^https:\/\//, "");
  const qrCodeSrc = jurorQrCodeSrc(demo.slug);

  const deckSlides: DeckSlide[] = slides.map((slide) => {
    const titleNode =
      slide.kind === "cta" ? (
        <BlurText
          text={slide.title}
          tag="span"
          className="juror-pres-blur-title"
          animateBy="words"
          direction="bottom"
          delay={70}
          stepDuration={0.38}
        />
      ) : (
        slide.title
      );

    let body: React.ReactNode = null;
    if (slide.kind === "fit" && slide.bullets) {
      body = (
        <>
          {slide.lede ? <p className="juror-pres-slide-lede">{slide.lede}</p> : null}
          <ul className="juror-pres-bullets">
            {slide.bullets.map((b) => (
              <li key={b}>
                <span className="juror-pres-bullet-dot" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </>
      );
    } else if (slide.kind === "flow" && slide.bullets) {
      body = (
        <>
          {slide.lede ? <p className="juror-pres-slide-lede">{slide.lede}</p> : null}
          <ol className="juror-flow-list juror-flow-list-rich">
            {slide.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ol>
        </>
      );
    } else if (slide.kind === "limits" && slide.bullets) {
      body = (
        <>
          {slide.lede ? <p className="juror-pres-slide-lede">{slide.lede}</p> : null}
          <ul className="juror-proof-list juror-limits-list">
            {slide.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </>
      );
    } else if (slide.kind === "cta") {
      body = (
        <div className="juror-pres-cta-wrap">
          <div className="juror-pres-cta-copy">
            {slide.lede ? <p className="juror-pres-slide-lede">{slide.lede}</p> : null}
            <div className="juror-pres-cta-actions">
              <PresentationLink href={demo.cta.primaryHref} className="page-header-cta">
                {demo.cta.primaryLabel}
              </PresentationLink>
              <PresentationLink
                href={demo.cta.secondaryHref}
                className="page-header-cta page-header-cta-ghost"
              >
                {demo.cta.secondaryLabel}
              </PresentationLink>
            </div>
          </div>
          <a
            className="juror-qr-card"
            href={publicPresentationUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${demo.shortTitle} presentation at truth-market.xyz`}
          >
            <span className="juror-qr-kicker">Scan &middot; share &middot; revisit</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCodeSrc} alt={`QR code linking to ${publicPresentationLabel}`} />
            <span className="juror-qr-url">{publicPresentationLabel}</span>
            <span className="juror-qr-note">
              Opens this exact subpage once the site is deployed.
            </span>
          </a>
        </div>
      );
    }

    return {
      id: `${demo.slug}-${slide.number}`,
      number: slide.number,
      eyebrow: slide.eyebrow,
      title: titleNode,
      body,
      kind: slide.kind,
    };
  });

  return (
    <PresentationDeck
      slides={deckSlides}
      ariaLabel={`${demo.shortTitle} presentation`}
      className="juror-deck-track"
      storageKey={`truthmarket:juror-deck-${demo.slug}`}
    />
  );
}

function PresentationLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  if (href.startsWith("http")) {
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
