export interface E2ERunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface E2ERunOptions {
  command: 'init' | 'eval' | 'review';
  skillDir: string;
  flags?: Record<string, string>;
}

export interface E2ETestAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  setup(): Promise<void>;
  teardown(): Promise<void>;
  run(options: E2ERunOptions): Promise<E2ERunResult>;
}
