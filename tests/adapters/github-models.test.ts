import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubModelsInference } from '../../src/adapters/inference/github-models.js';
import { RateLimitError } from '../../src/errors.js';

function makeFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? 'Too Many Requests' : status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('GitHubModelsInference', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('chat()', () => {
    it('POSTs to /chat/completions and returns choices[0].message.content', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeFetchResponse(200, {
          choices: [{ message: { content: 'Hello, world!' } }],
        })
      );
      globalThis.fetch = mockFetch;

      const adapter = new GitHubModelsInference('test-token');
      const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('Hello, world!');
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/chat/completions');
      expect(init.method).toBe('POST');
    });

    it('sends Authorization header with Bearer token', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeFetchResponse(200, { choices: [{ message: { content: 'ok' } }] })
      );
      globalThis.fetch = mockFetch;

      const adapter = new GitHubModelsInference('my-secret-token');
      await adapter.chat([{ role: 'user', content: 'test' }]);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-secret-token');
    });

    it('includes temperature and max_tokens when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeFetchResponse(200, { choices: [{ message: { content: 'ok' } }] })
      );
      globalThis.fetch = mockFetch;

      const adapter = new GitHubModelsInference('token');
      await adapter.chat([{ role: 'user', content: 'test' }], { temperature: 0.5, maxTokens: 100 });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(100);
    });

    it('sets response_format when responseFormat is json', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        makeFetchResponse(200, { choices: [{ message: { content: '{}' } }] })
      );
      globalThis.fetch = mockFetch;

      const adapter = new GitHubModelsInference('token');
      await adapter.chat([{ role: 'user', content: 'test' }], { responseFormat: 'json' });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('throws RateLimitError on 429', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse(429, {}));

      const adapter = new GitHubModelsInference('token');
      await expect(adapter.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(RateLimitError);
    });

    it('throws generic error on non-429 non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse(500, {}));

      const adapter = new GitHubModelsInference('token');
      await expect(adapter.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('500');
    });

    it('uses GITHUB_TOKEN env var when no token provided', async () => {
      process.env.GITHUB_TOKEN = 'env-token';
      const mockFetch = vi.fn().mockResolvedValue(
        makeFetchResponse(200, { choices: [{ message: { content: 'ok' } }] })
      );
      globalThis.fetch = mockFetch;

      const adapter = new GitHubModelsInference();
      await adapter.chat([{ role: 'user', content: 'test' }]);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer env-token');
      delete process.env.GITHUB_TOKEN;
    });
  });

  describe('name', () => {
    it('is "github-models"', () => {
      const adapter = new GitHubModelsInference('token');
      expect(adapter.name).toBe('github-models');
    });
  });
});
