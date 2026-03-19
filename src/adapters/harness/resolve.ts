import type { Harness } from '../../types.js';
import { CopilotCLIHarness } from './copilot-cli.js';
import { SnapevalError } from '../../errors.js';

export function resolveHarness(name: string): Harness {
  if (name === 'copilot-cli') {
    return new CopilotCLIHarness();
  }
  throw new SnapevalError(`Unknown harness "${name}". Built-in options: copilot-cli.`);
}
