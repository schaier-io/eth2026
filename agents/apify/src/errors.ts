export class AgentError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AgentError";
  }
}

export function asAgentError(err: unknown): AgentError {
  if (err instanceof AgentError) return err;
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code)) {
      return new AgentError(code, err.message);
    }
    return new AgentError("AGENT_FAILED", err.message);
  }
  return new AgentError("AGENT_FAILED", String(err));
}
