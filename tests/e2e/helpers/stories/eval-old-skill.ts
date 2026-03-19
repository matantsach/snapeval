import type { E2ETestAdapter, E2ERunResult } from '../types.js';

export async function evalOldSkill(
  adapter: E2ETestAdapter,
  skillDir: string,
  oldSkillDir: string
): Promise<{ evalResult: E2ERunResult }> {
  const evalResult = await adapter.run({
    command: 'eval',
    skillDir,
    flags: { 'old-skill': oldSkillDir },
  });
  return { evalResult };
}
