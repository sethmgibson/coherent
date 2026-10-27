import { access } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { makeEvidence } from "../audit/finding-factory.js";
import type { CoherentConfig } from "../config.js";
import type { Evidence } from "../audit/finding-factory.js";
import { isPythonSource } from "../inventory-scan.js";
import { toPosix, walkFiles, type WalkedFile } from "../inventory-walk.js";
import { packageRoot } from "../runtime.js";
import { CONFIDENCES, FINDING_STATUSES, SEVERITIES } from "../domain/finding.js";

const execFileAsync = promisify(execFile);
const MIN_PYTHON = { major: 3, minor: 9 };
const SIDECAR_TIMEOUT_MS = 60_000;
export const PYTHON_RULE_IDS = ["A08", "B04", "C03", "D03"] as const;
export type PythonRuleId = (typeof PYTHON_RULE_IDS)[number];

export interface PythonFile {
  path: string;
  relative: string;
}

export interface PythonSyntaxError {
  file: string;
  line: number;
  column: number;
  message: string;
}

interface SidecarFinding {
  ruleId: PythonRuleId;
  identity: string;
  title: string;
  severity: Evidence["severity"];
  confidence: Evidence["confidence"];
  status: Evidence["status"];
  explanation: string;
  evidence: Evidence["evidence"];
  locations: Evidence["locations"];
  affectedSymbols: string[];
}

interface AnalyzeResponse {
  findings: SidecarFinding[];
  syntaxErrors: PythonSyntaxError[];
  ioErrors: PythonSyntaxError[];
}

interface ImportResponse {
  imports: Array<{ from: string; to: string }>;
  syntaxErrors: PythonSyntaxError[];
  ioErrors: PythonSyntaxError[];
}

export async function listPythonFiles(
  root: string,
  config: CoherentConfig = {},
  include?: string[],
): Promise<WalkedFile[]> {
  const walked = include
    ? include.map((relativePath) => {
        const posix = toPosix(relativePath);
        return {
          relativePath: posix,
          absolutePath: join(root, posix),
          name: posix.slice(posix.lastIndexOf("/") + 1) || posix,
        };
      })
    : await walkFiles(root, new Set(config.ignore ?? []));
  return walked.filter((file) => isPythonSource(file.relativePath));
}

export async function collectPythonFindings(
  root: string,
  config: CoherentConfig = {},
  include?: string[],
  rules?: readonly PythonRuleId[],
): Promise<Evidence[]> {
  if (rules !== undefined && (!Array.isArray(rules) || rules.some(rule => !isOneOf(rule, PYTHON_RULE_IDS)))) {
    throw new Error("Python analysis rules must be an array of supported Python rule IDs.");
  }
  const files = await listPythonFiles(root, config, include);
  if (files.length === 0) return [];
  let interpreter: string;
  try {
    interpreter = await resolvePythonInterpreter(config);
  } catch (error) {
    throw new Error(
      `${errorMessage(error)} In-scope files: ${files.map((file) => file.relativePath).join(", ")}.`,
      { cause: error },
    );
  }
  const response = await runSidecar(root, config, files, "analyze", interpreter, rules);
  rejectDiagnostics(response);
  return response.findings
    .filter(finding => rules === undefined || rules.includes(finding.ruleId))
    .map(toFinding);
}

export async function expandPythonImporters(
  root: string,
  changed: string[],
  config: CoherentConfig = {},
): Promise<string[]> {
  const changedPython = changed.filter((path) => isPythonSource(path)).map((path) => toPosix(path));
  if (changedPython.length === 0) return [];
  const files = await listPythonFiles(root, config);
  if (files.length === 0) return [...changedPython].sort();
  const response = await runSidecar(root, config, files, "imports");
  rejectDiagnostics(response);
  const byTarget = new Map<string, Set<string>>();
  for (const edge of response.imports) {
    const callers = byTarget.get(edge.to) ?? new Set<string>();
    callers.add(edge.from);
    byTarget.set(edge.to, callers);
  }
  const importers = new Set(changedPython.filter((path) => files.some((file) => file.relativePath === path)));
  const pending = [...importers];
  for (let index = 0; index < pending.length; index += 1) {
    for (const caller of byTarget.get(pending[index]!) ?? []) {
      if (importers.has(caller)) continue;
      importers.add(caller);
      pending.push(caller);
    }
  }
  return [...importers].sort();
}

