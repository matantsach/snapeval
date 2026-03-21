import type { E2ETestAdapter, E2ERunResult } from '../types.js';

/**
 * US2: Run eval on a skill that already has evals.json with assertions.
 * Caller must set up skillDir with evals.json (use writeMinimalEvals).
 */
export async function evalWithAssertions(
  adapter: E2ETestAdapter,
  skillDir: string,
  workspace?: string
): Promise<{ evalResult: E2ERunResult }> {
  const flags = workspace ? { workspace } : undefined;
  const evalResult = await adapter.run({ command: 'eval', skillDir, flags });
  return { evalResult };
}
