import {
  Node,
  SyntaxKind,
  type CallExpression,
  type FunctionDeclaration,
  type MethodDeclaration,
} from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const MEANINGFUL =
  /(authoriz|auth|validat|map|transform|cache|log|metric|audit|translat|wrap|retr|transaction|lock|hydrat|polic|permission|guard)/i;
const STDLIB =
  /^(JSON|Object|Array|String|Number|Math|console|Buffer|path|fs)\.|(\.test|\.exec|\.match|\.replace|\.slice|\.join|\.split|\.stringify|\.parse)$/;

export function detectExcessiveIndirection(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    for (const fn of file.getFunctions()) consider(ctx, findings, fn);
    for (const cls of file.getClasses()) {
      for (const method of cls.getMethods()) consider(ctx, findings, method);
    }
  }
  return findings;
}

function consider(
  ctx: AnalysisContext,
  findings: Finding[],
  fn: FunctionDeclaration | MethodDeclaration,
): void {
  const name = fn.getName();
  if (!name || MEANINGFUL.test(name)) return;
  if (isFrameworkSurface(fn)) return;
  const returnType = fn.getReturnTypeNode();
  if (returnType && Node.isTypePredicate(returnType)) return;
  const params = fn.getParameters();
  if (params.length === 0) return;
  const body = fn.getBody();
  if (!body || !Node.isBlock(body)) return;
  const statements = body.getStatements();
  if (statements.length !== 1) return;
  const stmt = statements[0];
  if (!stmt) return;
  const call = singleCall(stmt);
  if (!call) return;
  if (!sameArguments(params.map((param) => param.getName()), call)) return;
  if (isBuilderChain(call)) return;
  const calleeExpr = call.getExpression();
  const callee = calleeExpr.getText();

  if (MEANINGFUL.test(callee) || MEANINGFUL.test(fn.getText()) || STDLIB.test(callee)) return;
  const relative = ctx.relativePath(fn.getSourceFile());
  const mechanical = Node.isIdentifier(calleeExpr);
  const confirmed = mechanical && isPrivateImplementation(fn);
  findings.push(
    makeFinding({
      ruleId: "B04",
      identity: `forwarding:${relative}:${name}`,
      title: "Forwarding wrapper",
      severity: "medium",
      confidence: confirmed ? "high" : "medium",
      status: confirmed ? "confirmed" : "candidate",
      explanation: `'${name}' accepts arguments, calls one downstream operation with the same values, and adds no visible domain behavior.`,
      evidence: {
        summary: `${name} forwards to ${callee}.`,
        details: [
          `Parameters: ${params.map((param) => param.getName()).join(", ")}`,
          `Downstream: ${callee}`,
          "No authorization, validation, mapping, caching, logging, or error translation is visible.",
        ],
      },
      locations: [locationOf(ctx, fn, name)],
      affectedSymbols: [name, callee],
    }),
  );
}

function isFrameworkSurface(
  fn: FunctionDeclaration | MethodDeclaration,
): boolean {
  if (!Node.isMethodDeclaration(fn)) return false;
  if (fn.getDecorators().length > 0) return true;
  const cls = fn.getParentIfKind(SyntaxKind.ClassDeclaration);
  if (!cls) return false;
  if (cls.getDecorators().length > 0) return true;
  return /(Controller|Resolver|Gateway|Module)$/.test(cls.getName() ?? "");
}

function isPrivateImplementation(
  fn: FunctionDeclaration | MethodDeclaration,
): boolean {
  if (Node.isFunctionDeclaration(fn)) return !fn.isExported();
  return fn.hasModifier(SyntaxKind.PrivateKeyword);
}

function isBuilderChain(call: CallExpression): boolean {
  let expr: Node = call.getExpression();
  while (Node.isPropertyAccessExpression(expr)) {
    expr = expr.getExpression();
    if (Node.isCallExpression(expr)) return true;
    if (Node.isAwaitExpression(expr) && Node.isCallExpression(expr.getExpression())) return true;
  }
  return false;
}

function singleCall(statement: Node): CallExpression | undefined {
  if (Node.isReturnStatement(statement) || Node.isExpressionStatement(statement)) {
    const expr = Node.isReturnStatement(statement)
      ? statement.getExpression()
      : statement.getExpression();
    if (!expr) return undefined;
    if (Node.isCallExpression(expr)) return expr;
    if (Node.isAwaitExpression(expr)) {
      const inner = expr.getExpression();
      if (Node.isCallExpression(inner)) return inner;
    }
  }
  return undefined;
}

function sameArguments(
  params: string[],
  call: { getArguments(): Node[] },
): boolean {
  const args = call.getArguments();
  if (args.length !== params.length) {
    if (args.length === 1 && Node.isSpreadElement(args[0])) return true;
    return false;
  }
  return args.every((arg, index) => {
    if (Node.isIdentifier(arg)) return arg.getText() === params[index];
    if (Node.isSpreadElement(arg) && Node.isIdentifier(arg.getExpression())) {
      return arg.getExpression().getText() === params[index];
    }
    return false;
  });
}
