import { Node, SyntaxKind } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const LOOP_METHODS = new Set(["find", "filter", "some", "includes", "sort"]);
const LOOP_KINDS = new Set([
  SyntaxKind.ForStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.WhileStatement,
]);

export function detectAlgorithmicComplexity(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    const relative = ctx.relativePath(file);
    for (const fn of [...file.getFunctions(), ...file.getClasses().flatMap((cls) => cls.getMethods())]) {
      const name = fn.getName() ?? "anonymous";
      const body = fn.getBody();
      if (!body) continue;
      collectNestedLoops(ctx, findings, relative, name, fn, body);
      collectLoopMethods(ctx, findings, relative, name, fn, body);
    }
  }
  return findings;
}

function collectLoopMethods(
  ctx: AnalysisContext,
  findings: Finding[],
  relative: string,
  name: string,
  fn: Node,
  body: Node,
): void {
  for (const call of body.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;
    const method = expr.getName();
    if (!LOOP_METHODS.has(method)) continue;
    if (!insideLoop(call) && !insideForEach(call)) continue;
    if (isAstCollection(expr.getExpression())) continue;
    if (method === "includes" && isStringIncludes(call)) continue;
    findings.push(
      makeFinding({
        ruleId: "E06",
        identity: `loop-${method}:${relative}:${name}`,
        title: `Collection .${method}() inside a loop`,
        severity: "medium",
        confidence: "high",
        status: "candidate",
        explanation: `'${name}' calls .${method}() inside a loop. Probable complexity is O(n·m). This does not claim operational severity without input scale.`,
        evidence: {
          summary: `.${method}() nested under iteration.`,
          details: [call.getText().replace(/\s+/g, " ").slice(0, 120), "Probable complexity: O(n·m)."],
        },
        locations: [locationOf(ctx, call, name)],
        affectedSymbols: [name, method],
      }),
    );
  }
}

function collectNestedLoops(
  ctx: AnalysisContext,
  findings: Finding[],
  relative: string,
  name: string,
  fn: Node,
  body: Node,
): void {
  const loops = [
    ...body.getDescendantsOfKind(SyntaxKind.ForStatement),
    ...body.getDescendantsOfKind(SyntaxKind.ForOfStatement),
    ...body.getDescendantsOfKind(SyntaxKind.ForInStatement),
  ];
  const nested = loops.filter((loop) => {
    const outer = ancestorCollectionLoop(loop);
    if (!outer) return false;
    if (isAstCollection(loopIterable(loop)) || isAstCollection(loopIterable(outer))) return false;
    return !innerDerivedFromOuter(loop, outer);
  });
  if (nested.length === 0) return;
  findings.push(
    makeFinding({
      ruleId: "E06",
      identity: `nested-loop:${relative}:${name}`,
      title: "Nested collection iteration",
      severity: "medium",
      confidence: "high",
      status: "candidate",
      explanation: `'${name}' has nested loops. Probable complexity is O(n·m). Severity depends on input scale.`,
      evidence: {
        summary: `${nested.length} nested loop(s).`,
        details: ["Probable complexity: O(n·m)."],
      },
      locations: [locationOf(ctx, fn, name)],
      affectedSymbols: [name],
    }),
  );
}

function insideLoop(node: Node): boolean {
  let current = node.getParent();
  while (current) {
    if (LOOP_KINDS.has(current.getKind())) return true;
    current = current.getParent();
  }
  return false;
}

function insideForEach(node: Node): boolean {
  const fn = node.getFirstAncestorByKind(SyntaxKind.ArrowFunction)
    ?? node.getFirstAncestorByKind(SyntaxKind.FunctionExpression);
  if (!fn) return false;
  const call = fn.getParent()?.getParent();
  if (!call || !Node.isCallExpression(call)) return false;
  const expr = call.getExpression();
  return Node.isPropertyAccessExpression(expr) && ["forEach", "map"].includes(expr.getName());
}

function ancestorCollectionLoop(node: Node): Node | undefined {
  let current = node.getParent();
  while (current) {
    if (
      current.getKind() === SyntaxKind.ForStatement ||
      current.getKind() === SyntaxKind.ForOfStatement ||
      current.getKind() === SyntaxKind.ForInStatement
    ) {
      return current;
    }
    current = current.getParent();
  }
  return undefined;
}

function innerDerivedFromOuter(inner: Node, outer: Node): boolean {
  const outerName = loopBinding(outer);
  const innerIter = loopIterable(inner);
  if (!outerName || !innerIter) return false;
  const token = new RegExp(`\\b${escapeRegExp(outerName)}\\b`);
  if (token.test(innerIter.getText())) return true;
  if (!Node.isIdentifier(innerIter)) return false;
  const body = Node.isForOfStatement(outer) || Node.isForInStatement(outer) || Node.isForStatement(outer)
    ? outer.getStatement()
    : undefined;
  if (!body) return false;
  for (const decl of body.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    if (decl.getName() !== innerIter.getText()) continue;
    const init = decl.getInitializer()?.getText() ?? "";
    if (token.test(init)) return true;
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loopBinding(loop: Node): string | undefined {
  if (Node.isForOfStatement(loop) || Node.isForInStatement(loop)) {
    const init = loop.getInitializer();
    const ident = init.getFirstDescendantByKind(SyntaxKind.Identifier);
    return ident?.getText();
  }
  return undefined;
}

function loopIterable(loop: Node | undefined): Node | undefined {
  if (!loop) return undefined;
  if (Node.isForOfStatement(loop) || Node.isForInStatement(loop)) return loop.getExpression();
  return undefined;
}

function isAstCollection(expr: Node | undefined): boolean {
  if (!expr) return false;
  const root = collectionRoot(expr);
  if (!Node.isCallExpression(root)) return false;
  return /get[A-Z]|flatMap|descendants/i.test(root.getExpression().getText());
}

function collectionRoot(expr: Node): Node {
  if (!Node.isCallExpression(expr)) return expr;
  const callee = expr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return expr;
  if (["slice", "map", "concat", "filter"].includes(callee.getName())) {
    return collectionRoot(callee.getExpression());
  }
  return expr;
}

function isStringIncludes(call: Node): boolean {
  if (!Node.isCallExpression(call)) return false;
  const arg = call.getArguments()[0];
  return arg !== undefined && Node.isStringLiteral(arg);
}
