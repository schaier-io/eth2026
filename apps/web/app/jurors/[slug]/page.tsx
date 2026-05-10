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
} from "../../../lib/juror-demos";

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
  const scopeSlideNumber = "07";
  const ctaSlideNumber = demo.limits?.length ? "08" : "07";
  const publicPresentationUrl = jurorPresentationUrl(demo.slug);
  const publicPresentationLabel = publicPresentationUrl.replace(/^https:\/\//, "");
  const qrCodeSrc = jurorQrCodeSrc(demo.slug);

  return (
    <main className="page-shell juror-detail-page">
      <Link href="/jurors" className="back-link">
        Back to juror demos
      </Link>

      <section className="page-header juror-detail-hero">
        <div className="juror-detail-kicker">
          <span>{demo.track}</span>
          <span>{demo.sponsor}</span>
        </div>
        <h1>{demo.title}</h1>
        <p className="page-header-sub">{demo.summary}</p>
        <div className="juror-presentation-map" aria-label="Presentation sections">
          <span>01 Fit</span>
          <span>02 Build</span>
          <span>03 Demo</span>
          <span>04 Criteria</span>
          <span>05 Code</span>
          <span>06 Install</span>
          {demo.limits?.length ? <span>07 Scope</span> : null}
          <span>{ctaSlideNumber} CTA + QR</span>
        </div>
        <div className="page-header-actions">
          <a
            href={publicPresentationUrl}
            className="page-header-cta"
            target="_blank"
            rel="noreferrer"
          >
            Try at truth-market.xyz
          </a>
          <Link href="/demo" className="page-header-cta page-header-cta-ghost">
            Open local demo
          </Link>
          <Link href="/jurors" className="page-header-cta page-header-cta-ghost">
            Select another track
          </Link>
        </div>
      </section>

      <section className="juror-presentation">
        <article className="juror-slide">
          <div className="juror-slide-number">01</div>
          <div className="juror-slide-copy">
            <p className="eyebrow">Why this track fits</p>
            <h2>{demo.status}</h2>
            <p>{demo.fit}</p>
            <div className="juror-slide-callout">
              TruthMarket is presented here as a random-jury belief-resolution
              system: sponsors support the mechanism, but selected jurors
              resolve the market under locked rules.
            </div>
          </div>
        </article>

        <article className="juror-slide">
          <div className="juror-slide-number">02</div>
          <div className="juror-slide-copy">
            <p className="eyebrow">What was implemented</p>
            <h2>The build, in plain English</h2>
            <p>
              These are the judge-facing proof points to mention before opening
              a terminal or contract page. They connect the bounty requirement
              to working product behavior.
            </p>
            <ul className="juror-proof-list">
              {demo.implemented.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </article>

        <article className="juror-slide">
          <div className="juror-slide-number">03</div>
          <div className="juror-slide-copy">
            <p className="eyebrow">Demo sequence</p>
            <h2>Show it as a story, not a checklist</h2>
            <p>
              Walk through the experience in this order. It gives judges a
              beginning, middle, and resolution moment.
            </p>
            <ol className="juror-flow-list">
              {demo.demoFlow.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </article>

        <article className="juror-slide">
          <div className="juror-slide-number">04</div>
          <div className="juror-slide-copy">
            <p className="eyebrow">Judging criteria</p>
            <h2>How the track is satisfied</h2>
            <p>
              Use this section when a judge asks how the work maps back to the
              bounty rubric. Each point is framed as a direct answer.
            </p>
            <div className="juror-criteria-grid">
              {demo.criteria.map((criterion) => (
                <article className="juror-criterion" key={criterion.label}>
                  <h3>{criterion.label}</h3>
                  <p>{criterion.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </article>

        <article className="juror-slide">
          <div className="juror-slide-number">05</div>
          <div className="juror-slide-copy">
            <p className="eyebrow">Evidence</p>
            <h2>Open code only when it helps</h2>
            <p>
              The first snippet is open by default. Additional snippets stay
              collapsed so the page keeps its presentation rhythm.
            </p>
            <div className="juror-code-accordion">
              {demo.code.map((block) => (
                <details
                  className="juror-code-card"
                  key={`${block.source}-${block.title}`}
                  open={block === demo.code[0]}
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
          </div>
        </article>

        <article className="juror-slide">
          <div className="juror-slide-number">06</div>
          <div className="juror-slide-copy">
            <p className="eyebrow">Install and run</p>
            <h2>Give judges something they can open or copy.</h2>
            <p>
              The Swarm packages are published on npm, and the CLI bootstrap
              script gives a fast local path for running the agent demo.
            </p>
            <div className="juror-install-grid">
              {jurorPackageLinks.map((pkg) => (
                <article className="juror-install-card" key={pkg.name}>
                  <h3>{pkg.name}</h3>
                  <p>{pkg.description}</p>
                  <pre className="juror-command">
                    <code>{pkg.install}</code>
                  </pre>
                  <a href={pkg.url} target="_blank" rel="noreferrer">
                    Open npm package
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
                  Open skills.sh
                </a>
              </article>
            </div>
          </div>
        </article>

        {demo.limits?.length ? (
          <article className="juror-slide juror-slide-limits">
            <div className="juror-slide-number">{scopeSlideNumber}</div>
            <div className="juror-slide-copy">
              <p className="eyebrow">Scope notes</p>
              <h2>What not to overclaim</h2>
              <ul className="juror-proof-list juror-limits-list">
                {demo.limits.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </article>
        ) : null}

        <article className="juror-slide juror-cta-slide">
          <div className="juror-slide-number">{ctaSlideNumber}</div>
          <div className="juror-slide-copy">
            <p className="eyebrow">Call to action</p>
            <div className="juror-cta-layout">
              <div className="juror-cta-copy-block">
                <h2>{demo.cta.headline}</h2>
                <p>{demo.cta.body}</p>
                <div className="juror-cta-actions">
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
                className="juror-qr-link"
                href={publicPresentationUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${demo.shortTitle} presentation at truth-market.xyz`}
              >
                <span className="juror-qr-kicker">Try this path soon</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeSrc} alt={`QR code linking to ${publicPresentationLabel}`} />
                <span className="juror-qr-url">{publicPresentationLabel}</span>
                <span className="juror-qr-note">
                  Scan to open this exact presentation subpage when the site is deployed.
                </span>
              </a>
            </div>
          </div>
        </article>
      </section>
    </main>
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
