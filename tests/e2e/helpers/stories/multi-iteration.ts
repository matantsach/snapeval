import type { E2ETestAdapter, E2ERunResult } from '../types.js';

export async function multiIteration(
  adapter: E2ETestAdapter,
  skillDir: string,
  workspace?: string,
  count: number = 3
): Promise<{ results: E2ERunResult[] }> {
  const results: E2ERunResult[] = [];
  const flags = workspace ? { workspace } : undefined;
  for (let i = 0; i < count; i++) {
    const result = await adapter.run({ command: 'eval', skillDir, flags });
    results.push(result);
  }
  return { results };
}
