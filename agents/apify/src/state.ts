import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AgentError } from "./errors.js";
import type { Address, Hex } from "./types.js";

const MAX_ENTRIES = 200;

const AgentEntrySchema = z.object({
  permalink: z.string(),
  candidateId: z.string(),
  marketAddress: z.string(),
  txHash: z.string(),
  ipfsHash: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

const AgentStateSchema = z.object({
  version: z.literal(1).default(1),
  seen: z.array(AgentEntrySchema).default([]),
});

export type AgentEntry = z.infer<typeof AgentEntrySchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;

export interface AgentStateConfig {
  agentStatePath: string;
}

export async function loadAgentState(cfg: AgentStateConfig): Promise<AgentState> {
  try {
    await stat(cfg.agentStatePath);
  } catch {
    return { version: 1, seen: [] };
  }
  const raw = await readFile(cfg.agentStatePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new AgentError(
      "AGENT_STATE_PARSE",
      `agent state at ${cfg.agentStatePath} is not valid JSON: ${(e as Error).message}`,
    );
  }
  const result = AgentStateSchema.safeParse(parsed);
  if (!result.success) {
    throw new AgentError(
      "AGENT_STATE_INVALID",
      `agent state validation failed: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

export async function saveAgentState(
  cfg: AgentStateConfig,
  state: AgentState,
): Promise<string> {
  await mkdir(path.dirname(cfg.agentStatePath), { recursive: true });
  await writeFile(
    cfg.agentStatePath,
    JSON.stringify(state, null, 2) + "\n",
    { mode: 0o600 },
  );
  return cfg.agentStatePath;
}

/** True if any state entry already references this Reddit permalink or candidate id. */
export function hasSeen(state: AgentState, key: { permalink: string; candidateId: string }): boolean {
  return state.seen.some(
    (e) => e.permalink === key.permalink || e.candidateId === key.candidateId,
  );
}

export function recordSeen(
  state: AgentState,
  entry: {
    permalink: string;
    candidateId: string;
    marketAddress: Address;
    txHash: Hex;
    ipfsHash: Hex;
    name: string;
  },
): AgentState {
  const next: AgentEntry = {
    permalink: entry.permalink,
    candidateId: entry.candidateId,
    marketAddress: entry.marketAddress,
    txHash: entry.txHash,
    ipfsHash: entry.ipfsHash,
    name: entry.name,
    createdAt: new Date().toISOString(),
  };
  const seen = [next, ...state.seen].slice(0, MAX_ENTRIES);
  return { ...state, seen };
}
