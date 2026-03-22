import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { SDKAdapter } from './helpers/adapters/sdk-adapter.js';
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
  listEvalDirs,
} from './helpers/assertions.js';
import { evalWithAssertions } from './helpers/stories/eval-with-assertions.js';
import { evalWithoutAssertions } from './helpers/stories/eval-without-assertions.js';
import { evalOldSkill } from './helpers/stories/eval-old-skill.js';
import { multiIteration } from './helpers/stories/multi-iteration.js';
import { noEvalsJson } from './helpers/stories/error-paths.js';

const adapter = new SDKAdapter();
const sdkAvailable = await adapter.isAvailable();

describe.skipIf(!sdkAvailable)('SDK E2E', () => {
  beforeAll(() => adapter.setup());
  afterAll(() => adapter.teardown());
  afterEach(() => cleanupAll());

  it('US2: eval with assertions produces all spec artifacts', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    writeMinimalEvals(skillDir, { withAssertions: true });
    const workspace = getWorkspaceDir(skillDir);
    const { evalResult } = await evalWithAssertions(adapter, skillDir, workspace);

    expect(evalResult.exitCode).toBe(0);

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
    const { evalResult } = await evalWithoutAssertions(adapter, skillDir, workspace);
    expect(evalResult.exitCode).toBe(0);

    const evalDirs = listEvalDirs(`${workspace}/iteration-1`);

    for (const evalDir of evalDirs) {
      assertTiming(`${evalDir}/with_skill`);
      assertTiming(`${evalDir}/without_skill`);
      assertOutput(`${evalDir}/with_skill`);
      assertOutput(`${evalDir}/without_skill`);
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
    const { evalResult } = await evalOldSkill(adapter, skillDir, oldSkillDir, workspace);
    expect(evalResult.exitCode).toBe(0);

    const evalDirs = listEvalDirs(`${workspace}/iteration-1`);

    for (const evalDir of evalDirs) {
      assertOldSkillDir(evalDir);
      assertTiming(`${evalDir}/with_skill`);
      assertTiming(`${evalDir}/old_skill`);
      assertOutput(`${evalDir}/with_skill`);
      assertOutput(`${evalDir}/old_skill`);
    }
  });

  it('US6: multiple iterations increment correctly', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    writeMinimalEvals(skillDir);

    const workspace = getWorkspaceDir(skillDir);
    const { results } = await multiIteration(adapter, skillDir, workspace, 3);
    for (const r of results) {
      expect(r.exitCode).toBe(0);
    }

    assertIterationDir(workspace, 1);
    assertIterationDir(workspace, 2);
    assertIterationDir(workspace, 3);
    assertBenchmark(`${workspace}/iteration-1`);
    assertBenchmark(`${workspace}/iteration-2`);
    assertBenchmark(`${workspace}/iteration-3`);
  });

  it('US-ERR2: no evals.json produces error', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    const { result } = await noEvalsJson(adapter, skillDir);

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toMatch(/evals\.json/i);
  });
});
