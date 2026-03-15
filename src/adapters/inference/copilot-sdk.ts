import type { InferenceAdapter, Message, ChatOptions } from '../../types.js';
import { AdapterNotAvailableError } from '../../errors.js';
import { getClient } from '../copilot-sdk-client.js';

export class CopilotSDKInference implements InferenceAdapter {
  readonly name = 'copilot-sdk';

  constructor(private readonly fallback?: InferenceAdapter) {}

  async chat(messages: Message[], _options?: ChatOptions): Promise<string> {
    const client = await getClient();

    // Extract system message if present
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const systemContent = systemMessages.map((m) => m.content).join('\n');
    const userPrompt = nonSystemMessages.map((m) => m.content).join('\n');

    const session = await client.createSession({
      model: 'gpt-4.1',
      ...(systemContent
        ? { systemMessage: { content: systemContent } }
        : {}),
      onPermissionRequest: async () => ({ kind: 'approved' }),
    });

    try {
      const response = await session.sendAndWait({ prompt: userPrompt });
      return (response?.data?.content ?? '').trim();
    } finally {
      await session.disconnect();
    }
  }

  async embed(text: string): Promise<number[]> {
    if (this.fallback) {
      return this.fallback.embed(text);
    }
    throw new AdapterNotAvailableError(
      'copilot-sdk-embed',
      'Copilot SDK does not support embeddings. Provide a fallback InferenceAdapter (e.g. GitHubModelsInference).'
    );
  }

  estimateCost(_tokens: number): number {
    return 0;
  }
}
