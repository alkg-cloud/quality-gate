export type Coverage =
  | { lines_pct: number; files: Record<string, number> }
  | { _skipped: string };

export type Duplication =
  | { pct: number; clones?: number }
  | { _skipped: string };

export type Lint =
  | { total: number; by_file: Record<string, number> }
  | { _skipped: string };

export type FileSize =
  | { max_lines: number; violations: Record<string, number> }
  | { _skipped: string };

export type Security =
  | { critical: number; high: number; moderate: number; low: number }
  | { _skipped: string };

export interface Meta {
  adapter: string;
  adapter_version: string;
  tools: string[];
  duration_ms?: number;
}

export interface Metrics {
  coverage: Coverage;
  duplication: Duplication;
  lint: Lint;
  file_size: FileSize;
  security: Security;
  _meta: Meta;
}

export interface ConfigSnapshot {
  MAX_FILE_LINES: number;
  MIN_NEW_FILE_COVERAGE: number;
  ratchet_strict: boolean;
}

export interface Baseline {
  schema_version: 1;
  updated_at: string;
  commit_sha: string;
  ref: string;
  metrics: {
    coverage: Coverage;
    duplication: Duplication;
    lint: Lint;
    file_size: FileSize;
    security: Security;
  };
  config_snapshot: ConfigSnapshot;
}

export type Severity = "critical" | "high" | "moderate" | "low";

export interface SecurityConfig {
  enabled: boolean;
  block_severities: Severity[];
  warn_severities: Severity[];
}

export interface QGConfig {
  schema_version: 1;
  default_branch: string;
  thresholds: {
    MAX_FILE_LINES: number;
    MIN_NEW_FILE_COVERAGE: number;
  };
  ratchet: {
    strict: boolean;
    epsilon: number;
  };
  metrics: {
    coverage: { enabled: boolean };
    duplication: { enabled: boolean };
    lint: { enabled: boolean };
    file_size: { enabled: boolean };
    security: SecurityConfig;
  };
  adapter: {
    command: string;
    name: string;
    version: string;
  };
}

export interface Regression {
  metric: string;
  scope: "global" | "file" | "new_file" | "new_file_floor" | "critical_blocker" | "high_blocker" | "moderate_blocker" | "low_blocker";
  file?: string;
  baseline?: number;
  actual?: number;
  required?: number;
  delta?: number;
  rules?: string[];
}

export interface Warning {
  metric: string;
  severity: Severity;
  count: number;
  delta?: number;
}

export interface ComparatorReport {
  gate_passed: boolean;
  regressions: Regression[];
  warnings: Warning[];
  passing: string[];
  bootstrap: boolean;
}
