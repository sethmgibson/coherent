import {
  Node,
  SyntaxKind,
  type ClassDeclaration,
  type FunctionDeclaration,
  type MethodDeclaration,
  type Statement,
  type VariableDeclaration,
} from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import {
  dynamicallyImportedFiles,
  hasFrameworkDecorator,
  isCliSurface,
  isJobSurface,
  locationOf,
  looksLikeFrameworkName,
  statementTerminates,
  isFalseLiteral,
} from "../analysis/inspect.js";
import { externalReferences } from "../analysis/references.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

export function detectDeadCode(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  const dynamicFiles = dynamicallyImportedFiles(ctx);

  for (const file of ctx.sourceFiles) {
    const relative = ctx.relativePath(file);
    for (const fn of file.getFunctions()) {
      considerDeclaration(ctx, findings, fn, relative, dynamicFiles, "function");
    }
    for (const cls of file.getClasses()) {
      considerDeclaration(ctx, findings, cls, relative, dynamicFiles, "class");
      for (const method of cls.getMethods()) {
        considerMethod(ctx, findings, cls, method, relative, dynamicFiles);
      }
    }
    for (const variable of file.getVariableDeclarations()) {
      considerVariable(ctx, findings, variable, relative, dynamicFiles);
    }
    collectUnreachable(ctx, findings, file.getStatements());
    for (const fn of file.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
      const body = fn.getBody();
      if (body && Node.isBlock(body)) collectUnreachable(ctx, findings, body.getStatements());
    }
    for (const method of file.getDescendantsOfKind(SyntaxKind.MethodDeclaration)) {
      const body = method.getBody();
      if (body && Node.isBlock(body)) collectUnreachable(ctx, findings, body.getStatements());
    }
  }
  return findings;
}

function considerDeclaration(
  ctx: AnalysisContext,
  findings: Finding[],
  node: FunctionDeclaration | ClassDeclaration,
  relative: string,
  dynamicFiles: Set<string>,
  kind: "function" | "class",
): void {
  const name = node.getName();
  if (!name || name === "default") return;
  const refs = externalReferences(node);
  if (refs.length > 0) return;
  findings.push(
    classifyUnused(ctx, node, name, relative, dynamicFiles, kind, node.isExported()),
  );
}

function considerVariable(
  ctx: AnalysisContext,
  findings: Finding[],
  node: VariableDeclaration,
  relative: string,
  dynamicFiles: Set<string>,
): void {
  const name = node.getName();
  if (!name || name.startsWith("_")) return;
  if (node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) return;
  const refs = externalReferences(node);
  if (refs.length > 0) return;
  const exported =
    node.getVariableStatement()?.isExported() === true ||
    node.getFirstAncestorByKind(SyntaxKind.ExportDeclaration) !== undefined;
  findings.push(
    classifyUnused(ctx, node, name, relative, dynamicFiles, "constant", exported),
  );
}

function considerMethod(
  ctx: AnalysisContext,
  findings: Finding[],
  cls: ClassDeclaration,
  method: MethodDeclaration,
  relative: string,
  dynamicFiles: Set<string>,
): void {
  const name = method.getName();
  if (!name || name === "constructor" || name.startsWith("_")) return;
  if (isInterfaceOrOverride(cls, method)) return;
  const refs = externalReferences(method);
  if (refs.length > 0) return;
  const isPrivate = method.hasModifier(SyntaxKind.PrivateKeyword);
  const exportedClass = cls.isExported();
  const decorated =
    hasFrameworkDecorator(method) || hasFrameworkDecorator(cls);
  if (isPrivate && !decorated) {
    findings.push(
      unusedFinding(ctx, method, name, relative, "confirmed", "high", [
        "Private method has no static references.",
        "Not an interface implementation or override.",
      ]),
    );
    return;
  }
  findings.push(
    classifyUnused(
      ctx,
      method,
      name,
      relative,
      dynamicFiles,
      "method",
      exportedClass || method.hasModifier(SyntaxKind.PublicKeyword),
      decorated,
    ),
  );
}

function classifyUnused(
  ctx: AnalysisContext,
  node: Node,
  name: string,
  relative: string,
  dynamicFiles: Set<string>,
  kind: string,
  exported: boolean,
  decorated = hasFrameworkDecorator(node),
): Finding {
  const reasons: string[] = [`No static references to ${kind} '${name}' were found.`];
  const indirect = indirectReachability(name, relative, exported, decorated, dynamicFiles, ctx);
  if (indirect.length > 0) {
    reasons.push(...indirect);
    return unusedFinding(ctx, node, name, relative, "candidate", "medium", reasons, kind);
  }
  reasons.push("Not exported, decorated, or registered as a framework/CLI/public surface.");
  return unusedFinding(ctx, node, name, relative, "confirmed", "high", reasons, kind);
}

function indirectReachability(
  name: string,
  relative: string,
  exported: boolean,
  decorated: boolean,
  dynamicFiles: Set<string>,
  ctx: AnalysisContext,
): string[] {
  const reasons: string[] = [];
  if (decorated) reasons.push("Has a framework decorator; may be constructed by DI or reflection.");
  if (looksLikeFrameworkName(name)) {
    reasons.push("Name matches a framework role (service, controller, handler, job, ...).");
  }
  if (exported && ctx.isPublicModule(relative)) {
    reasons.push("Exported from a package entrypoint, bin, or public export.");
  } else if (exported) {
    reasons.push("Exported; no internal callers. May still be a public or future API.");
  }
  if (exported && isCliSurface(relative)) {
    reasons.push("Exported from a CLI command surface.");
  }
  if (exported && isJobSurface(relative)) {
    reasons.push("Exported from a job/worker/queue surface.");
  }
  if (dynamicFiles.has(relative) && exported) {
    reasons.push("Module is loaded via dynamic import(); exports are not treated as dead.");
  }
  return reasons;
}

function unusedFinding(
  ctx: AnalysisContext,
  node: Node,
  name: string,
  relative: string,
  status: "confirmed" | "candidate",
  confidence: "high" | "medium",
  details: string[],
  kind = "declaration",
): Finding {
  return makeFinding({
    ruleId: "A08",
    identity: `${status === "confirmed" ? "unused" : "unused-candidate"}:${relative}:${name}`,
    title: status === "confirmed" ? "Unused internal declaration" : "Possibly unused export or registration",
    severity: status === "confirmed" ? "high" : "medium",
    confidence,
    status,
    explanation:
      status === "confirmed"
        ? `${kind} '${name}' has no reachable static use.`
        : `${kind} '${name}' has no internal callers, but may be reachable indirectly.`,
    evidence: { summary: details[0] ?? "No static references.", details },
    locations: [locationOf(ctx, node, name)],
    affectedSymbols: [name],
    changeRisk:
      status === "confirmed"
        ? "Low if no reflection or generated callers exist."
        : "Do not delete without confirming public, DI, CLI, or dynamic reachability.",
  });
}

function isInterfaceOrOverride(cls: ClassDeclaration, method: MethodDeclaration): boolean {
  if (method.hasModifier(SyntaxKind.OverrideKeyword)) return true;
  for (const impl of cls.getImplements()) {
    if (impl.getType().getProperty(method.getName())) return true;
  }
  const base = cls.getBaseClass();
  if (!base) return false;
  return (
    base.getInstanceMethod(method.getName()) !== undefined ||
    base.getStaticMethod(method.getName()) !== undefined
  );
}

function collectUnreachable(
  ctx: AnalysisContext,
  findings: Finding[],
  statements: Statement[],
): void {
  let unreachable = false;
  for (const statement of statements) {
    if (unreachable) {
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