export function pythonAnalyzerPath(): string {
  return join(packageRoot(), "python", "analyze.py");
}

export async function resolvePythonInterpreter(config: CoherentConfig = {}): Promise<string> {
  const configured = config.python ?? process.env.COHERENT_PYTHON;
  const candidates = configured ? [configured] : ["python3", "python"];
  const tried: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    tried.push(candidate);
    if (await interpreterSupported(candidate)) return candidate;
  }
  throw new Error(
    [
      "Incomplete analysis: Python files are in scope but no supported interpreter was found.",
      `Looked for: ${tried.join(", ")}.`,
      `Required: CPython ${MIN_PYTHON.major}.${MIN_PYTHON.minor}+ with the standard library ast module.`,
      configured
        ? "The configured interpreter is missing or too old; install a supported CPython or change coherent.json \"python\" / COHERENT_PYTHON."
        : "Install a supported interpreter or set coherent.json \"python\" / COHERENT_PYTHON to its path.",
    ].join(" "),
  );
}

function runSidecar(
  root: string,
  config: CoherentConfig,
  files: WalkedFile[],
  mode: "analyze",
  interpreter?: string,
  rules?: readonly PythonRuleId[],
): Promise<AnalyzeResponse>;
function runSidecar(
  root: string,
  config: CoherentConfig,
  files: WalkedFile[],
  mode: "imports",
): Promise<ImportResponse>;
async function runSidecar(
  root: string,
  config: CoherentConfig,
  files: WalkedFile[],
  mode: "analyze" | "imports",
  interpreter?: string,
  rules?: readonly PythonRuleId[],
): Promise<AnalyzeResponse | ImportResponse> {
  const analyzer = pythonAnalyzerPath();
  try {
    await access(analyzer);
  } catch (error) {
    throw new Error(
      `Incomplete analysis: packaged Python analyzer is missing at ${analyzer}.`,
      { cause: error },
    );
  }
  const resolvedInterpreter = interpreter ?? await resolvePythonInterpreter(config);
  const payload = JSON.stringify({
    mode,
    ...(mode === "analyze" && rules !== undefined ? { rules } : {}),
    files: files.map((file) => ({ path: file.absolutePath, relative: file.relativePath })),
  });
  try {
    const stdout = await spawnSidecar(resolvedInterpreter, analyzer, root, payload);
    const response: unknown = JSON.parse(stdout);
    if (!isRecord(response)) throw new Error("response must be an object");
    const syntaxErrors = parseArray(response.syntaxErrors, isDiagnostic, "syntaxErrors");
    const ioErrors = parseArray(response.ioErrors, isDiagnostic, "ioErrors");
    if (mode === "imports") {
      return { imports: parseArray(response.imports, isImportEdge, "imports"), syntaxErrors, ioErrors };
    }
    return {
      findings: parseArray(response.findings, isSidecarFinding, "findings"),
      syntaxErrors,
      ioErrors,
    };
  } catch (error) {
    throw new Error(
      `Incomplete analysis: Python sidecar failed (${errorMessage(error)}).`,
      { cause: error },
    );
  }
}

