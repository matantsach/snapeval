import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { gradeAssertions } from '../../src/engine/grader.js';
import type { InferenceAdapter, HarnessRunResult } from '../../src/types.js';

describe('gradeAssertions', () => {
  let tmpDir: string;

  const mockInference: InferenceAdapter = {
    name: 'mock',
    chat: vi.fn(),
  };

  const output: HarnessRunResult = {
    raw: 'Found chart.png in outputs. Chart has X-axis labeled "Month" and Y-axis labeled "Revenue".',
    files: ['chart.png'],
    total_tokens: 500,
    duration_ms: 2000,
  };

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('returns null when no assertions', async () => {
    const result = await gradeAssertions([], output, '/tmp/out', mockInference);
    expect(result).toBeNull();
  });

  it('grades LLM assertions and writes grading.json', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));

    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
      results: [
        { text: 'Chart has labeled axes', passed: true, evidence: 'X-axis: Month, Y-axis: Revenue' },
        { text: 'Chart shows 3 months', passed: false, evidence: 'Cannot determine month count from text output' },
      ],
    }));

    const result = await gradeAssertions(
      ['Chart has labeled axes', 'Chart shows 3 months'],
      output,
      tmpDir,
      mockInference
    );

    expect(result).not.toBeNull();
    expect(result!.summary.passed).toBe(1);
    expect(result!.summary.failed).toBe(1);
    expect(result!.summary.total).toBe(2);
    expect(result!.summary.pass_rate).toBe(0.5);
    expect(result!.assertion_results).toHaveLength(2);

    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'grading.json'), 'utf-8'));
    expect(written.summary.total).toBe(2);
  });

  it('recovers from malformed LLM JSON response', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));

    // Simulate LLM returning JSON with unescaped quotes in evidence
    // This is the exact bug: evidence contains unescaped " that breaks JSON.parse
    vi.mocked(mockInference.chat)
      .mockResolvedValueOnce('{"results": [{"text": "check", "passed": true, "evidence": "Output says "hello" which matches"}]}')
      .mockResolvedValueOnce('{"results": [{"text": "check", "passed": true, "evidence": "Output says "hello" which matches"}]}')
      .mockResolvedValueOnce('{"results": [{"text": "check", "passed": true, "evidence": "Output says "hello" which matches"}]}');

    const result = await gradeAssertions(
      ['check'],
      output,
      tmpDir,
      mockInference
    );

    // Should not throw — should gracefully degrade
    expect(result).not.toBeNull();
    expect(result!.assertion_results).toHaveLength(1);
    expect(result!.assertion_results[0].passed).toBe(false);
    expect(result!.assertion_results[0].evidence).toContain('malformed JSON');

    // Debug files should exist for diagnosis
    expect(fs.existsSync(path.join(tmpDir, 'grader-debug-attempt-0.txt'))).toBe(true);
  });

  it('retries on malformed JSON and succeeds on retry', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));

    vi.mocked(mockInference.chat)
      // First attempt: malformed
      .mockResolvedValueOnce('{"results": [{"text": "check", "passed": true, "evidence": "bad "quote" here"}]}')
      // Second attempt: valid
      .mockResolvedValueOnce(JSON.stringify({
        results: [{ text: 'check', passed: true, evidence: 'good response' }],
      }));

    const result = await gradeAssertions(
      ['check'],
      output,
      tmpDir,
      mockInference
    );

    expect(result).not.toBeNull();
    expect(result!.assertion_results[0].passed).toBe(true);
    expect(result!.assertion_results[0].evidence).toBe('good response');
    // Should have called chat twice (first failed, second succeeded)
    expect(mockInference.chat).toHaveBeenCalledTimes(2);
  });

  it('handles script: assertions', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));
    const scriptsDir = path.join(tmpDir, 'scripts');
    fs.mkdirSync(scriptsDir);
    const scriptPath = path.join(scriptsDir, 'check-json.sh');
    fs.writeFileSync(scriptPath, '#!/bin/bash\necho "File is valid JSON"\nexit 0', { mode: 0o755 });

    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
      results: [
        { text: 'Output mentions chart', passed: true, evidence: 'Found "chart.png" in output' },
      ],
    }));

    const result = await gradeAssertions(
      ['Output mentions chart', 'script:check-json.sh'],
      output,
      tmpDir,
      mockInference,
      scriptsDir
    );

    expect(result).not.toBeNull();
    expect(result!.assertion_results).toHaveLength(2);
    const scriptResult = result!.assertion_results.find(a => a.text === 'script:check-json.sh');
    expect(scriptResult?.passed).toBe(true);
  });
});
