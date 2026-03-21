import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { PluginAdapter } from './helpers/adapters/plugin-adapter.js';
import {
  copyGreeterSkill,
  writeMinimalEvals,
  createOldSkillVersion,
  cleanupAll,
  getWorkspaceDir,
} from './helpers/fixtures.js';
import {
  assertIterationDir,
  assertDualRunDirs,
  assertOldSkillDir,
  assertTiming,
  assertOutput,
  assertGrading,
  assertNoGrading,
  assertBenchmark,
  assertFeedback,
  listEvalDirs,
} from './helpers/assertions.js';
import { evalWithAssertions } from './helpers/stories/eval-with-assertions.js';
import { evalWithoutAssertions } from './helpers/stories/eval-without-assertions.js';
import { evalOldSkill } from './helpers/stories/eval-old-skill.js';
import { reviewFlow } from './helpers/stories/review-flow.js';
import { multiIteration } from './helpers/stories/multi-iteration.js';
import { noEvalsJson } from './helpers/stories/error-paths.js';

const adapter = new PluginAdapter();
const copilotAvailable = await adapter.isAvailable();

// Plugin tests send NL prompts to Copilot with the snapeval plugin installed.
// They test the actual user experience of talking to Copilot.
describe.skipIf(!copilotAvailable)('Plugin E2E', () => {
  beforeAll(() => adapter.setup());
  afterAll(() => adapter.teardown());
  afterEach(() => cleanupAll());

  it('US2: eval with assertions produces all spec artifacts', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    writeMinimalEvals(skillDir, { withAssertions: true });
    const workspace = getWorkspaceDir(skillDir);
    await evalWithAssertions(adapter, skillDir, workspace);

    assertIterationDir(workspace, 1);

    const evalDirs = listEvalDirs(`${workspace}/iteration-1`);
    expect(evalDirs.length).toBeGreaterThan(0);

    for (const evalDir of evalDirs) {
      assertDualRunDirs(evalDir);
      assertTiming(`${evalDir}/with_skill`);
      assertTiming(`${evalDir}/without_skill`);
      assertOutput(`${evalDir}/with_skill`);
      assertOutput(`${evalDir}/without_skill`);
      assertGrading(`${evalDir}/with_skill`);
      assertGrading(`${evalDir}/without_skill`);
    }

    assertBenchmark(`${workspace}/iteration-1`);
  });

  it('US3: eval without assertions produces timing but no grading', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    writeMinimalEvals(skillDir, { withAssertions: false });

    const workspace = getWorkspaceDir(skillDir);
    await evalWithoutAssertions(adapter, skillDir, workspace);

    const evalDirs = listEvalDirs(`${workspace}/iteration-1`);

    for (const evalDir of evalDirs) {
      assertTiming(`${evalDir}/with_skill`);
      assertTiming(`${evalDir}/without_skill`);
      assertNoGrading(`${evalDir}/with_skill`);
      assertNoGrading(`${evalDir}/without_skill`);
    }

    assertBenchmark(`${workspace}/iteration-1`);
  });

  it('US4: eval with --old-skill uses old_skill directory', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    writeMinimalEvals(skillDir);
    const oldSkillDir = createOldSkillVersion(skillDir);

    const workspace = getWorkspaceDir(skillDir);
    await evalOldSkill(adapter, skillDir, oldSkillDir, workspace);

    const evalDirs = listEvalDirs(`${workspace}/iteration-1`);

    for (const evalDir of evalDirs) {
      assertOldSkillDir(evalDir);
    }
  });

  it('US5: review produces feedback.json', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    writeMinimalEvals(skillDir, { withAssertions: true });
    const workspace = getWorkspaceDir(skillDir);
    await reviewFlow(adapter, skillDir, workspace);

    assertIterationDir(workspace, 1);
    assertBenchmark(`${workspace}/iteration-1`);
    assertFeedback(`${workspace}/iteration-1`);
  });

  it('US6: multiple iterations increment correctly', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    writeMinimalEvals(skillDir);

    const workspace = getWorkspaceDir(skillDir);
    await multiIteration(adapter, skillDir, workspace, 3);

    assertIterationDir(workspace, 1);
    assertIterationDir(workspace, 2);
    assertIterationDir(workspace, 3);
  });

  it('US-ERR2: no evals.json produces error', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    const { result } = await noEvalsJson(adapter, skillDir);

    expect(result.stdout + result.stderr).toMatch(/evals\.json|error/i);
  });
});
