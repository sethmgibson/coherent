import { join } from "node:path";
import { SyntaxKind } from "ts-morph";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnalysisContext } from "../src/analysis/context.js";
import { findingFromEvidence } from "../src/audit/finding-factory.js";
import { detectSwallowedErrors } from "../src/detectors/swallowed-errors.js";
import { collectInventory } from "../src/inventory.js";
import { scannerFixture } from "./helpers/audit-fixture.js";

async function contextFor(source: string) {
  const inventory = await collectInventory(scannerFixture);
  const ctx = await createAnalysisContext(scannerFixture, inventory, {}, { include: [] });
  const file = ctx.project.createSourceFile(join(scannerFixture, "errors.ts"), source);
  ctx.sourceFiles.push(file);
  return { ctx, file };
}

function sourceFor(size: number, rethrowOnly = false): string {
  return Array.from({ length: size }, (_, index) =>
    `function work${index}() { try { task${index % 3}(); } catch (error) { ${rethrowOnly || index % 5 === 0 ? "throw error;" : ""} } }`,
  ).join("\n");
}

afterEach(() => vi.restoreAllMocks());

describe("swallowed error anchors", () => {
  it("preserves complete evidence and fingerprints across nested catches and skipped peers", async () => {
    const { ctx } = await contextFor(`
function rethrow() { try { shared(); } catch (error) { throw error; } }
function translate() { try { shared(); } catch (error) { throw new Error('translated'); } }
function empty() { try { shared(); } catch {} }
function nullish(): string | null { try {\n  shared();\n} catch { return null; } }
function fallback() { try { shared(); } catch (error) { console.log(error); return 'fallback'; } }
function outer() { try { outerTask(); } catch {
  try { shared(); } catch {}
} }
function nestedTry() { try { try { shared(); } catch {} } catch {} }
function logged() { try { separate(); } catch (error) { console.log(error); } }
function skipLoop() { for (;;) { try { shared(); } catch { continue; } } }
`);
    const excluded = ctx.project.createSourceFile(join(scannerFixture, "errors.test.ts"), sourceFor(5));
    ctx.sourceFiles.push(excluded);
    const evidence = detectSwallowedErrors(ctx);
    expect(evidence.map((item) => JSON.stringify(item))).toMatchInlineSnapshot(`
      [
        "{"ruleId":"D03","title":"Swallowed error","identity":"swallowed-empty:errors.ts:empty:efd487c29269:3","severity":"high","confidence":"high","detectionMode":"hybrid","status":"confirmed","explanation":"Empty catch block swallows the error.","evidence":{"summary":"Empty catch block swallows the error.","details":["Empty catch block swallows the error."]},"locations":[{"file":"errors.ts","line":4,"column":38,"symbol":"empty"}],"affectedSymbols":["empty"]}",
        "{"ruleId":"D03","title":"Possible boundary fallback","identity":"swallowed-empty:errors.ts:nullish:efd487c29269:4","severity":"medium","confidence":"medium","detectionMode":"hybrid","status":"candidate","explanation":"Catch returns null without rethrow or translation.","evidence":{"summary":"Catch returns null without rethrow or translation.","details":["Catch returns null without rethrow or translation.","The callable explicitly permits a nullish result, so this may be an intentional absence protocol."]},"locations":[{"file":"errors.ts","line":7,"column":3,"symbol":"nullish"}],"affectedSymbols":["nullish"]}",
        "{"ruleId":"D03","title":"Possible boundary fallback","identity":"log-fallback:errors.ts:fallback:efd487c29269:5","severity":"medium","confidence":"medium","detectionMode":"hybrid","status":"candidate","explanation":"Catch logs and returns fallback ''fallback''. This may be a legitimate boundary fallback.","evidence":{"summary":"Catch logs and returns fallback ''fallback''. This may be a legitimate boundary fallback.","details":["Catch logs and returns fallback ''fallback''. This may be a legitimate boundary fallback.","Not classified as definite swallowing."]},"locations":[{"file":"errors.ts","line":8,"column":41,"symbol":"fallback"}],"affectedSymbols":["fallback"]}",
        "{"ruleId":"D03","title":"Swallowed error","identity":"swallowed-empty:errors.ts:outer:efd487c29269:6","severity":"high","confidence":"high","detectionMode":"hybrid","status":"confirmed","explanation":"Empty catch block swallows the error.","evidence":{"summary":"Empty catch block swallows the error.","details":["Empty catch block swallows the error."]},"locations":[{"file":"errors.ts","line":10,"column":21,"symbol":"outer"}],"affectedSymbols":["outer"]}",
        "{"ruleId":"D03","title":"Swallowed error","identity":"swallowed-empty:errors.ts:nestedTry:efd487c29269:7","severity":"high","confidence":"high","detectionMode":"hybrid","status":"confirmed","explanation":"Empty catch block swallows the error.","evidence":{"summary":"Empty catch block swallows the error.","details":["Empty catch block swallows the error."]},"locations":[{"file":"errors.ts","line":12,"column":48,"symbol":"nestedTry"}],"affectedSymbols":["nestedTry"]}",
        "{"ruleId":"D03","title":"Swallowed error","identity":"swallowed-empty:errors.ts:nestedTry:02e03b0378c0:1","severity":"high","confidence":"high","detectionMode":"hybrid","status":"confirmed","explanation":"Empty catch block swallows the error.","evidence":{"summary":"Empty catch block swallows the error.","details":["Empty catch block swallows the error."]},"locations":[{"file":"errors.ts","line":12,"column":59,"symbol":"nestedTry"}],"affectedSymbols":["nestedTry"]}",
        "{"ruleId":"D03","title":"Swallowed error","identity":"log-only:errors.ts:logged:82925e48de56:1","severity":"high","confidence":"medium","detectionMode":"hybrid","status":"confirmed","explanation":"Catch logs the error and does not rethrow, translate, or change observable control flow.","evidence":{"summary":"Catch logs the error and does not rethrow, translate, or change observable control flow.","details":["Catch logs the error and does not rethrow, translate, or change observable control flow."]},"locations":[{"file":"errors.ts","line":13,"column":41,"symbol":"logged"}],"affectedSymbols":["logged"]}",
        "{"ruleId":"D03","title":"Swallowed error","identity":"swallowed-loop-exit:errors.ts:skipLoop:efd487c29269:8","severity":"high","confidence":"high","detectionMode":"hybrid","status":"confirmed","explanation":"Catch skips the current loop work without rethrowing or exposing the failure to callers.","evidence":{"summary":"Catch skips the current loop work without rethrowing or exposing the failure to callers.","details":["Catch skips the current loop work without rethrowing or exposing the failure to callers."]},"locations":[{"file":"errors.ts","line":14,"column":52,"symbol":"skipLoop"}],"affectedSymbols":["skipLoop"]}",
      ]
    `);
    expect(evidence.map((item) => findingFromEvidence(item).fingerprint)).toMatchInlineSnapshot(`
      [
        "4035f67950e2afdb505a63890fbe404f3481ece529b95a1f4c94aef53b124bfe",
        "e20fc69135bb351a29667249aa899f9ed52fe024b2c45e28dd790a730006de95",
        "6997f20168e4ae9db5b508729639cf91b963fbb62916b0a92f56fef04f79689a",
        "1acdec5720698662743aa3b24554c430a8f341528047ae4543fa3b864621799a",
        "c4c527534717e4eb6e8091bb1a001869ec5a604e9a4d3cb90f2d9d62c0502979",
        "1d60f43b1aa32784f3ce93dff95b49529b68b03de23f4b6bb3ccf186e4d7216f",
        "cd6879d37cf9c186050a18460f20b21f7c4b0377e10aa56fe64409ee7299c6ea",
        "ace94ba4e2a3f305a0f05a1d83e21326b40bac1b3bb38a7070411707ae2eb41b",
      ]
    `);
  });

  it.each([100, 400])("reads each try body once for %i catches", async (size) => {
    const { ctx, file } = await contextFor(sourceFor(size));
    const clauses = file.getDescendantsOfKind(SyntaxKind.CatchClause);
    const bodyReads = clauses.map((clause) =>
      vi.spyOn(clause.getParentIfKindOrThrow(SyntaxKind.TryStatement).getTryBlock(), "getText"),
    );
    const enumerations = vi.spyOn(file, "getDescendantsOfKind");
    const evidence = detectSwallowedErrors(ctx);
    expect(evidence).toHaveLength(size * 0.8);
    expect(enumerations.mock.calls.filter(([kind]) => kind === SyntaxKind.CatchClause)).toHaveLength(1);
    expect(bodyReads.reduce((total, spy) => total + spy.mock.calls.length, 0)).toBe(size);
    expect(new Set(evidence.map((item) => findingFromEvidence(item).fingerprint)).size).toBe(evidence.length);
  });

  it("does no anchor work in files without findings or excluded test files", async () => {
    const { ctx, file } = await contextFor(sourceFor(10, true));
    const excluded = ctx.project.createSourceFile(join(scannerFixture, "errors.test.ts"), sourceFor(10));
    ctx.sourceFiles.push(excluded);
    const reads = file.getDescendantsOfKind(SyntaxKind.TryStatement).map((statement) =>
      vi.spyOn(statement.getTryBlock(), "getText"),
    );
    const excludedEnumeration = vi.spyOn(excluded, "getDescendantsOfKind");
    expect(detectSwallowedErrors(ctx)).toEqual([]);
    expect(reads.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(excludedEnumeration).not.toHaveBeenCalled();
  });

  it("rebuilds anchors on a subsequent scan after AST mutation", async () => {
    const { ctx, file } = await contextFor("function scan() { try { shared(); } catch {} }");
    const before = detectSwallowedErrors(ctx);
    file.insertStatements(0, "function skipped() { try { shared(); } catch (error) { throw error; } }");
    const after = detectSwallowedErrors(ctx);
    expect(before[0]?.identity).toMatch(/:1$/);
    expect(after[0]?.identity).toBe(before[0]?.identity.replace(/:1$/, ":2"));
    file.getFunctions()[1]?.getDescendantsOfKind(SyntaxKind.TryStatement)[0]?.getTryBlock().replaceWithText("{ changed(); }");
    const changed = detectSwallowedErrors(ctx);
    expect(changed[0]?.identity).toMatch(/:1$/);
    expect(changed[0]?.identity).not.toBe(before[0]?.identity);
  });
});
