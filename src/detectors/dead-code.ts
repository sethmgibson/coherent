import {
  Node,
  SyntaxKind,
  type BindingElement,
  type ClassDeclaration,
  type FunctionDeclaration,
  type MethodDeclaration,
  type VariableDeclaration,
} from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { dynamicallyImportedFiles, hasFrameworkDecorator } from "../analysis/inspect.js";
import { externalReferences } from "../analysis/references.js";
import { nestReachableMethods } from "../analysis/nest-reachability.js";
import type { Finding } from "../domain/finding.js";
import { classifyUnused, testOnlyFinding, unusedFinding } from "./dead-code-unused.js";
import { collectUnreachable } from "./dead-code-unreachable.js";

export function detectDeadCode(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  const dynamicFiles = dynamicallyImportedFiles(ctx);
  const nestMethods = nestReachableMethods(ctx);

  for (const file of ctx.sourceFiles) {
    const relative = ctx.relativePath(file);
    if (!ctx.isTestFile(relative)) {
      for (const fn of file.getFunctions()) {
        considerDeclaration(ctx, findings, fn, relative, dynamicFiles, "function");
      }
      for (const cls of file.getClasses()) {
        considerDeclaration(ctx, findings, cls, relative, dynamicFiles, "class");
        for (const method of cls.getMethods()) {
          if (nestMethods.has(method)) continue;
          considerMethod(ctx, findings, cls, method, relative, dynamicFiles);
        }
      }
      for (const variable of file.getVariableDeclarations()) {
        considerVariable(ctx, findings, variable, relative, dynamicFiles);
      }
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
  if (hasConsumers(ctx, findings, node, name)) return;
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
  const nameNode = node.getNameNode();
  if (Node.isObjectBindingPattern(nameNode) || Node.isArrayBindingPattern(nameNode)) {
    if (isRequireInitializer(node)) return;
    for (const element of nameNode.getElements()) {
      if (Node.isBindingElement(element)) {
        considerBinding(ctx, findings, element, relative, dynamicFiles);
      }
    }
    return;
  }
  const name = node.getName();
  if (!name || name.startsWith("_") || name.includes("{") || name.includes("[")) return;
  if (node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) return;
  if (hasConsumers(ctx, findings, node, name)) return;
  findings.push(
    classifyUnused(ctx, node, name, relative, dynamicFiles, "constant", isExportedVariable(node)),
  );
}

function considerBinding(
  ctx: AnalysisContext,
  findings: Finding[],
  element: BindingElement,
  relative: string,
  dynamicFiles: Set<string>,
): void {
  const name = element.getName();
  if (!name || name.startsWith("_") || name.includes("{") || name.includes("[")) return;
  if (hasConsumers(ctx, findings, element, name)) return;
  const variable = element.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const exported = variable ? isExportedVariable(variable) : false;
  findings.push(
    classifyUnused(ctx, element, name, relative, dynamicFiles, "constant", exported),
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
  if (hasConsumers(ctx, findings, method, name)) return;
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

function hasConsumers(ctx: AnalysisContext, findings: Finding[], node: Node, name: string): boolean {
  const refs = externalReferences(node);
  if (refs.length === 0) return false;
  const consumers = refs.filter((ref) =>
    ref.getSourceFile() !== node.getSourceFile() ||
    ref.getStart() < node.getStart() || ref.getEnd() > node.getEnd(),
  );
  if (consumers.length > 0 && consumers.every((ref) => ctx.isTestFile(ctx.relativePath(ref.getSourceFile())))) {
    findings.push(testOnlyFinding(ctx, node, name, consumers));
  }
  return true;
}

function isExportedVariable(node: VariableDeclaration): boolean {
  return (
    node.getVariableStatement()?.isExported() === true ||
    node.getFirstAncestorByKind(SyntaxKind.ExportDeclaration) !== undefined
  );
}

function isRequireInitializer(node: VariableDeclaration): boolean {
  const init = node.getInitializer();
  if (!init) return false;
  if (Node.isCallExpression(init) && init.getExpression().getText() === "require") return true;
  if (Node.isPropertyAccessExpression(init)) {
    const expr = init.getExpression();
    if (Node.isCallExpression(expr) && expr.getExpression().getText() === "require") return true;
  }
  return /\brequire\s*\(/.test(init.getText());
}
