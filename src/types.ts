// === Adapter Interfaces ===
export interface SkillOutput {
  raw: string;
  metadata: {
    tokens: number;
    durationMs: number;
    model: string;
    adapter: string;
  };
}

export interface SkillAdapter {
  name: string;
  invoke(skillPath: string, prompt: string, files?: string[]): Promise<SkillOutput>;
  isAvailable(): Promise<boolean>;
}

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
  embed(text: string): Promise<number[]>;
  estimateCost(tokens: number): number;
}

export interface EvalResults {
  skillName: string;
  scenarios: ScenarioResult[];
  summary: BenchmarkSummary;
  timing: TimingData;
}

export interface ReportAdapter {
  name: string;
  report(results: EvalResults): Promise<void>;
}

// === Eval Format (agentskills.io) ===
export interface EvalCase {
  id: number;
  prompt: string;
  expected_output: string;
  files?: string[];
  assertions?: string[];
}

export interface EvalsFile {
  skill_name: string;
  generated_by: string;
  evals: EvalCase[];
}

// === Snapshot Format ===
export interface Snapshot {
  scenario_id: number;
  prompt: string;
  output: SkillOutput;
  captured_at: string;
  runs: number;
  approved_by: string | null;
}

export interface VarianceEnvelopeRun {
  raw: string;
  embedding: number[];
}

export interface VarianceEnvelope {
  scenario_id: number;
  runs: VarianceEnvelopeRun[];
  centroid: number[];
  radius: number;
}

// === Comparison Results ===
export type ComparisonVerdict = 'pass' | 'regressed' | 'inconclusive' | 'error';

export interface ComparisonResult {
  scenarioId: number;
  verdict: ComparisonVerdict;
  tier: 1 | 2 | 3;
  similarity?: number;
  details: string;
}

// === Grading ===
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

export interface GradingFile {
  assertion_results: AssertionResult[];
  summary: GradingSummary;
}

// === Timing & Benchmark ===
export interface TimingData {
  total_tokens: number;
  duration_ms: number;
}

export interface BenchmarkSummary {
  total_scenarios: number;
  passed: number;
  regressed: number;
  pass_rate: number;
  total_tokens: number;
  total_cost_usd: number;
  total_duration_ms: number;
  tier_breakdown: {
    tier1_schema: number;
    tier2_embedding: number;
    tier3_llm_judge: number;
  };
}

// === Scenario Result ===
export interface ScenarioResult {
  scenarioId: number;
  prompt: string;
  comparison: ComparisonResult;
  grading?: GradingFile;
  timing: TimingData;
  newOutput: SkillOutput;
}

// === Config ===
export interface SnapevalConfig {
  adapter: string;
  inference: string;
  threshold: number;
  runs: number;
  budget: string;
}
