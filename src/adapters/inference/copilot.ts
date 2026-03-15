import { execFileSync } from 'node:child_process';
import type { InferenceAdapter, Message, ChatOptions } from '../../types.js';
import { AdapterNotAvailableError } from '../../errors.js';

export class CopilotInference implements InferenceAdapter {
  readonly name = 'copilot';

  constructor(private readonly fallback?: InferenceAdapter) {}

  async chat(messages: Message[], _options?: ChatOptions): Promise<string> {
    const prompt = messages.map((m) => m.content).join('\n');
    const result = execFileSync('copilot', ['-p', prompt, '-s', '--no-ask-user', '--model', 'gpt-4.1'], { encoding: 'utf-8' });
    return result.trim();
  }

  async embed(text: string): Promise<number[]> {
    if (this.fallback) {
      return this.fallback.embed(text);
    }
    throw new AdapterNotAvailableError(
      'copilot-embed',
      'Copilot CLI does not support embeddings. Provide a fallback InferenceAdapter (e.g. GitHubModelsInference).'
    );
  }

  estimateCost(_tokens: number): number {
    return 0;
  }
}
