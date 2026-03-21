import type { E2ETestAdapter, E2ERunResult } from '../types.js';

/**
 * US5: Run review on a skill that already has evals.json with assertions.
 * Caller must set up skillDir with evals.json (use writeMinimalEvals).
 */
export async function reviewFlow(
  adapter: E2ETestAdapter,
  skillDir: string,
  workspace?: string
): Promise<{ reviewResult: E2ERunResult }> {
  const flags = workspace ? { workspace } : undefined;
  const reviewResult = await adapter.run({ command: 'review', skillDir, flags });
  return { reviewResult };
}
