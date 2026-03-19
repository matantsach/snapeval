import type { E2ETestAdapter, E2ERunResult } from '../types.js';

export async function evalWithoutAssertions(
  adapter: E2ETestAdapter,
  skillDir: string
): Promise<{ evalResult: E2ERunResult }> {
  const evalResult = await adapter.run({ command: 'eval', skillDir });
  return { evalResult };
}
