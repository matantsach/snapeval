import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Harness, HarnessRunResult } from '../../types.js';
import { getClient, isSDKInstalled } from '../copilot-sdk-client.js';

export class CopilotSDKHarness implements Harness {
  readonly name = 'copilot-sdk';

  async run(options: {
    skillPath?: string;
    prompt: string;
    files?: string[];
    outputDir: string;
  }): Promise<HarnessRunResult> {
    const startMs = Date.now();
    const client = await getClient();

    fs.mkdirSync(options.outputDir, { recursive: true });

    // Dynamically import SDK for approveAll
    // @ts-ignore — module may not be installed (optional dep)
    const { approveAll } = await import('@github/copilot-sdk');

    // Build session config
    const sessionConfig: Record<string, unknown> = {
      model: 'gpt-4.1',
      onPermissionRequest: approveAll,
      workingDirectory: options.outputDir,
      infiniteSessions: { enabled: false },
    };

    // Native skill loading: point skillDirectories at the skill's parent
    if (options.skillPath) {
      sessionConfig.skillDirectories = [path.dirname(options.skillPath)];
    }

    const session = await client.createSession(sessionConfig);

    try {
      // Attach input files if provided
      const attachments: Array<{ type: string; path: string; displayName?: string }> = [];
      if (options.files) {
        for (const file of options.files) {
          // Copy to outputDir for script assertions, and attach for the model
          const dest = path.join(options.outputDir, path.basename(file));
          fs.copyFileSync(file, dest);
          attachments.push({ type: 'file', path: dest, displayName: path.basename(file) });
        }
      }

      const response = await session.sendAndWait(
        {
          prompt: options.prompt,
          ...(attachments.length > 0 ? { attachments } : {}),
        },
        300_000, // 5 min timeout — calibrated for complex eval prompts
      );

      const raw = response?.data?.content ?? '';

      // Collect full transcript from session events
      const events = await session.getMessages();
      const transcript = buildTranscript(events);

      // SDK assistant.usage events are ephemeral and not available via getMessages()
      const totalTokens = 0;

      const durationMs = Date.now() - startMs;

      return {
        raw: raw.trim(),
        transcript,
        files: [],
        total_tokens: totalTokens,
        duration_ms: durationMs,
      };
    } finally {
      await session.disconnect();
    }
  }

  async isAvailable(): Promise<boolean> {
    return isSDKInstalled();
  }
}

function buildTranscript(events: any[]): string {
  const lines: string[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'user.message':
        lines.push(`[user] ${event.data?.content ?? ''}`);
        break;
      case 'assistant.message':
        lines.push(`[assistant] ${event.data?.content ?? ''}`);
        break;
      case 'tool.execution_start':
        lines.push(`[tool:start] ${event.data?.toolName ?? 'unknown'}(${JSON.stringify(event.data?.arguments ?? {})})`);
        break;
      case 'tool.execution_complete':
        lines.push(`[tool:done] ${event.data?.toolName ?? 'unknown'} → ${truncate(event.data?.result?.content ?? '', 200)}`);
        break;
      case 'skill.invoked':
        lines.push(`[skill] ${event.data?.name ?? 'unknown'} (${event.data?.path ?? ''})`);
        break;
      case 'session.error':
        lines.push(`[error] ${event.data?.message ?? ''}`);
        break;
    }
  }
  return lines.join('\n');
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}
