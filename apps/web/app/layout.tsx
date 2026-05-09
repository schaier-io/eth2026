import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TruthMarket",
  description: "Random-jury belief-resolution markets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
