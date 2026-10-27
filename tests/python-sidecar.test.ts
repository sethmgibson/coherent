import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectPythonFindings,
  expandPythonImporters,
  pythonAnalyzerPath,
  type PythonRuleId,
  resolvePythonInterpreter,
} from "../src/analysis/python.js";
import type { CoherentConfig } from "../src/config.js";
import { collectEvidence } from "../src/audit/collect.js";

const validFinding = {
  ruleId: "A08",
  identity: "unreachable:app.py:work:return 2",
  title: "Unreachable statement",
  severity: "medium",
  confidence: "high",
  status: "confirmed",
  explanation: "Statement follows return.",
  evidence: { summary: "return 2 follows return 1", details: ["return 2"] },
  locations: [{ file: "app.py", line: 3, column: 5, symbol: "work" }],
  affectedSymbols: ["work"],
};
const validAnalyzeResponse = { findings: [validFinding], syntaxErrors: [], ioErrors: [] };
const validImportResponse = { imports: [], syntaxErrors: [], ioErrors: [] };

describe("Python sidecar protocol", () => {
  it("keeps valid but unrequested sidecar findings out of selected evidence", async () => {
    await withResponse(validAnalyzeResponse, async (root, config) => {
      expect(await collectPythonFindings(root, config, undefined, ["D03"])).toEqual([]);
      expect(await collectPythonFindings(root, config, undefined, [])).toEqual([]);
      await writeFile(join(root, "coherent.json"), JSON.stringify(config));
      expect((await collectEvidence(root, { rules: ["D03"] })).observations).toEqual([]);
    });
  });

  it.each([null, "D03", ["A01"], ["D03", 3], ["unknown"], {}])("rejects invalid explicit analyze rule selection: %j", async (rules) => {
    const interpreter = await resolvePythonInterpreter();
    const result = spawnSync(interpreter, ["-B", "-I", pythonAnalyzerPath()], {
      input: JSON.stringify({ mode: "analyze", files: [], rules }), encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Python analysis rules must be an array of supported Python rule IDs.");
    await expect(collectPythonFindings("/not-needed", {}, undefined, rules as unknown as PythonRuleId[])).rejects.toThrow(/Python analysis rules/);
  });

  it("preserves source diagnostics with no detectors selected", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-sidecar-no-rules-"));
    try {
      await writeFile(join(root, "app.py"), "x = 1\n");
      expect(await collectPythonFindings(root, {}, undefined, [])).toEqual([]);
      expect(await collectPythonFindings(root, {}, undefined, ["D03"])).toEqual([]);
      await expect(collectPythonFindings(root, { python: "/missing/python" }, undefined, [])).rejects.toThrow(/no supported interpreter/);
      await writeFile(join(root, "app.py"), "def broken(\n");
      await expect(collectPythonFindings(root, {}, undefined, [])).rejects.toThrow(/Python syntax error in app\.py/);
      await expect(collectPythonFindings(root, {}, ["missing.py"], [])).rejects.toThrow(/failed to load source file missing\.py/);
      const interpreter = await resolvePythonInterpreter();
      const result = spawnSync(interpreter, ["-B", "-I", pythonAnalyzerPath()], {
        input: JSON.stringify({ mode: "analyze", rules: [], files: [
          { path: join(root, "app.py"), relative: "app.py" },
          { path: join(root, "missing.py"), relative: "missing.py" },
        ] }), encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ findings: [], syntaxErrors: [{ file: "app.py" }], ioErrors: [{ file: "missing.py" }] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([100, 400])("avoids unrequested analyses and payloads for %i functions", async (size) => {
    const root = await mkdtemp(join(tmpdir(), "coherent-sidecar-projection-"));
    try {
      await writeFile(join(root, "app.py"), Array.from({ length: size }, (_, index) => `def work_${index}(enabled: bool, visible: bool, notify: bool):
    try:
        return perform(enabled, visible, notify)
    except Exception:
        pass
    return 1
    return 2
`).join("\n"));
      const interpreter = await resolvePythonInterpreter();
      const run = (rules?: string[]) => {
        // Count detector work at the actual sidecar boundary without adding a
        // runtime instrumentation API or retaining benchmark files.
        const harness = `import io, json, runpy, sys
module = runpy.run_path(sys.argv[1])
main = module["main"]
scope = main.__globals__
counts = {}
for name in ("consider_wrapper", "consider_booleans", "scan_block", "classify_except", "add_boolean_combos"):
    original = scope[name]
    counts[name] = 0
    def wrap(*args, _name=name, _original=original, **kwargs):
        counts[_name] += 1
        return _original(*args, **kwargs)
    scope[name] = wrap
output = io.StringIO()
sys.stdout = output
status = main()
sys.stdout = sys.__stdout__
json.dump({"status": status, "result": json.loads(output.getvalue()), "counts": counts, "bytes": len(output.getvalue().encode())}, sys.stdout)
`;
        const result = spawnSync(interpreter, ["-B", "-I", "-c", harness, pythonAnalyzerPath()], {
          input: JSON.stringify({ mode: "analyze", files: [{ path: join(root, "app.py"), relative: "app.py" }], ...(rules === undefined ? {} : { rules }) }),
          encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        return JSON.parse(result.stdout) as { status: number; result: typeof validAnalyzeResponse; counts: Record<string, number>; bytes: number };
      };
      const full = run();
      const selected = run(["D03"]);
      expect(full.result.findings).toHaveLength(3 * size + 1);
      expect(selected.result.findings).toEqual(full.result.findings.filter(finding => finding.ruleId === "D03"));
      expect(selected.result.findings).toHaveLength(size);
      expect(full.counts).toMatchObject({ consider_wrapper: size, consider_booleans: size, classify_except: size, add_boolean_combos: 1 });
      expect(full.counts.scan_block).toBeGreaterThan(size);
      expect(selected.counts).toEqual({ consider_wrapper: 0, consider_booleans: 0, scan_block: 0, classify_except: size, add_boolean_combos: 0 });
      expect(selected.bytes).toBeLessThan(full.bytes / 2);
      const none = run([]);
      expect(none.result).toEqual({ findings: [], syntaxErrors: [], ioErrors: [] });
      expect(Object.values(none.counts)).toEqual([0, 0, 0, 0, 0]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts empty results for each requested mode", async () => {
    await withResponse({ findings: [], syntaxErrors: [], ioErrors: [] }, async (root, config) => {
      expect(await collectPythonFindings(root, config)).toEqual([]);
    });
    await withResponse(validImportResponse, async (root, config) => {
      expect(await expandPythonImporters(root, ["app.py"], config)).toEqual(["app.py"]);
    });
  });

  it("preserves normal findings, optional fields, and harmless future fields", async () => {
    const findingWithoutOptionalFields = {
      ...validFinding,
      evidence: { summary: "summary" },
      locations: [{ file: "app.py" }],
      futureField: "ignored",
    };
    await withResponse({ ...validAnalyzeResponse, findings: [validFinding, findingWithoutOptionalFields] }, async (root, config) => {
      const findings = await collectPythonFindings(root, config);
      expect(findings[0]).toMatchObject(validFinding);
      expect(findings[1]?.evidence).toEqual({ summary: "summary" });
      expect(findings[1]?.locations).toEqual([{ file: "app.py" }]);
    });
  });

  it("accepts import edges and expands transitive callers", async () => {
    await withResponse({ ...validImportResponse, imports: [{ from: "caller.py", to: "app.py" }] }, async (root, config) => {
      expect(await expandPythonImporters(root, ["app.py"], config)).toEqual(["app.py", "caller.py"]);
    });
  });

  it.each([
    null,
    [],
    { imports: [], syntaxErrors: [] },
    { findings: [], syntaxErrors: [] },
    { findings: [], ioErrors: [] },
    { ...validAnalyzeResponse, findings: null },
  ])("rejects malformed or wrong-mode analyze responses: %j", async (response) => {
    await withResponse(response, async (root, config) => {
      await expect(collectPythonFindings(root, config)).rejects.toThrow(/Incomplete analysis: Python sidecar failed/);
    });
  });

  it.each([
    { ruleId: "A01" },
    { severity: "urgent" },
    { confidence: null },
    { status: "dismissed" },
    { identity: "" },
    { title: null },
    { explanation: [] },
    { affectedSymbols: [1] },
    { evidence: { summary: "summary", details: null } },
    { evidence: { details: [] } },
    { locations: [{ file: "app.py", line: "3" }] },
    { locations: [{ file: "app.py", column: 1.5 }] },
    { locations: [{ file: "app.py", symbol: null }] },
    { locations: [{ file: "" }] },
  ])("rejects malformed finding fields: %j", async (patch) => {
    await withResponse({ ...validAnalyzeResponse, findings: [{ ...validFinding, ...patch }] }, async (root, config) => {
      await expect(collectPythonFindings(root, config)).rejects.toThrow(/Incomplete analysis: Python sidecar failed \(invalid findings\[0\]/);
    });
  });

  it.each([
    { syntaxErrors: [{ file: "app.py", line: "1", column: 1, message: "broken" }] },
    { ioErrors: [{ file: "app.py", line: 1, column: null, message: "missing" }] },
    { ioErrors: [{ file: "app.py", line: 1, column: 1 }] },
  ])("rejects malformed diagnostics: %j", async (patch) => {
    await withResponse({ ...validAnalyzeResponse, ...patch }, async (root, config) => {
      await expect(collectPythonFindings(root, config)).rejects.toThrow(/Incomplete analysis: Python sidecar failed \(invalid (syntaxErrors|ioErrors)\[0\]/);
    });
  });

  it.each([
    validAnalyzeResponse,
    { imports: [] },
    { imports: [], syntaxErrors: [] },
    { imports: [], ioErrors: [] },
    { ...validImportResponse, imports: null },
    { ...validImportResponse, imports: [{ from: "caller.py" }] },
    { ...validImportResponse, imports: [{ from: null, to: "app.py" }] },
    { ...validImportResponse, imports: [{ from: "caller.py", to: "" }] },
    { ...validImportResponse, syntaxErrors: [{}] },
    { ...validImportResponse, ioErrors: null },
    { ...validImportResponse, ioErrors: [{ file: "caller.py", line: 1, column: 1 }] },
  ])("rejects malformed or wrong-mode imports responses: %j", async (response) => {
    await withResponse(response, async (root, config) => {
      await expect(expandPythonImporters(root, ["app.py"], config)).rejects.toThrow(/Incomplete analysis: Python sidecar failed/);
    });
  });

  it.each([
    {
      syntaxErrors: [{ file: "caller.py", line: 2, column: 12, message: "invalid syntax" }],
      ioErrors: [],
      message: "Incomplete analysis: Python syntax error in caller.py:2:12: invalid syntax",
    },
    {
      syntaxErrors: [],
      ioErrors: [{ file: "caller.py", line: 1, column: 1, message: "source disappeared" }],
      message: "Incomplete analysis: failed to load source file caller.py: source disappeared",
    },
  ])("rejects partial import graphs with diagnostics: $message", async ({ syntaxErrors, ioErrors, message }) => {
    await withResponse({ imports: [{ from: "caller.py", to: "app.py" }], syntaxErrors, ioErrors }, async (root, config) => {
      await expect(expandPythonImporters(root, ["app.py"], config)).rejects.toThrow(message);
    });
  });

  it("returns IO diagnostics for missing import-analysis sources in the real sidecar", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-sidecar-missing-"));
    try {
      const interpreter = await resolvePythonInterpreter();
      const result = spawnSync(interpreter, ["-B", "-I", pythonAnalyzerPath()], {
        input: JSON.stringify({ mode: "imports", files: [{ path: join(root, "missing.py"), relative: "missing.py" }] }),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        imports: [],
        syntaxErrors: [],
        ioErrors: [{ file: "missing.py", line: 1, column: 1 }],
      });
      expect(result.stdout).toContain(join(root, "missing.py"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unsupported request modes in the real Python sidecar", async () => {
    const interpreter = await resolvePythonInterpreter();
    const result = spawnSync(interpreter, ["-B", "-I", pythonAnalyzerPath()], {
      input: JSON.stringify({ mode: "imoprts", files: [] }),
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unsupported Python sidecar mode: 'imoprts'");
  });
});

async function withResponse(
  response: unknown,
  check: (root: string, config: CoherentConfig) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "coherent-sidecar-"));
  try {
    await writeFile(join(root, "app.py"), "x = 1\n", "utf8");
    await writeFile(join(root, "caller.py"), "import app\n", "utf8");
    const interpreter = join(root, "interpreter.cjs");
    // Exercise the public process boundary: interpreter discovery succeeds, then
    // the subprocess returns a controlled response instead of running analyze.py.
    await writeFile(interpreter,
      `#!${process.execPath}\nprocess.stdout.write(process.argv.includes('-c') ? '3.9\\n' : ${JSON.stringify(JSON.stringify(response))});\n`,
      "utf8",
    );
    await chmod(interpreter, 0o755);
    await check(root, { python: interpreter });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
