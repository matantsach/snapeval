import type { E2ETestAdapter, E2ERunResult } from '../types.js';
import { addAssertionsToEvals } from '../fixtures.js';

export async function evalWithAssertions(
  adapter: E2ETestAdapter,
  skillDir: string,
  assertions: string[],
  workspace?: string
): Promise<{ initResult: E2ERunResult; evalResult: E2ERunResult }> {
  const initResult = await adapter.run({ command: 'init', skillDir });
  addAssertionsToEvals(skillDir, assertions);
  const flags = workspace ? { workspace } : undefined;
  const evalResult = await adapter.run({ command: 'eval', skillDir, flags });
  return { initResult, evalResult };
}
