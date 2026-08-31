import { Node, VariableDeclarationKind, type Statement } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { isFalseLiteral, locationOf, statementTerminates } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

export function collectUnreachable(
  ctx: AnalysisContext,
  findings: Finding[],
  statements: Statement[],
): void {
  let unreachable = false;
  for (const statement of statements) {
    if (unreachable) {
      // Hoisted bindings and erased types can still be used above the terminator.
      // Deleting a var statement can remove a live binding even if its initializer never runs.
      if (
        Node.isFunctionDeclaration(statement) ||
        Node.isInterfaceDeclaration(statement) ||
        Node.isTypeAliasDeclaration(statement) ||
        (Node.isVariableStatement(statement) &&
          statement.getDeclarationKind() === VariableDeclarationKind.Var)
      ) continue;
      const file = ctx.relativePath(statement.getSourceFile());
      findings.push(
        makeFinding({
          ruleId: "A08",
          identity: `unreachable:${file}:${stableText(statement)}`,
          title: "Unreachable statement",
          severity: "medium",
          confidence: "high",
          status: "confirmed",
          explanation: "A statement appears after a return, throw, break, or continue in the same block.",
          evidence: {
            summary: "Control flow cannot reach this statement.",
            details: [statement.getText().slice(0, 120)],
          },
          locations: [locationOf(ctx, statement)],
          affectedSymbols: [],
        }),
      );
      continue;
    }
    if (Node.isIfStatement(statement)) {
      const then = statement.getThenStatement();
      if (isFalseLiteral(statement.getExpression())) {
        markUnreachableBranch(ctx, findings, then);
      } else if (Node.isBlock(then)) {
        collectUnreachable(ctx, findings, then.getStatements());
      }
      const otherwise = statement.getElseStatement();
      if (otherwise && Node.isBlock(otherwise)) {
        collectUnreachable(ctx, findings, otherwise.getStatements());
      } else if (otherwise && Node.isIfStatement(otherwise)) {
        collectUnreachable(ctx, findings, [otherwise]);
      }
    }
    if (statementTerminates(statement)) unreachable = true;
  }
}

function markUnreachableBranch(
  ctx: AnalysisContext,
  findings: Finding[],
  then: Statement,
): void {
  const targets = Node.isBlock(then) ? then.getStatements() : [then];
  for (const target of targets) {
    findings.push(
      makeFinding({
        ruleId: "A08",
        identity: `unreachable-false:${ctx.relativePath(target.getSourceFile())}:${stableText(target)}`,
        title: "Unreachable branch",
        severity: "medium",
        confidence: "high",
        status: "confirmed",
        explanation: "The then-branch of `if (false)` is unreachable.",
        evidence: { summary: "Condition is the literal false." },
        locations: [locationOf(ctx, target)],
        affectedSymbols: [],
      }),
    );
  }
}

function stableText(node: Node): string {
  return node.getText().replace(/\s+/g, " ").trim().slice(0, 80);
}
