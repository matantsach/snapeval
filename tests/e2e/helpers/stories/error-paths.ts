import type { E2ETestAdapter, E2ERunResult } from '../types.js';

export async function noEvalsJson(
  adapter: E2ETestAdapter,
  skillDir: string
): Promise<{ result: E2ERunResult }> {
  const result = await adapter.run({ command: 'eval', skillDir });
  return { result };
}
