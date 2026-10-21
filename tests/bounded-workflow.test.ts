import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectEvidence } from "../src/audit/collect.js";
import { runAudit } from "../src/audit/run.js";
import { runInit, runRefresh } from "../src/init/run.js";
import { runDoctor } from "../src/doctor/run.js";
import { writeShippedFile } from "../src/install/skill-tree.js";
import { runMigration } from "../src/migrate.js";
import { runReview } from "../src/review/run.js";
import { readDecisions } from "../src/review/store.js";
import { applyReviews } from "../src/review/apply.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), "coherent-bounded-")); roots.push(root);
  const defaults = { "package.json": '{"name":"bounded","type":"module"}',
    "tsconfig.json": '{"compilerOptions":{"allowJs":true,"strict":true,"target":"ES2022","module":"ESNext","moduleResolution":"Bundler"}}' };
  for (const [path, source] of Object.entries({ ...defaults, ...files })) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), source, "utf8");
  }
  return root;
}

describe("bounded source workflow", () => {
  it("collects selected evidence without reading or changing malformed advanced state", async () => {
    const root = await fixture({
      "src/contracts.ts": 'export type Order = { id: string; amount: number; status: string }; export type OrderCopy = { id: string; amount: number; status: string };',
      ".coherent/decisions.json": "invalid decisions", ".coherent/baseline.json": "invalid baseline",
      "coherent.json": '{"python":"/missing/python"}', "unrelated.py": "def broken(\n",
    });
    const result = await collectEvidence(root, { include: ["src"], rules: ["A06"] });
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).not.toHaveProperty("fingerprint");
    expect(result.observations[0]).not.toHaveProperty("prerequisiteFindingIds");
    expect(result.observations[0]).not.toHaveProperty("cleanupBenefit");
    expect(await readdir(join(root, ".coherent"))).toEqual(["baseline.json", "decisions.json"]);
    expect(await readFile(join(root, ".coherent/decisions.json"), "utf8")).toBe("invalid decisions");
    expect(await readFile(join(root, ".coherent/baseline.json"), "utf8")).toBe("invalid baseline");
  });

  it("works without any Coherent state and rejects invalid scope rather than claiming completeness", async () => {
    const root = await fixture({ "src/a.ts": "export const value = 1;" });
    await collectEvidence(root, { include: ["src/a.ts"], rules: ["A06"] });
    expect((await readdir(root)).includes(".coherent")).toBe(false);
    await expect(collectEvidence(root, { include: ["../escape.ts"], rules: ["A06"] })).rejects.toThrow(/inside the repository/);
    await expect(collectEvidence(root, { include: ["missing.ts"], rules: ["A06"] })).rejects.toThrow(/Incomplete analysis/);
  });

  it("keeps nullable and optional finite contracts out of string repetition while retaining open strings", async () => {
    const files: Record<string, string> = {};
    for (const [name, type] of Object.entries({ plain: '"open" | "done"', nullable: '"open" | "done" | null', optional: '"open" | "done" | undefined', open: "string | null" })) {
      files[`src/${name}.ts`] = `export interface Row { state: ${type} }; export function a(row: Row) {return row.state === "open"}; export function b(row: Row) {return row.state === "open"};`;
    }
    const root = await fixture(files);
    const { observations } = await collectEvidence(root, { rules: ["A03"] });
    expect(observations).toHaveLength(1);
    expect(observations[0]?.locations.every(loc => loc.file === "src/open.ts")).toBe(true);
  });

  it("recognizes check tests and Next route registration without hiding spare exports", async () => {
    const root = await fixture({ "package.json": '{"name":"next-app","dependencies":{"next":"16.0.0"}}',
      "src/app/api/orders/route.ts": "export function GET(){return {ok:true}}; export const POST = () => ({ok:true}); export const spare = 1;",
      "src/worker.check.ts": 'export function testFailure() { try { throw Error("expected"); } catch { } }',
    });
    const { findings } = await runAudit(root);
    expect(findings.some(f => f.ruleId === "D03" && f.locations[0]?.file.endsWith(".check.ts"))).toBe(false);
    const dead = findings.filter(f => f.ruleId === "A08");
    expect(dead.some(f => f.affectedSymbols.includes("GET") || f.affectedSymbols.includes("POST"))).toBe(false);
    expect(dead.some(f => f.affectedSymbols.includes("spare"))).toBe(true);
  });

  it("counts literal CommonJS, CSS and script consumers and keeps uncertain dependencies as candidates", async () => {
    const root = await fixture({
      "package.json": JSON.stringify({name:"deps", scripts:{ migrate:"auth-tool migrate" }, dependencies:{"auth-tool":"1","css-lib":"1","tinyglobby":"1","actually-unused":"1"}}),
      "src/style.css": '@import "css-lib";', "src/tool.cjs": 'const glob = require("tinyglobby"); console.log(glob);',
    });
    const { observations } = await collectEvidence(root, { rules: ["D01"] });
    expect(observations.map(item => item.identity)).toEqual(["unused-dep:actually-unused"]);
    expect(observations[0]?.status).toBe("candidate");
  });

  it("attributes overlapping dependencies to the owning nested manifest", async () => {
    const root = await fixture({
      "web/package.json": '{"name":"web","dependencies":{"moment":"1","dayjs":"1"}}',
      "web/src/app.ts": "export const application = true;",
    });
    const { findings } = await runAudit(root);
    const overlap = findings.find(item => item.identity.startsWith("overlap-dep:"));
    expect(overlap).toBeDefined();
    expect(overlap?.locations.every(location => location.file === "web/package.json")).toBe(true);
    expect(overlap?.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not count numeric Python defaults and handles Annotated, positional-only and keyword-only booleans", async () => {
    const root = await fixture({ "app.py": `from typing import Annotated

def projection(include_lines: bool=False, include_summary: bool=True, offset: Annotated[int, 'query']=0, limit: int=1):
    return offset + limit

def flags(first: Annotated[bool, 'query'], /, *, second: bool=False, third: bool=False):
    return first or second or third
` });
    const { observations } = await collectEvidence(root, { rules: ["C03"] });
    expect(observations.some(item => item.affectedSymbols.includes("projection"))).toBe(false);
    expect(observations.some(item => item.affectedSymbols.includes("flags"))).toBe(true);
  });

  it("keeps independent failure boundaries separate and stable across line movement", async () => {
    const source = `def worker():
    try:
        first()
    except Exception:
        print('first')
        return None
    try:
        second()
    except Exception:
        print('second')
        return None
`;
    const root = await fixture({ "app.py": source });
    const first = (await runAudit(root)).findings.filter(f => f.ruleId === "D03");
    expect(first).toHaveLength(2);
    expect(new Set(first.map(f => f.fingerprint)).size).toBe(2);
    await writeFile(join(root, "app.py"), "\n\n" + source);
    expect((await runAudit(root)).findings.filter(f => f.ruleId === "D03").map(f => f.fingerprint)).toEqual(first.map(f => f.fingerprint));
  });

  it("reopens an unchanged finding identity when reviewed source assumptions change", async () => {
    const source = 'export interface Row {state:string}; export function a(row:Row){return row.state === "open"}; export function b(row:Row){return row.state === "open"};';
    const root = await fixture({ "src/state.ts": source });
    const first = (await runAudit(root)).findings.find(f => f.ruleId === "A03")!;
    await runReview(root, "dismissed", first.fingerprint, "Boundary handles open states intentionally.");
    const decisions = await readDecisions(root);
    expect(applyReviews([first], decisions.reviews, []).findings).toHaveLength(0);
    await writeFile(join(root, "src/state.ts"), "\n\n" + source);
    const shifted = (await runAudit(root)).findings.find(f => f.ruleId === "A03")!;
    expect(shifted.evidenceHash).toBe(first.evidenceHash);
    expect(applyReviews([shifted], decisions.reviews, []).findings).toHaveLength(0);
    await writeFile(join(root, "src/state.ts"), source.replace("state:string", "state:string | number"));
    const changed = (await runAudit(root)).findings.find(f => f.ruleId === "A03")!;
    expect(changed.fingerprint).toBe(first.fingerprint);
    expect(applyReviews([changed], decisions.reviews, []).needsReview.has(changed.fingerprint)).toBe(true);
    expect(await readFile(join(root, ".coherent/decisions.json"), "utf8")).toContain(first.evidenceHash);
  });

  it("leaves new focused context unchanged after source edits and explicit refresh", async () => {
    const root = await fixture({ "src/a.ts": "export const value=1;" });
    const initialized = await runInit(root);
    const before = await readFile(initialized.architecturePath, "utf8");
    await writeFile(join(root, "src/a.ts"), "export const value=2;\n\n");
    await runRefresh(root);
    expect(await readFile(initialized.architecturePath, "utf8")).toBe(before);
    expect((await runDoctor(root)).ok).toBe(true);
  });

  it("preserves a lone legacy directory and fails migration before writes on malformed stored JSON", async () => {
    const original = "# Legacy ownership\nNever duplicate sends.\n";
    const root = await fixture({ ".backend/ARCHITECTURE.md": original,
      ".backend/reviews.json": '{"reviews":[{"fingerprint":"legacy-review"}]}',
      ".backend/semantic-findings.json": '{"findings":[]}', ".backend/baseline.json": "broken JSON" });
    await expect(runMigration(root, true)).rejects.toThrow();
    expect(await readFile(join(root, ".backend/ARCHITECTURE.md"), "utf8")).toBe(original);
    await writeFile(join(root, ".backend/baseline.json"), '{"kept":"unchanged"}');
    const preview = await runMigration(root);
    expect(preview.reviewsNeedingEvidence).toEqual(["legacy-review"]);
    await runMigration(root, true);
    expect(await readFile(join(root, ".backend/reviews.json"), "utf8")).toBe('{"reviews":[{"fingerprint":"legacy-review"}]}');
    expect((await readdir(root)).includes(".coherent")).toBe(false);
  });

  it("updates managed reference interiors while retaining authored additions and unfenced legacy copies", async () => {
    const root = await fixture();
    const path = join(root, "reference.md");
    await writeShippedFile(path, "shipped v1\n", "reference");
    const first = await readFile(path, "utf8");
    await writeFile(path, "User preface.\n" + first + "User appendix.\n");
    expect((await writeShippedFile(path, "shipped v2\n", "reference")).action).toBe("updated");
    expect(await readFile(path, "utf8")).toBe("User preface.\n<!-- coherent:reference -->\nshipped v2\n<!-- /coherent:reference -->\nUser appendix.\n");
    await writeFile(path, "User-authored legacy reference.\n");
    expect((await writeShippedFile(path, "shipped v3\n", "reference")).action).toBe("skipped");
    expect(await readFile(path, "utf8")).toBe("User-authored legacy reference.\n");
  });

  it("previews migration without writes and preserves authored text and every stored state byte on write", async () => {
    const architecture = '# Architecture\n\nOwned invariant: never resend uncertainty.\n<!-- coherent:discovered -->\nApproximate size: 99 files\n<!-- /coherent:discovered -->\n## My custom section\nKeep this exactly.\n<!-- coherent:architecture-schema 1 -->\n';
    const baseline = '{"original":"comparison point"}\n';
    const decisions = '{"schemaVersion":1,"reviews":[{"fingerprint":"old","reason":"keep","custom":"authored"}],"findings":[]}\n';
    const root = await fixture({ ".coherent/ARCHITECTURE.md": architecture, ".coherent/baseline.json": baseline, ".coherent/decisions.json": decisions });
    const preview = await runMigration(root);
    expect(preview.wrote).toBe(false);
    expect(preview.reviewsNeedingEvidence).toEqual(["old"]);
    expect(await readFile(join(root, ".coherent/ARCHITECTURE.md"), "utf8")).toBe(architecture);
    const migrated = await runMigration(root, true);
    expect(migrated.wrote).toBe(true);
    const after = await readFile(join(root, ".coherent/ARCHITECTURE.md"), "utf8");
    expect(after).toContain("Owned invariant: never resend uncertainty.");
    expect(after).toContain("## My custom section\nKeep this exactly.");
    expect(after).not.toContain("Approximate size");
    expect(await readFile(join(root, ".coherent/baseline.json"), "utf8")).toBe(baseline);
    expect(await readFile(join(root, ".coherent/decisions.json"), "utf8")).toBe(decisions);
    expect((await runMigration(root, true)).wrote).toBe(false);
    expect(await readdir(join(root, ".coherent"))).toEqual(["ARCHITECTURE.md", "baseline.json", "decisions.json"]);
  });
});
