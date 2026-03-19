import type { E2ETestAdapter, E2ERunResult } from '../types.js';
import { addAssertionsToEvals } from '../fixtures.js';

export async function reviewFlow(
  adapter: E2ETestAdapter,
  skillDir: string,
  assertions: string[]
): Promise<{ initResult: E2ERunResult; reviewResult: E2ERunResult }> {
  const initResult = await adapter.run({ command: 'init', skillDir });
  addAssertionsToEvals(skillDir, assertions);
  const reviewResult = await adapter.run({ command: 'review', skillDir });
  return { initResult, reviewResult };
}
