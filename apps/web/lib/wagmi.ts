import { createConfig, http } from "wagmi";
import { baseSepolia, foundry, sepolia } from "wagmi/chains";
import { coinbaseWallet, injected, metaMask, walletConnect } from "wagmi/connectors";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const APP_NAME = "TruthMarket";
const APP_DESCRIPTION = "Bet on what's true. A random jury rules.";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://truthmarket.local");
const APP_ICON = `${APP_URL.replace(/\/$/, "")}/brand-mark.svg`;

export const wagmiConfig = createConfig({
  ssr: true,
  chains: [sepolia, baseSepolia, foundry],
  // Order = display order in the connect modal. Mobile-first connectors first
  // (MetaMask SDK + Coinbase Wallet handle deep links to their mobile apps).
  connectors: [
    metaMask({
      dappMetadata: {
        name: APP_NAME,
        url: APP_URL,
        iconUrl: APP_ICON,
      },
    }),
    coinbaseWallet({
      appName: APP_NAME,
      appLogoUrl: APP_ICON,
      // "all" lets the SDK pick smart-wallet on mobile and the extension on desktop.
      preference: { options: "all" },
    }),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            showQrModal: true,
            metadata: {
              name: APP_NAME,
              description: APP_DESCRIPTION,
              url: APP_URL,
              icons: [APP_ICON],
            },
          }),
        ]
      : []),
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [foundry.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545"),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  },
});
