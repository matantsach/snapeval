export class SnapevalError extends Error {
  constructor(message: string, public exitCode: number = 2) {
    super(message);
    this.name = 'SnapevalError';
  }
}

export class AdapterNotAvailableError extends SnapevalError {
  constructor(adapterName: string, installHint: string) {
    super(`${adapterName} is not available. ${installHint}`);
    this.name = 'AdapterNotAvailableError';
  }
}

export class RateLimitError extends SnapevalError {
  constructor(adapterName: string) {
    super(`${adapterName} rate limit exceeded. Try again later or use a different adapter.`);
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends SnapevalError {
  constructor(evalId: number, timeoutMs: number) {
    super(`Eval ${evalId} timed out after ${timeoutMs}ms.`);
    this.name = 'TimeoutError';
  }
}

export class GradingError extends SnapevalError {
  constructor(evalId: number, detail: string) {
    super(`Grading failed for eval ${evalId}: ${detail}`);
    this.name = 'GradingError';
  }
}
