export class CliError extends Error {
  code: string;
  exitCode: number;
  constructor(code: string, message: string, exitCode = 1) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.name = "CliError";
  }
}

export function asCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code)) {
      return new CliError(code, err.message);
    }
    if (err.message.includes("execution reverted")) {
      return new CliError("CHAIN_REVERT", err.message, 2);
    }
    return new CliError("UNKNOWN", err.message);
  }
  return new CliError("UNKNOWN", String(err));
}
