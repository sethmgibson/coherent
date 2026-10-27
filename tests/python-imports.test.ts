import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { pythonAnalyzerPath, resolvePythonInterpreter } from "../src/analysis/python.js";

// Keep the former resolver as a behavioral oracle: exact candidate precedence,
// suffix ambiguity and relative package fallback are observable graph semantics.
const oldResolver = String.raw`
def old_resolve(importer, module, level, known):
    base = importer.split("/")[:-1]
    if level:
        if level - 1 > len(base):
            return None
        package = base[:len(base) - (level - 1)]
        names = [piece for piece in module.split(".") if piece] if module else []
        candidates = scope["module_candidates"](package + names)
    else:
        if not module:
            return None
        candidates = scope["module_candidates"](module.split("."))
    matches = []
    for candidate in candidates:
        if candidate in known:
            return candidate
        matches.extend(path for path in known if path == candidate or path.endswith("/" + candidate))
    unique = list(dict.fromkeys(matches))
    return unique[0] if len(unique) == 1 else None
`;

describe("Python import resolution", () => {
  it("preserves the former resolver across exact, ambiguous, relative and spaced paths", async () => {
    expect(await runPython(oldResolver + String.raw`
paths = ["pkg/mod.py", "pkg/mod/__init__.py", "src/pkg/mod.py", "other/pkg/mod.py",
         "src/pkg/mod/__init__.py", "solo.py", "src/solo.py", "space root/solo.py",
         "src/pkg/__init__.py", "pkg/__init__.py"]
count = 0
for mask in range(1 << len(paths)):
    known = {path for bit, path in enumerate(paths) if mask & (1 << bit)}
    suffixes = scope["build_import_suffix_index"](known)
    for importer in ("main.py", "pkg/caller.py", "src/pkg/caller.py", "space root/pkg/caller.py"):
        for level in range(5):
            for module in ("", "pkg.mod", "solo"):
                actual = scope["resolve_module"](importer, module, level, known, suffixes)
                expected = old_resolve(importer, module, level, known)
                assert actual == expected, (known, importer, module, level, actual, expected)
                count += 1
cases = [
    (["pkg/mod.py", "src/pkg/mod.py"], "pkg.mod", "pkg/mod.py"),
    (["src/pkg/mod.py", "other/pkg/mod.py", "pkg/mod/__init__.py"], "pkg.mod", "pkg/mod/__init__.py"),
    (["pkg/mod.py", "pkg/mod/__init__.py"], "pkg.mod", "pkg/mod.py"),
    (["src/pkg/mod.py", "src/pkg/mod/__init__.py"], "pkg.mod", None),
    (["space root/pkg/mod.py", "space root/pkg/mod.py"], "pkg.mod", "space root/pkg/mod.py"),
    (["other/notmod.py"], "mod", None),
    (["src/pkg/mod.py"], "unknown", None),
]
for paths, module, expected in cases:
    known = set(paths)
    actual = scope["resolve_module"]("caller.py", module, 0, known, scope["build_import_suffix_index"](known))
    assert actual == expected, (paths, actual, expected)
json.dump({"parityCases": count, "explicitCases": len(cases)}, sys.stdout)
`)).toEqual({ parityCases: 61_440, explicitCases: 7 });
  });

  it.each([500, 3000])("bounds resolution work and index storage for %i files", async (size) => {
    const metrics = await runPython(String.raw`
class CountedSet(set):
    iterations = 0
    contains = 0
    def __iter__(self):
        self.iterations += 1
        return super().__iter__()
    def __contains__(self, key):
        self.contains += 1
        return super().__contains__(key)
class CountedDict(dict):
    reads = 0
    def __contains__(self, key):
        self.reads += 1
        return super().__contains__(key)
    def __getitem__(self, key):
        self.reads += 1
        return super().__getitem__(key)
size = int(sys.argv[2])
known = CountedSet("root/src/pkg_%d/module_%d.py" % (i, i) for i in range(size))
suffixes = scope["build_import_suffix_index"](known)
storage = sys.getsizeof(suffixes) + sum(sys.getsizeof(key) for key in suffixes)
suffixes = CountedDict(suffixes)
for i in range(size):
    for module in ("os", "sys", "json", "pathlib", "typing"):
        assert scope["resolve_module"]("root/src/pkg_%d/caller.py" % i, module, 0, known, suffixes) is None
json.dump({"iterations": known.iterations, "knownChecks": known.contains,
           "indexReads": suffixes.reads, "queries": size * 5,
           "entries": len(suffixes), "storageBytes": storage}, sys.stdout)
`, [String(size)]) as Record<string, number>;
    expect(metrics.iterations).toBeLessThanOrEqual(1);
    expect(metrics.queries).toBe(size * 5);
    expect(metrics.knownChecks).toBeLessThanOrEqual(size * 10);
    expect(metrics.indexReads).toBeLessThanOrEqual(size * 10);
    expect(metrics.entries).toBeLessThanOrEqual(size * 3);
    // Index-owned dictionary and suffix strings; values reuse known paths.
    // Byte measurements aid review; the entry bound above is independent of
    // the interpreter's object layout.
    expect(metrics.storageBytes).toBeGreaterThan(0);
  });

  it("rebuilds the request-local index and preserves complete ordered edges and diagnostics", async () => {
    expect(await runPython(oldResolver + String.raw`
sources = {
    "caller.py": "import solo, json\nfrom pkg import mod\nimport solo\n",
    "solo.py": "import pkg.mod\n",
    "src/solo.py": "",
    "other/solo.py": "",
    "pkg/__init__.py": "from . import mod\n",
    "pkg/mod.py": "import solo\n",
    "broken.py": "def broken(\n",
}
def read(path):
    if path == "missing.py":
        raise FileNotFoundError("source disappeared")
    return sources[path]
scope["read_text"] = read
original = scope["build_import_suffix_index"]
builds = 0
def build(known):
    global builds
    builds += 1
    return original(known)
scope["build_import_suffix_index"] = build
def collect(paths):
    return scope["collect_imports"]([{"path": path, "relative": path} for path in paths])
paths = ["caller.py", "solo.py", "pkg/__init__.py", "pkg/mod.py", "broken.py", "missing.py", "solo.py"]
first = collect(paths)
assert first["imports"] == [
    {"from": "caller.py", "to": "solo.py"},
    {"from": "caller.py", "to": "pkg/__init__.py"},
    {"from": "caller.py", "to": "solo.py"},
    {"from": "solo.py", "to": "pkg/mod.py"},
    {"from": "pkg/__init__.py", "to": "pkg/__init__.py"},
    {"from": "pkg/mod.py", "to": "solo.py"},
    {"from": "solo.py", "to": "pkg/mod.py"},
]
try:
    scope["ast"].parse(sources["broken.py"], filename="broken.py")
except SyntaxError as error:
    assert first["syntaxErrors"] == [scope["syntax_error"]("broken.py", error)]
assert first["ioErrors"] == [{"file": "missing.py", "line": 1, "column": 1, "message": "source disappeared"}]
second = collect(["caller.py", "src/solo.py"])
assert second == {"imports": [{"from": "caller.py", "to": "src/solo.py"}] * 2, "syntaxErrors": [], "ioErrors": []}
third = collect(["caller.py", "src/solo.py", "other/solo.py"])
assert third == {"imports": [], "syntaxErrors": [], "ioErrors": []}
assert collect(paths) == first
assert builds == 4
json.dump({"requests": builds, "firstEdges": len(first["imports"])}, sys.stdout)
`)).toEqual({ requests: 4, firstEdges: 7 });
  });
});

async function runPython(harness: string, args: string[] = []): Promise<unknown> {
  const interpreter = await resolvePythonInterpreter();
  const result = spawnSync(interpreter, ["-B", "-I", "-c",
    `import json, runpy, sys\nscope = runpy.run_path(sys.argv[1])["collect_imports"].__globals__\n${harness}`,
    pythonAnalyzerPath(), ...args,
  ], { encoding: "utf8" });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as unknown;
}
