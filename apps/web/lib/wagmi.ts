import { createConfig, http } from "wagmi";
import { baseSepolia, foundry, sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = createConfig({
  ssr: true,
  chains: [foundry, baseSepolia, sepolia],
  connectors: [
    injected(),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            metadata: {
              name: "TruthMarket",
              description: "Random-jury belief-resolution markets",
              url: "https://truthmarket.local",
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [foundry.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545"),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  },
});
