import Link from "next/link";
import { getChain, getChainId } from "../../lib/server/viem";
import { WalletPill } from "./WalletPill";
import { NavLink } from "./NavLink";

export function SiteHeader() {
  const chain = getChain();
  const chainId = getChainId();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-mark.svg" alt="" className="site-brand-mark" width={28} height={28} />
          <span className="site-brand-name">TruthMarket</span>
        </Link>
        <nav className="site-nav">
          <NavLink href="/">Markets</NavLink>
          <NavLink href="/my-markets">Yours</NavLink>
          <NavLink href="/deploy">Launch</NavLink>
          <span className="site-nav-divider" aria-hidden="true" />
          <NavLink href="/jurors">
            <span className="site-nav-judges">For hackathon judges</span>
          </NavLink>
        </nav>
        <div className="site-header-meta">
          <span className="site-chain-pill" title={`Target chain id ${chainId}`}>
            <span className="site-chain-dot" />
            {chain.name}
          </span>
          <WalletPill />
        </div>
      </div>
    </header>
  );
}
