import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the SDK client
const mockGetClient = vi.fn();
const mockIsSDKInstalled = vi.fn();
vi.mock('../../../src/adapters/copilot-sdk-client.js', () => ({
  getClient: (...args: any[]) => mockGetClient(...args),
  isSDKInstalled: (...args: any[]) => mockIsSDKInstalled(...args),
}));

// Mock the SDK module
const mockApproveAll = vi.fn();
vi.mock('@github/copilot-sdk', () => ({
  approveAll: mockApproveAll,
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

import { copyFileSync } from 'node:fs';
import { CopilotSDKHarness } from '../../../src/adapters/harness/copilot-sdk.js';

function createMockSession(response: any = { data: { content: 'test output' } }, events: any[] = []) {
  return {
    sendAndWait: vi.fn().mockResolvedValue(response),
    getMessages: vi.fn().mockResolvedValue(events),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CopilotSDKHarness', () => {
  const harness = new CopilotSDKHarness();

  beforeEach(() => { vi.clearAllMocks(); });

  it('has name copilot-sdk', () => {
    expect(harness.name).toBe('copilot-sdk');
  });

  it('run with skillPath sets skillDirectories', async () => {
    const session = createMockSession();
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    await harness.run({
      skillPath: '/path/to/skill',
      prompt: 'test prompt',
      outputDir: '/tmp/out',
    });

    const sessionConfig = mockClient.createSession.mock.calls[0][0];
    expect(sessionConfig.skillDirectories).toEqual(['/path/to']);
    expect(sessionConfig.workingDirectory).toBe('/tmp/out');
    expect(sessionConfig.infiniteSessions).toEqual({ enabled: false });
  });

  it('run without skillPath omits skillDirectories', async () => {
    const session = createMockSession();
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    await harness.run({
      prompt: 'test prompt',
      outputDir: '/tmp/out',
    });

    const sessionConfig = mockClient.createSession.mock.calls[0][0];
    expect(sessionConfig.skillDirectories).toBeUndefined();
  });

  it('returns raw content from response', async () => {
    const session = createMockSession({ data: { content: '  trimmed output  ' } });
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    const result = await harness.run({
      prompt: 'test',
      outputDir: '/tmp/out',
    });

    expect(result.raw).toBe('trimmed output');
  });

  it('handles undefined response gracefully', async () => {
    const session = createMockSession();
    session.sendAndWait.mockResolvedValue(null);
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    const result = await harness.run({
      prompt: 'test',
      outputDir: '/tmp/out',
    });

    expect(result.raw).toBe('');
  });

  it('builds transcript from events', async () => {
    const events = [
      { type: 'user.message', data: { content: 'hello' } },
      { type: 'tool.execution_start', data: { toolName: 'read_file', arguments: { path: 'foo.ts' } } },
      { type: 'tool.execution_complete', data: { toolName: 'read_file', result: { content: 'file content' } } },
      { type: 'skill.invoked', data: { name: 'my-skill', path: '/skill/SKILL.md' } },
      { type: 'assistant.message', data: { content: 'done' } },
    ];
    const session = createMockSession({ data: { content: 'done' } }, events);
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    const result = await harness.run({
      prompt: 'test',
      outputDir: '/tmp/out',
    });

    expect(result.transcript).toContain('[user] hello');
    expect(result.transcript).toContain('[tool:start] read_file');
    expect(result.transcript).toContain('[tool:done] read_file');
    expect(result.transcript).toContain('[skill] my-skill');
    expect(result.transcript).toContain('[assistant] done');
  });

  it('copies input files and attaches them', async () => {
    const session = createMockSession();
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    await harness.run({
      prompt: 'test',
      files: ['/input/spec.json'],
      outputDir: '/tmp/out',
    });

    expect(vi.mocked(copyFileSync)).toHaveBeenCalledWith('/input/spec.json', '/tmp/out/spec.json');

    const sendArgs = session.sendAndWait.mock.calls[0][0];
    expect(sendArgs.attachments).toEqual([
      { type: 'file', path: '/tmp/out/spec.json', displayName: 'spec.json' },
    ]);
  });

  it('sends prompt with 300s timeout', async () => {
    const session = createMockSession();
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    await harness.run({ prompt: 'test', outputDir: '/tmp/out' });

    expect(session.sendAndWait).toHaveBeenCalledWith(
      { prompt: 'test' },
      300_000,
    );
  });

  it('disconnects session even on error', async () => {
    const session = createMockSession();
    session.sendAndWait.mockRejectedValue(new Error('timeout'));
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    await expect(
      harness.run({ prompt: 'test', outputDir: '/tmp/out' })
    ).rejects.toThrow('timeout');

    expect(session.disconnect).toHaveBeenCalled();
  });

  it('returns zero total_tokens (SDK usage events are ephemeral)', async () => {
    const events = [
      { type: 'assistant.usage', data: { inputTokens: 1000, outputTokens: 200 } },
      { type: 'assistant.usage', data: { inputTokens: 500, outputTokens: 100 } },
    ];
    const session = createMockSession({ data: { content: 'done' } }, events);
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    const result = await harness.run({ prompt: 'test', outputDir: '/tmp/out' });

    expect(result.total_tokens).toBe(0);
  });

  it('measures duration_ms', async () => {
    const session = createMockSession();
    const mockClient = { createSession: vi.fn().mockResolvedValue(session) };
    mockGetClient.mockResolvedValue(mockClient);

    const result = await harness.run({ prompt: 'test', outputDir: '/tmp/out' });

    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('isAvailable delegates to isSDKInstalled', async () => {
    mockIsSDKInstalled.mockReturnValue(true);
    expect(await harness.isAvailable()).toBe(true);

    mockIsSDKInstalled.mockReturnValue(false);
    expect(await harness.isAvailable()).toBe(false);
  });
});
