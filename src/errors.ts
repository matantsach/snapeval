// Exit codes:
// 0 = success
// 1 = threshold not met (eval ran successfully but pass rate below threshold)
// 2 = config/input error (bad JSON, missing fields, invalid flags)
// 3 = file not found (missing skill dir, missing evals.json, missing script)
// 4 = runtime error (harness failure, grading failure, timeout)

export class SnapevalError extends Error {
  constructor(message: string, public exitCode: number = 2) {
    super(message);
    this.name = 'SnapevalError';
  }
}

export class FileNotFoundError extends SnapevalError {
  constructor(filePath: string, hint?: string) {
    super(`File not found: ${filePath}${hint ? `. ${hint}` : ''}`, 3);
    this.name = 'FileNotFoundError';
  }
}

export class ThresholdError extends SnapevalError {
  constructor(actual: number, threshold: number) {
    super(`Skill pass rate ${(actual * 100).toFixed(1)}% is below threshold ${(threshold * 100).toFixed(1)}%`, 1);
    this.name = 'ThresholdError';
  }
}

export class AdapterNotAvailableError extends SnapevalError {
  constructor(adapterName: string, installHint: string) {
    super(`${adapterName} is not available. ${installHint}`, 4);
    this.name = 'AdapterNotAvailableError';
  }
}

export class RateLimitError extends SnapevalError {
  constructor(adapterName: string) {
    super(`${adapterName} rate limit exceeded. Try again later or use a different adapter.`, 4);
    this.name = 'RateLimitError';
  }
}
