import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { SDKAdapter } from './helpers/adapters/sdk-adapter.js';
import {
  copyGreeterSkill,
  writeMinimalEvals,
  createOldSkillVersion,
  createEmptyDir,
  cleanupAll,
} from './helpers/fixtures.js';
import {
  assertEvalsJson,
  assertEvalsRelevance,
  assertEvalsNoAssertions,
  assertIterationDir,
  assertDualRunDirs,
  assertOldSkillDir,
  assertTiming,
  assertOutput,
  assertGrading,
  assertNoGrading,
  assertBenchmark,
  assertFeedback,
  assertCleanState,
  findWorkspaceDir,
  listEvalDirs,
} from './helpers/assertions.js';
import { generateEvals } from './helpers/stories/generate-evals.js';
import { evalWithAssertions } from './helpers/stories/eval-with-assertions.js';
import { evalWithoutAssertions } from './helpers/stories/eval-without-assertions.js';
import { evalOldSkill } from './helpers/stories/eval-old-skill.js';
import { reviewFlow } from './helpers/stories/review-flow.js';
import { multiIteration } from './helpers/stories/multi-iteration.js';
import { noSkillMd, noEvalsJson } from './helpers/stories/error-paths.js';

const adapter = new SDKAdapter();
const sdkAvailable = await adapter.isAvailable();

const GREETER_KEYWORDS = ['greet', 'greeting', 'formal', 'casual', 'pirate', 'greeter', 'hello'];
const DEFAULT_ASSERTIONS = ['Output contains a greeting', 'Output mentions a name'];

describe.skipIf(!sdkAvailable)('SDK E2E', () => {
  beforeAll(() => adapter.setup());
  afterAll(() => adapter.teardown());
  afterEach(() => cleanupAll());

  it('US1: init generates evals.json from SKILL.md', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    await generateEvals(adapter, skillDir);

    assertEvalsJson(skillDir);
    assertEvalsRelevance(skillDir, GREETER_KEYWORDS);
    assertEvalsNoAssertions(skillDir);
  });

  it('US2: eval with assertions produces all spec artifacts', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    await evalWithAssertions(adapter, skillDir, DEFAULT_ASSERTIONS);

    const workspace = findWorkspaceDir(skillDir);
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

    await evalWithoutAssertions(adapter, skillDir);

    const workspace = findWorkspaceDir(skillDir);
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

    await evalOldSkill(adapter, skillDir, oldSkillDir);

    const workspace = findWorkspaceDir(skillDir);
    const evalDirs = listEvalDirs(`${workspace}/iteration-1`);

    for (const evalDir of evalDirs) {
      assertOldSkillDir(evalDir);
    }
  });

  it('US5: review produces feedback.json', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    await reviewFlow(adapter, skillDir, DEFAULT_ASSERTIONS);

    const workspace = findWorkspaceDir(skillDir);
    assertIterationDir(workspace, 1);
    assertBenchmark(`${workspace}/iteration-1`);
    assertFeedback(`${workspace}/iteration-1`);
  });

  it('US6: multiple iterations increment correctly', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    writeMinimalEvals(skillDir);

    await multiIteration(adapter, skillDir, undefined, 3);

    const workspace = findWorkspaceDir(skillDir);
    assertIterationDir(workspace, 1);
    assertIterationDir(workspace, 2);
    assertIterationDir(workspace, 3);
  });

  it('US-ERR1: no SKILL.md produces error', async () => {
    const emptyDir = createEmptyDir();
    const { result } = await noSkillMd(adapter, emptyDir);

    expect(result.stdout + result.stderr).toMatch(/SKILL\.md|not found|error/i);
    assertCleanState(emptyDir);
  });

  it('US-ERR2: no evals.json produces error', async () => {
    const skillDir = copyGreeterSkill({ skillMdOnly: true });
    const { result } = await noEvalsJson(adapter, skillDir);

    expect(result.stdout + result.stderr).toMatch(/evals\.json|init|error/i);
  });
});
