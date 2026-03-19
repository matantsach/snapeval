import { execFileSync } from 'node:child_process';
import type { InferenceAdapter, Message, ChatOptions } from '../../types.js';

export class CopilotInference implements InferenceAdapter {
  readonly name = 'copilot';

  async chat(messages: Message[], _options?: ChatOptions): Promise<string> {
    const prompt = messages.map((m) => m.content).join('\n');
    const result = execFileSync('copilot', ['-s', '--no-ask-user', '--model', 'gpt-4.1', '-p', prompt], { encoding: 'utf-8' });
    return result.trim();
  }
}
