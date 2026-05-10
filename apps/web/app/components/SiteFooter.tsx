import Link from "next/link";
import { getChain } from "../../lib/server/viem";

export function SiteFooter() {
  const chain = getChain();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link href="/" className="site-footer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-mark.svg" alt="" width={24} height={24} />
          <span>TruthMarket</span>
        </Link>
        <nav className="site-footer-nav">
          <Link href="/">Markets</Link>
          <Link href="/my-markets">Yours</Link>
          <Link href="/deploy">Launch</Link>
          <Link href="/jurors">For hackathon judges</Link>
        </nav>
        <p className="site-footer-meta">
          <span>Random-jury belief resolution.</span>
          <span>·</span>
          <span>{chain.name}</span>
          <span>·</span>
          <span>© {year}</span>
        </p>
      </div>
    </footer>
  );
}
