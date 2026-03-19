import type { E2ETestAdapter, E2ERunResult } from '../types.js';

export async function generateEvals(
  adapter: E2ETestAdapter,
  skillDir: string
): Promise<{ initResult: E2ERunResult }> {
  const initResult = await adapter.run({ command: 'init', skillDir });
  return { initResult };
}