function parseArray<T>(raw: unknown, accepts: (item: unknown) => item is T, field: string): T[] {
  if (!Array.isArray(raw)) throw new Error(`${field} must be an array`);
  return raw.map((item: unknown, index) => {
    if (!accepts(item)) throw new Error(`invalid ${field}[${index}]`);
    return item;
  });
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function isStringArray(raw: unknown): raw is string[] {
  return Array.isArray(raw) && raw.every((item: unknown) => typeof item === "string");
}

function isOneOf<T extends string>(raw: unknown, values: readonly T[]): raw is T {
  return typeof raw === "string" && (values as readonly string[]).includes(raw);
}

function isDiagnostic(raw: unknown): raw is PythonSyntaxError {
  return isRecord(raw) && typeof raw.file === "string" && raw.file.length > 0
    && typeof raw.line === "number" && Number.isInteger(raw.line)
    && typeof raw.column === "number" && Number.isInteger(raw.column)
    && typeof raw.message === "string";
}

function isImportEdge(raw: unknown): raw is ImportResponse["imports"][number] {
  return isRecord(raw) && typeof raw.from === "string" && raw.from.length > 0
    && typeof raw.to === "string" && raw.to.length > 0;
}

function isSidecarFinding(raw: unknown): raw is SidecarFinding {
  if (!isRecord(raw) || !isOneOf(raw.ruleId, PYTHON_RULE_IDS)) return false;
  if (!isOneOf(raw.severity, SEVERITIES) || !isOneOf(raw.confidence, CONFIDENCES)
    || !isOneOf(raw.status, FINDING_STATUSES)) return false;
  if (typeof raw.identity !== "string" || !raw.identity || typeof raw.title !== "string"
    || typeof raw.explanation !== "string" || !isStringArray(raw.affectedSymbols)) return false;
  if (!isRecord(raw.evidence) || typeof raw.evidence.summary !== "string"
    || (raw.evidence.details !== undefined && !isStringArray(raw.evidence.details))) return false;
  return Array.isArray(raw.locations) && raw.locations.every((location: unknown) =>
    isRecord(location) && typeof location.file === "string" && location.file.length > 0
    && (location.line === undefined || (typeof location.line === "number" && Number.isInteger(location.line)))
    && (location.column === undefined || (typeof location.column === "number" && Number.isInteger(location.column)))
    && (location.symbol === undefined || typeof location.symbol === "string"),
  );
}

function spawnSidecar(
  interpreter: string,
  analyzer: string,
  cwd: string,
  payload: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(interpreter, ["-B", "-I", analyzer], {
      cwd,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`sidecar timed out after ${SIDECAR_TIMEOUT_MS}ms`));
    }, SIDECAR_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `sidecar exited ${code ?? signal ?? "unknown"}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
    child.stdin.end(payload, "utf8");
  });
}

async function interpreterSupported(command: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      command,
      ["-B", "-c", "import ast, sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"],
      { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
    );
    const match = stdout.trim().match(/^(\d+)\.(\d+)$/);
    if (!match) return false;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return major > MIN_PYTHON.major || (major === MIN_PYTHON.major && minor >= MIN_PYTHON.minor);
  } catch {
    return false;
  }
}

function toFinding(raw: SidecarFinding): Evidence {
  return makeEvidence({
    ruleId: raw.ruleId,
    identity: raw.identity,
    title: raw.title,
    severity: raw.severity,
    confidence: raw.confidence,
    status: raw.status,
    explanation: raw.explanation,
    evidence: raw.evidence,
    locations: raw.locations,
    affectedSymbols: raw.affectedSymbols,
    changeRisk:
      raw.ruleId === "A08"
        ? "Low if the statement is truly unreachable; do not treat missing static references as deletion evidence."
        : "Needs semantic review before deletion or consolidation. Dynamic reachability, decorators, exports, __all__, framework registration, reflection, and unknown imports are not deletion evidence.",
  });
}

function rejectDiagnostics({ ioErrors, syntaxErrors }: Pick<AnalyzeResponse, "ioErrors" | "syntaxErrors">): void {
  if (ioErrors.length > 0 || syntaxErrors.length > 0) {
    throw new Error(
      [
        ioErrors.length > 0 ? formatIoErrors(ioErrors) : "",
        syntaxErrors.length > 0 ? formatSyntaxErrors(syntaxErrors) : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
}

function formatIoErrors(errors: PythonSyntaxError[]): string {
  const details = errors.map((error) => `${error.file}: ${error.message}`);
  return `Incomplete analysis: failed to load source file ${details.join("; ")}`;
}

function formatSyntaxErrors(errors: PythonSyntaxError[]): string {
  const details = errors.map(
    (error) => `${error.file}:${error.line}:${error.column}: ${error.message}`,
  );
  return `Incomplete analysis: Python syntax error in ${details.join("; ")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
