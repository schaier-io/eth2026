import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import { DemoTermsGate } from "./components/DemoTermsGate";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TruthMarket - Random-jury belief resolution",
  description:
    "Stake on immutable claim/rules documents. Votes stay hidden until reveal, SpaceComputer randomness selects jurors, and the selected jury resolves the market.",
  openGraph: {
    title: "TruthMarket - Random-jury belief resolution",
    description:
      "Stake on immutable claim/rules documents. Votes stay hidden until reveal, then selected jurors resolve the market.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TruthMarket - Random-jury belief resolution",
    description:
      "Stake on immutable claim/rules documents, private commit-reveal, and random selected jurors.",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f6f8fb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <div className="site-bg" aria-hidden="true">
          <div className="site-bg-orb site-bg-orb-1" />
          <div className="site-bg-orb site-bg-orb-2" />
          <div className="site-bg-grid" />
        </div>
        <Providers>
          <SiteHeader />
          <div className="site-main">{children}</div>
          <SiteFooter />
          <DemoTermsGate />
        </Providers>
      </body>
    </html>
  );
}
