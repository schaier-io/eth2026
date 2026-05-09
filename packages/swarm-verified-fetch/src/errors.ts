export type SwarmVerifiedFetchErrorCode =
  | "SWARM_ABORTED"
  | "SWARM_GATEWAY_ERROR"
  | "SWARM_INPUT_ERROR"
  | "SWARM_JSON_ERROR"
  | "SWARM_TIMEOUT"
  | "SWARM_UNSUPPORTED_SCOPE"
  | "SWARM_VERIFICATION_FAILED";

export interface SwarmVerifiedFetchErrorOptions {
  code: SwarmVerifiedFetchErrorCode;
  cause?: unknown;
  reference?: string | undefined;
  url?: string | undefined;
}

export class SwarmVerifiedFetchError extends Error {
  readonly code: SwarmVerifiedFetchErrorCode;
  readonly reference?: string;
  readonly url?: string;

  constructor(message: string, options: SwarmVerifiedFetchErrorOptions) {
    super(message, errorOptions(options.cause));
    this.name = "SwarmVerifiedFetchError";
    this.code = options.code;

    if (options.reference !== undefined) {
      this.reference = options.reference;
    }

    if (options.url !== undefined) {
      this.url = options.url;
    }
  }
}

export class SwarmInputError extends SwarmVerifiedFetchError {
  constructor(message: string, options: Omit<SwarmVerifiedFetchErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "SWARM_INPUT_ERROR" });
    this.name = "SwarmInputError";
  }
}

export class SwarmVerificationError extends SwarmVerifiedFetchError {
  constructor(message: string, options: Omit<SwarmVerifiedFetchErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "SWARM_VERIFICATION_FAILED" });
    this.name = "SwarmVerificationError";
  }
}

export class SwarmUnsupportedScopeError extends SwarmVerifiedFetchError {
  readonly scope: string;

  constructor(scope: string, options: Omit<SwarmVerifiedFetchErrorOptions, "code"> = {}) {
    super(`${scope} verification is not implemented in this package yet.`, {
      ...options,
      code: "SWARM_UNSUPPORTED_SCOPE"
    });
    this.name = "SwarmUnsupportedScopeError";
    this.scope = scope;
  }
}

export interface SwarmGatewayErrorOptions extends Omit<SwarmVerifiedFetchErrorOptions, "code"> {
  status: number;
  statusText: string;
  bodyPreview?: string | undefined;
}

export class SwarmGatewayError extends SwarmVerifiedFetchError {
  readonly status: number;
  readonly statusText: string;
  readonly bodyPreview?: string;

  constructor(message: string, options: SwarmGatewayErrorOptions) {
    super(message, { ...options, code: "SWARM_GATEWAY_ERROR" });
    this.name = "SwarmGatewayError";
    this.status = options.status;
    this.statusText = options.statusText;

    if (options.bodyPreview !== undefined) {
      this.bodyPreview = options.bodyPreview;
    }
  }
}

export class SwarmAbortError extends SwarmVerifiedFetchError {
  constructor(message = "Swarm verified fetch was aborted.", options: Omit<SwarmVerifiedFetchErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "SWARM_ABORTED" });
    this.name = "SwarmAbortError";
  }
}

export class SwarmTimeoutError extends SwarmVerifiedFetchError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options: Omit<SwarmVerifiedFetchErrorOptions, "code"> = {}) {
    super(`Swarm verified fetch timed out after ${timeoutMs}ms.`, {
      ...options,
      code: "SWARM_TIMEOUT"
    });
    this.name = "SwarmTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class SwarmJsonError extends SwarmVerifiedFetchError {
  constructor(message: string, options: Omit<SwarmVerifiedFetchErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "SWARM_JSON_ERROR" });
    this.name = "SwarmJsonError";
  }
}

function errorOptions(cause: unknown | undefined): ErrorOptions | undefined {
  return cause === undefined ? undefined : { cause };
}
