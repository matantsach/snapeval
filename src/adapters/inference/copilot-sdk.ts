import type { InferenceAdapter, Message, ChatOptions } from '../../types.js';
import { getClient } from '../copilot-sdk-client.js';

export class CopilotSDKInference implements InferenceAdapter {
  readonly name = 'copilot-sdk';

  async chat(messages: Message[], _options?: ChatOptions): Promise<string> {
    const client = await getClient();

    // @ts-ignore — module may not be installed (optional dep)
    const { approveAll } = await import('@github/copilot-sdk');

    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const systemContent = systemMessages.map((m) => m.content).join('\n');
    const userPrompt = nonSystemMessages.map((m) => m.content).join('\n');

    const session = await client.createSession({
      model: 'gpt-4.1',
      ...(systemContent
        ? { systemMessage: { content: systemContent } }
        : {}),
      onPermissionRequest: approveAll,
      infiniteSessions: { enabled: false },
    });

    try {
      const response = await session.sendAndWait({ prompt: userPrompt });
      return (response?.data?.content ?? '').trim();
    } finally {
      await session.disconnect();
    }
  }
}
