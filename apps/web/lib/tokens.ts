import { isAddress, type Address } from "viem";

export interface TokenPreset {
  address: Address;
  symbol: string;
  decimals: number;
  /** Short, human label shown on the chip. */
  label: string;
  /** Brief one-line context shown when the chip is selected. */
  description?: string;
}

/**
 * Curated stake-token presets per chain. Verified on-chain at this commit; if
 * one of these gets deprecated, just remove the entry. Custom addresses can
 * still be entered via the "custom" chip in the deploy form.
 */
const PRESETS: Record<number, TokenPreset[]> = {
  // Sepolia (11155111)
  11155111: [
    {
      address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      symbol: "WETH",
      decimals: 18,
      label: "Sepolia WETH",
      description: "Canonical wrapped ETH used by Uniswap on Sepolia. Wrap ETH first, then stake.",
    },
    {
      address: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
      symbol: "LINK",
      decimals: 18,
      label: "Sepolia LINK",
      description: "Chainlink test token — abundant on Sepolia faucets.",
    },
  ],
  // Base Sepolia (84532)
  84532: [
    {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
      label: "Base Sepolia WETH",
      description: "L2 standard wrapped ETH at the predeploy address.",
    },
  ],
  // Foundry / anvil (31337) — leave empty; user supplies a deployed mock.
  31337: [],
};

export function tokenPresets(chainId: number): TokenPreset[] {
  return PRESETS[chainId] ?? [];
}

/** Append the env-configured stake token as the first preset if it's a real
 *  address and not already in the curated list. */
export function presetsWithEnv(chainId: number, envAddr: string | undefined): TokenPreset[] {
  const base = tokenPresets(chainId);
  if (!envAddr || !isAddress(envAddr)) return base;
  const lower = envAddr.toLowerCase();
  if (base.some((p) => p.address.toLowerCase() === lower)) return base;
  return [
    {
      address: envAddr as Address,
      symbol: "TOKEN",
      decimals: 18,
      label: "Configured (env)",
      description: "Default from NEXT_PUBLIC_STAKE_TOKEN.",
    },
    ...base,
  ];
}
