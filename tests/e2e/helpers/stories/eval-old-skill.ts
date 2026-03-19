import type { E2ETestAdapter, E2ERunResult } from '../types.js';

export async function evalOldSkill(
  adapter: E2ETestAdapter,
  skillDir: string,
  oldSkillDir: string,
  workspace?: string
): Promise<{ evalResult: E2ERunResult }> {
  const flags: Record<string, string> = { 'old-skill': oldSkillDir };
  if (workspace) flags.workspace = workspace;
  const evalResult = await adapter.run({ command: 'eval', skillDir, flags });
  return { evalResult };
}
