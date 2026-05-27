import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Ajv, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCHEMA_DIR = join(__dirname, "schemas");

const METRIC_SCHEMA_FILES = {
  coverage: "coverage.schema.json",
  duplication: "duplication.schema.json",
  lint: "lint.schema.json",
  file_size: "file_size.schema.json",
  security: "security.schema.json",
  _meta: "_meta.schema.json",
} as const;

export type MetricName = keyof typeof METRIC_SCHEMA_FILES;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function loadSchema(filename: string): object {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, filename), "utf-8")) as object;
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function compile(filename: string) {
  return ajv.compile(loadSchema(filename));
}

const validators = {
  coverage: compile("coverage.schema.json"),
  duplication: compile("duplication.schema.json"),
  lint: compile("lint.schema.json"),
  file_size: compile("file_size.schema.json"),
  security: compile("security.schema.json"),
  _meta: compile("_meta.schema.json"),
  baseline: compile("baseline.schema.json"),
  config: compile("config.schema.json"),
} as const;

function collectMessages(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return [];
  return errors.map((e) => `${e.instancePath || "/"}: ${e.message}`);
}

function runValidator(name: keyof typeof validators, data: unknown): void {
  const validator = validators[name];
  if (!validator(data)) {
    const msgs = collectMessages(validator.errors);
    throw new ValidationError(msgs.join("; "));
  }
}

export function validateAdapterOutput(metric: MetricName, path: string): void {
  if (!(metric in METRIC_SCHEMA_FILES)) {
    throw new Error(`unknown metric: ${String(metric)}`);
  }
  const data = JSON.parse(readFileSync(path, "utf-8"));
  runValidator(metric, data);
}

export function validateBaseline(path: string): void {
  const data = JSON.parse(readFileSync(path, "utf-8"));
  runValidator("baseline", data);
}

export function validateConfig(path: string): void {
  const data = JSON.parse(readFileSync(path, "utf-8"));
  runValidator("config", data);
}
