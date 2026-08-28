import { dirname, join } from "node:path";
import {
  Node,
  SyntaxKind,
  type CatchClause,
  type ClassDeclaration,
  type Decorator,
  type InterfaceDeclaration,
  type SourceFile,
  type Statement,
  type TypeAliasDeclaration,
} from "ts-morph";
import type { SourceLocation } from "../domain/finding.js";
import type { AnalysisContext } from "./context.js";

export interface ShapedType {
  name: string;
  file: string;
  properties: string[];
  node: InterfaceDeclaration | ClassDeclaration | TypeAliasDeclaration;
}

export const FRAMEWORK_DECORATORS = new Set([
  "Injectable",
  "Controller",
  "Module",
  "Processor",
  "Catch",
  "Guard",
  "Inject",
  "Command",
  "EventPattern",
  "MessagePattern",
  "Resolver",
  "Query",
  "Mutation",
  "Get",
  "Post",
  "Put",
  "Patch",
  "Delete",
  "Options",
  "Head",
  "Cron",
  "Interval",
]);

export const FRAMEWORK_SUFFIXES =
  /(Controller|Service|Module|Processor|Handler|Command|Job|Consumer|Listener|Guard|Interceptor|Pipe|Resolver|Provider|Gateway|Strategy)$/;

export const CLI_FILE = /(^|\/)(cli|command|commands)(\.[cm]?[tj]sx?$|\/)/i;
export const JOB_FILE = /(^|\/)(jobs?|workers?|queues?)(\/|$)|(\.job|\.worker)\./i;

export function locationOf(
  ctx: AnalysisContext,
  node: Node,
  symbol?: string,
): SourceLocation {
  const file = ctx.relativePath(node.getSourceFile());
  const pos = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  const location: SourceLocation = {
    file,
    line: pos.line,
    column: pos.column,
  };
  if (symbol) location.symbol = symbol;
  return location;
}

export function decoratorNames(node: Node): string[] {
  if (!hasGetDecorators(node)) return [];
  return node.getDecorators().map((decorator) => decoratorName(decorator));
}

function hasGetDecorators(
  node: Node,
): node is Node & { getDecorators(): Decorator[] } {
  return "getDecorators" in node && typeof node.getDecorators === "function";
}

export function decoratorName(decorator: Decorator): string {
  const expr = decorator.getExpression();
  if (Node.isCallExpression(expr)) {
    return expr.getExpression().getText();
  }
  return expr.getText();
}

export function hasFrameworkDecorator(node: Node): boolean {
  return decoratorNames(node).some((name) =>
    FRAMEWORK_DECORATORS.has(name.split(".").pop() ?? name),
  );
}

export function looksLikeFrameworkName(name: string): boolean {
  return FRAMEWORK_SUFFIXES.test(name);
}

export function isCliSurface(relativePath: string): boolean {
  return CLI_FILE.test(relativePath);
}

export function isJobSurface(relativePath: string): boolean {
  return JOB_FILE.test(relativePath);
}

export function leadingComments(node: Node): string[] {
  return node.getLeadingCommentRanges().map((range) => range.getText());
}

export function enclosingComments(node: Node): string[] {
  const comments = [...leadingComments(node)];
  const parent = node.getParent();
  if (parent) comments.push(...leadingComments(parent));
  return comments;
}

export function isFalseLiteral(node: Node): boolean {
  return node.getKind() === SyntaxKind.FalseKeyword || node.getText() === "false";
}

export function statementTerminates(statement: Statement): boolean {
  return (
    Node.isReturnStatement(statement) ||
    Node.isThrowStatement(statement) ||
    Node.isContinueStatement(statement) ||
    Node.isBreakStatement(statement)
  );
}

export function catchLooksLikeRethrow(clause: CatchClause): boolean {
  const block = clause.getBlock();
  const statements = block.getStatements();
  if (statements.length === 0) return false;
  return statements.some((statement) => Node.isThrowStatement(statement));
}

export function catchHasReturn(clause: CatchClause): boolean {
  return clause
    .getBlock()
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .some((statement) => statement.getFirstAncestorByKind(SyntaxKind.CatchClause) === clause);
}

export function importedPackageNames(files: SourceFile[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    for (const declaration of file.getImportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      const pkg = packageNameFromSpecifier(specifier);
      if (pkg) names.add(pkg);
    }
    for (const declaration of file.getExportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (!specifier) continue;
      const pkg = packageNameFromSpecifier(specifier);
      if (pkg) names.add(pkg);
    }
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      if (expr.getKind() !== SyntaxKind.ImportKeyword) continue;
      const arg = call.getArguments()[0];
      if (arg && Node.isStringLiteral(arg)) {
        const pkg = packageNameFromSpecifier(arg.getLiteralValue());
        if (pkg) names.add(pkg);
      }
    }
  }
  return names;
}

export function packageNameFromSpecifier(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return undefined;
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/")[0];
}

export function dynamicallyImportedFiles(
  ctx: AnalysisContext,
): Set<string> {
  const files = new Set<string>();
  for (const file of ctx.sourceFiles) {
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
      const arg = call.getArguments()[0];
      if (!arg || !Node.isStringLiteral(arg)) continue;
      const specifier = arg.getLiteralValue();
      if (!specifier.startsWith(".")) continue;
      const dir = dirname(file.getFilePath());
      const candidates = [
        join(dir, specifier),
        join(dir, specifier.replace(/\.(js|mjs|cjs)$/, ".ts")),
        `${join(dir, specifier)}.ts`,
      ];
      for (const candidate of candidates) {
        const resolved = ctx.project.getSourceFile(candidate);
        if (resolved) files.add(ctx.relativePath(resolved));
      }
    }
  }
  return files;
}

export function nameStem(name: string): string {
  return name
    .replace(/^(Canonical|Legacy|Old|New|Default|Base|Abstract)/, "")
    .replace(/(Data|DTO|Dto|Type|Input|Output|Model|Entity|Info|Details|Record|Props|Options)$/g, "")
    .toLowerCase();
}
