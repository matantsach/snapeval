import * as path from 'node:path';
import type { E2ETestAdapter, E2ERunResult, E2ERunOptions } from '../types.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

const COMMAND_PROMPTS: Record<string, (skillDir: string) => string> = {
  init: (dir) => `Generate eval test cases for the skill at ${dir}. Run without asking for confirmation.`,
  eval: (dir) => `Run evals for the skill at ${dir}. Run all evals without asking for confirmation.`,
  review: (dir) => `Run evals for the skill at ${dir} and generate a review with feedback template.`,
};

export class SDKAdapter implements E2ETestAdapter {
  readonly name = 'sdk';
  private client: any = null;

  async isAvailable(): Promise<boolean> {
    try {
      const { isSDKInstalled } = await import(
        path.join(PROJECT_ROOT, 'src', 'adapters', 'copilot-sdk-client.ts')
      );
      return isSDKInstalled();
    } catch {
      return false;
    }
  }

  async setup(): Promise<void> {
    const { getClient } = await import(
      path.join(PROJECT_ROOT, 'src', 'adapters', 'copilot-sdk-client.ts')
    );
    this.client = await getClient();
  }

  async teardown(): Promise<void> {
    const { stopClient } = await import(
      path.join(PROJECT_ROOT, 'src', 'adapters', 'copilot-sdk-client.ts')
    );
    await stopClient();
    this.client = null;
  }

  async run(options: E2ERunOptions): Promise<E2ERunResult> {
    const promptFn = COMMAND_PROMPTS[options.command];
    if (!promptFn) {
      return { stdout: '', stderr: `Unknown command: ${options.command}`, exitCode: 1 };
    }

    const prompt = promptFn(options.skillDir);

    try {
      const session = await this.client.createSession({
        model: 'gpt-4.1',
        onPermissionRequest: async () => ({ kind: 'approved' }),
      });

      try {
        const response = await session.sendAndWait({ prompt });
        const content = response?.data?.content ?? '';
        return { stdout: content, stderr: '', exitCode: null };
      } finally {
        await session.disconnect();
      }
    } catch (error: any) {
      return { stdout: '', stderr: error.message ?? String(error), exitCode: 1 };
    }
  }
}
