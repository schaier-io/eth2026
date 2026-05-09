export class SwarmKvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class SwarmKvConfigError extends SwarmKvError {}
export class SwarmKvPayloadError extends SwarmKvError {}
export class SwarmKvPostageError extends SwarmKvError {}
export class SwarmKvIndexError extends SwarmKvError {}
export class SwarmKvConflictError extends SwarmKvError {}
export class SwarmKvCryptoError extends SwarmKvError {}
export class SwarmKvFeedError extends SwarmKvError {}
export class SwarmKvVerificationError extends SwarmKvError {}
export class SwarmKvAbortError extends SwarmKvError {}
export class SwarmKvTimeoutError extends SwarmKvAbortError {}

interface GatewayErrorResponse {
  readonly status: number;
  readonly statusText: string;
  text(): Promise<string>;
}

export class SwarmKvGatewayError extends SwarmKvError {
  readonly status: number;
  readonly statusText: string;

  constructor(message: string, status: number, statusText: string) {
    super(message);
    this.status = status;
    this.statusText = statusText;
  }

  static async fromResponse(action: string, response: GatewayErrorResponse): Promise<SwarmKvGatewayError> {
    let body = "";

    try {
      body = await response.text();
    } catch {
      body = "";
    }

    return new SwarmKvGatewayError(
      `Bee API failed to ${action}: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      response.status,
      response.statusText
    );
  }
}
