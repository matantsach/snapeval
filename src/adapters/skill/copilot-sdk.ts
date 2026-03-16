import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { SkillAdapter, SkillOutput } from '../../types.js';
import { getClient, stopClient } from '../copilot-sdk-client.js';

export class CopilotSDKAdapter implements SkillAdapter {
  readonly name = 'copilot-sdk';

  async invoke(skillPath: string, prompt: string, _files?: string[]): Promise<SkillOutput> {
    const startMs = Date.now();

    // Read SKILL.md for system message context
    let skillMd = '';
    try {
      const skillFile = path.join(skillPath, 'SKILL.md');
      skillMd = await readFile(skillFile, { encoding: 'utf-8' });
    } catch {
      // ignore missing SKILL.md
    }

    const client = await getClient();

    // Track token usage from events
    let inputTokens = 0;
    let outputTokens = 0;
    let model = 'copilot-sdk';

    const session = await client.createSession({
      model: 'gpt-4.1',
      ...(skillMd
        ? { systemMessage: { content: skillMd } }
        : {}),
      onPermissionRequest: async () => ({ kind: 'approved' }),
    });

    const unsubscribe = session.on((event: any) => {
      if (event.type === 'assistant.usage') {
        if (event.data.inputTokens != null) inputTokens += event.data.inputTokens;
        if (event.data.outputTokens != null) outputTokens += event.data.outputTokens;
        if (event.data.model) model = event.data.model;
      }
    });

    try {
      const response = await session.sendAndWait({ prompt });
      const raw = response?.data?.content ?? '';
      const durationMs = Date.now() - startMs;

      return {
        raw: raw.trim(),
        metadata: {
          tokens: inputTokens + outputTokens,
          durationMs,
          model,
          adapter: this.name,
        },
      };
    } finally {
      unsubscribe();
      await session.disconnect();
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await getClient();
      return true;
    } catch {
      return false;
    }
  }
}
