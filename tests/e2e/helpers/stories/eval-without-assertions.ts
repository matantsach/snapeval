import type { E2ETestAdapter, E2ERunResult } from '../types.js';

export async function evalWithoutAssertions(
  adapter: E2ETestAdapter,
  skillDir: string,
  workspace?: string
): Promise<{ evalResult: E2ERunResult }> {
  const flags = workspace ? { workspace } : undefined;
  const evalResult = await adapter.run({ command: 'eval', skillDir, flags });
  return { evalResult };
}
