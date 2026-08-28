import { Node, SyntaxKind, type CallExpression, type ForInStatement, type ForOfStatement, type ForStatement, type WhileStatement } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const REPO_OBJECT = /(repo|repository|store|dao|prisma|database|\bdb\b|client)/i;
const REPO_METHOD = /^(find|get|load|fetch|query|select|read|lookup|list)/i;

export function detectRedundantDbAccess(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    const relative = ctx.relativePath(file);
    for (const fn of [...file.getFunctions(), ...file.getClasses().flatMap((cls) => cls.getMethods())]) {
      const name = fn.getName() ?? "anonymous";
      const body = fn.getBody();
      if (!body) continue;
      const awaits = body.getDescendantsOfKind(SyntaxKind.AwaitExpression);
      reportRepeatedCalls(ctx, findings, relative, name, fn, awaits);
      for (const loop of loopsIn(body)) {
        const loopAwaits = loop
          .getDescendantsOfKind(SyntaxKind.AwaitExpression)
          .filter((node) => looksLikeLookup(callOf(node)));
        for (const node of loopAwaits) {
          const call = callOf(node);
          if (!call) continue;
          const loopBound = usesLoopBinding(call, loop);
          findings.push(
            makeFinding({
              ruleId: "E01",
              identity: `n-plus-one:${relative}:${name}:${call.getExpression().getText()}`,
              title: "Awaited lookup inside a loop",
              severity: "medium",
              confidence: loopBound ? "medium" : "low",
              status: "candidate",
              explanation: `'${name}' awaits a repository/service-style call inside a loop. Possible N+1; not proof of operational cost.`,
              evidence: {
                summary: `await ${call.getExpression().getText()}(...) in a loop.`,
                details: [
                  loopBound
                    ? "The call appears to vary by a loop-derived identifier."
                    : "The call is in a loop; dependence on the loop variable is unclear.",
                  "ORM-agnostic heuristic; confirm the data-access boundary.",
                ],
              },
              locations: [locationOf(ctx, node, name)],
              affectedSymbols: [name, call.getExpression().getText()],
            }),
          );
        }
      }
    }
  }
  return findings;
}

function reportRepeatedCalls(
  ctx: AnalysisContext,
  findings: Finding[],
  relative: string,
  name: string,
  fn: Node,
  awaits: Node[],
): void {
  const keys = new Map<string, number>();
  for (const node of awaits) {
    const call = callOf(node);
    if (!call || !looksLikeLookup(call)) continue;
    const key = call.getText().replace(/\s+/g, " ");
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  for (const [key, count] of keys) {
    if (count < 2) continue;
    findings.push(
      makeFinding({
        ruleId: "E01",
        identity: `repeated-lookup:${relative}:${name}:${key.slice(0, 60)}`,
        title: "Repeated equivalent lookup",
        severity: "medium",
        confidence: "medium",
        status: "candidate",
        explanation: `'${name}' awaits the same lookup more than once in one workflow.`,
        evidence: {
          summary: `${count} equivalent awaits of ${key}.`,
          details: ["Calls are compared by source text; arguments that differ will not match."],
        },
        locations: [locationOf(ctx, fn, name)],
        affectedSymbols: [name],
      }),
    );
  }
}

function callOf(awaitExpr: Node): CallExpression | undefined {
  if (!Node.isAwaitExpression(awaitExpr)) return undefined;
  const expr = awaitExpr.getExpression();
  return Node.isCallExpression(expr) ? expr : undefined;
}

function looksLikeLookup(call: CallExpression | undefined): boolean {
  if (!call) return false;
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return false;
  return REPO_OBJECT.test(expr.getExpression().getText()) && REPO_METHOD.test(expr.getName());
}

function loopsIn(body: Node) {
  return [
    ...body.getDescendantsOfKind(SyntaxKind.ForStatement),
    ...body.getDescendantsOfKind(SyntaxKind.ForOfStatement),
    ...body.getDescendantsOfKind(SyntaxKind.ForInStatement),
    ...body.getDescendantsOfKind(SyntaxKind.WhileStatement),
  ];
}

function usesLoopBinding(
  call: CallExpression,
  loop: ForStatement | ForOfStatement | ForInStatement | WhileStatement,
): boolean {
  const names = new Set<string>();
  if (Node.isForOfStatement(loop) || Node.isForInStatement(loop)) {
    const init = loop.getInitializer();
    for (const ident of init.getDescendantsOfKind(SyntaxKind.Identifier)) names.add(ident.getText());
  }
  if (Node.isForStatement(loop)) {
    const init = loop.getInitializer();
    if (init) {
      for (const ident of init.getDescendantsOfKind(SyntaxKind.Identifier)) names.add(ident.getText());
    }
  }
  return call.getDescendantsOfKind(SyntaxKind.Identifier).some((ident) => names.has(ident.getText()));
}
