import type { E2ETestAdapter, E2ERunResult } from '../types.js';

export async function multiIteration(
  adapter: E2ETestAdapter,
  skillDir: string,
  count: number = 3
): Promise<{ results: E2ERunResult[] }> {
  const results: E2ERunResult[] = [];
  for (let i = 0; i < count; i++) {
    const result = await adapter.run({ command: 'eval', skillDir });
    results.push(result);
  }
  return { results };
}
