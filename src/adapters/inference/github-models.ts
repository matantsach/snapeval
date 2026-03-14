import type { InferenceAdapter, Message, ChatOptions } from '../../types.js';
import { RateLimitError } from '../../errors.js';

const API_BASE = 'https://models.github.ai/inference';
const CHAT_MODEL = 'openai/gpt-4o-mini';
const EMBEDDING_MODEL = 'openai/text-embedding-3-small';

export class GitHubModelsInference implements InferenceAdapter {
  readonly name = 'github-models';

  constructor(private readonly token: string = process.env.GITHUB_TOKEN ?? '') {}

  async chat(messages: Message[], options?: ChatOptions): Promise<string> {
    const body: Record<string, unknown> = {
      model: CHAT_MODEL,
      messages,
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      throw new RateLimitError(this.name);
    }

    if (!response.ok) {
      throw new Error(`GitHub Models API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${API_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });

    if (response.status === 429) {
      throw new RateLimitError(this.name);
    }

    if (!response.ok) {
      throw new Error(`GitHub Models API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data[0].embedding;
  }

  estimateCost(_tokens: number): number {
    return 0;
  }
}
