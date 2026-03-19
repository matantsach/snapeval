// === Harness Interface ===

export interface HarnessRunResult {
  raw: string;
  transcript?: string;
  files: string[];
  total_tokens: number;
  duration_ms: number;
}

export interface Harness {
  name: string;
  run(options: {
    skillPath?: string;
    prompt: string;
    files?: string[];
    outputDir: string;
  }): Promise<HarnessRunResult>;
  isAvailable(): Promise<boolean>;
}

// === Inference Interface ===

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface InferenceAdapter {
  name: string;
  chat(messages: Message[], options?: ChatOptions): Promise<string>;
}

// === Eval Format (agentskills.io) ===

export interface EvalCase {
  id: number;
  prompt: string;
  expected_output: string;
  slug?: string;
  files?: string[];
  assertions?: string[];
}

export interface EvalsFile {
  skill_name: string;
  evals: EvalCase[];
}

// === Artifact Types (match spec exactly) ===

export interface TimingData {
  total_tokens: number;
  duration_ms: number;
}

export interface AssertionResult {
  text: string;
  passed: boolean;
  evidence: string;
}

export interface GradingSummary {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
}

export interface GradingResult {
  assertion_results: AssertionResult[];
  summary: GradingSummary;
}

export interface StatEntry {
  mean: number;
  stddev: number;
}

export interface RunStats {
  pass_rate: StatEntry;
  time_seconds: StatEntry;
  tokens: StatEntry;
}

export interface BenchmarkData {
  run_summary: {
    with_skill: RunStats;
    without_skill: RunStats;
    delta: {
      pass_rate: number;
      time_seconds: number;
      tokens: number;
    };
  };
}

export interface FeedbackData {
  [evalSlug: string]: string;
}

// === Eval Pipeline Results ===

export interface EvalRunResult {
  evalId: number;
  slug: string;
  prompt: string;
  withSkill: {
    output: HarnessRunResult;
    grading?: GradingResult;
  };
  withoutSkill: {
    output: HarnessRunResult;
    grading?: GradingResult;
  };
}

export interface EvalResults {
  skillName: string;
  evalRuns: EvalRunResult[];
  benchmark: BenchmarkData;
  iterationDir: string;
}

// === Report Interface ===

export interface ReportAdapter {
  name: string;
  report(results: EvalResults): Promise<void>;
}

// === Config ===

export interface SnapevalConfig {
  harness: string;
  inference: string;
  workspace: string;
  runs: number;
}
