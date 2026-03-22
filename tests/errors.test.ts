import { describe, it, expect } from 'vitest';
import {
  SnapevalError,
  FileNotFoundError,
  ThresholdError,
  AdapterNotAvailableError,
  RateLimitError,
} from '../src/errors.js';

describe('error classes', () => {
  it('SnapevalError defaults to exit code 2', () => {
    const err = new SnapevalError('test');
    expect(err.exitCode).toBe(2);
    expect(err.name).toBe('SnapevalError');
    expect(err.message).toBe('test');
  });

  it('FileNotFoundError uses exit code 3', () => {
    const err = new FileNotFoundError('/missing/file', 'check path');
    expect(err.exitCode).toBe(3);
    expect(err.name).toBe('FileNotFoundError');
    expect(err.message).toContain('/missing/file');
    expect(err.message).toContain('check path');
  });

  it('ThresholdError uses exit code 1', () => {
    const err = new ThresholdError(0.5, 0.8);
    expect(err.exitCode).toBe(1);
    expect(err.name).toBe('ThresholdError');
    expect(err.message).toContain('50.0%');
    expect(err.message).toContain('80.0%');
  });

  it('AdapterNotAvailableError uses exit code 4', () => {
    const err = new AdapterNotAvailableError('test-adapter', 'Install it');
    expect(err.exitCode).toBe(4);
    expect(err.name).toBe('AdapterNotAvailableError');
    expect(err.message).toContain('test-adapter');
  });

  it('RateLimitError uses exit code 4', () => {
    const err = new RateLimitError('github-models');
    expect(err.exitCode).toBe(4);
    expect(err.name).toBe('RateLimitError');
  });
});
