import { Node, SyntaxKind, type CatchClause } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { catchHasReturn, catchLooksLikeRethrow, locationOf } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const LOG_CALL = /(log|logger|console|report|capture|track|metric)/i;
const TRANSLATE = /throw new\s+\w+|return\s+\w*(Result|Err|Failure|Fail)\b/;

export function detectSwallowedErrors(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    for (const clause of file.getDescendantsOfKind(SyntaxKind.CatchClause)) {
      classifyCatch(ctx, findings, clause);
    }
  }
  return findings;
}

function classifyCatch(
  ctx: AnalysisContext,
  findings: Finding[],
  clause: CatchClause,
): void {
  if (catchLooksLikeRethrow(clause)) return;
  const block = clause.getBlock();
  const text = block.getText();
  if (TRANSLATE.test(text) && /throw|return/.test(text)) return;

  const statements = block.getStatements();
  const returns = block.getDescendantsOfKind(SyntaxKind.ReturnStatement);
  const returnExpr = returns[0]?.getExpression()?.getText();
  const logs = hasLogCall(clause);
  const empty = statements.length === 0;
  const returnsNullish =
    returnExpr === "null" || returnExpr === "undefined" || returnExpr === "void 0";
  const returnsFallback = catchHasReturn(clause) && !returnsNullish;
  const relative = ctx.relativePath(clause.getSourceFile());
  const owner = ownerName(clause);

  if (empty || (returnsNullish && !logs)) {
    findings.push(
      swallowFinding(ctx, clause, relative, owner, "confirmed", "high", "swallowed-empty", [
        empty ? "Empty catch block swallows the error." : `Catch returns ${returnExpr} without rethrow or translation.`,
      ]),
    );
    return;
  }
  if (returnsNullish && logs) {
    findings.push(
      swallowFinding(ctx, clause, relative, owner, "confirmed", "high", "swallowed-nullish", [
        `Catch logs and returns ${returnExpr}. Callers cannot observe the failure.`,
      ]),
    );
    return;
  }
  if (logs && returnsFallback) {
    findings.push(
      swallowFinding(ctx, clause, relative, owner, "candidate", "medium", "log-fallback", [
        `Catch logs and returns fallback '${returnExpr}'. This may be a legitimate boundary fallback.`,
        "Not classified as definite swallowing.",
      ]),
    );
    return;
  }
  if (logs && !catchHasReturn(clause) && statements.every((stmt) => isLogStatement(stmt))) {
    findings.push(
      swallowFinding(ctx, clause, relative, owner, "confirmed", "medium", "log-only", [
        "Catch logs the error and does not rethrow, translate, or change observable control flow.",
      ]),
    );
  }
}

function swallowFinding(
  ctx: AnalysisContext,
  clause: CatchClause,
  relative: string,
  owner: string,
  status: "confirmed" | "candidate",
  confidence: "high" | "medium",
  kind: string,
  details: string[],
): Finding {
  return makeFinding({
    ruleId: "D03",
    identity: `${kind}:${relative}:${owner}`,
    title: status === "confirmed" ? "Swallowed error" : "Possible boundary fallback",
    severity: status === "confirmed" ? "high" : "medium",
    confidence,
    status,
    explanation: details[0] ?? "Catch block may swallow an error.",
    evidence: { summary: details[0] ?? "Catch swallows an error.", details },
    locations: [locationOf(ctx, clause, owner)],
    affectedSymbols: owner ? [owner] : [],
  });
}

function hasLogCall(clause: CatchClause): boolean {
  return clause.getBlock().getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    return LOG_CALL.test(call.getExpression().getText());
  });
}

function isLogStatement(node: Node): boolean {
  if (Node.isExpressionStatement(node) && Node.isCallExpression(node.getExpression())) {
    return LOG_CALL.test(node.getExpression().getText());
  }
  return false;
}

function ownerName(clause: CatchClause): string {
  const fn =
    clause.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) ??
    clause.getFirstAncestorByKind(SyntaxKind.MethodDeclaration) ??
    clause.getFirstAncestorByKind(SyntaxKind.FunctionExpression) ??
    clause.getFirstAncestorByKind(SyntaxKind.ArrowFunction);
  if (fn && "getName" in fn && typeof fn.getName === "function") {
    return fn.getName() ?? "anonymous";
  }
  return "anonymous";
}
