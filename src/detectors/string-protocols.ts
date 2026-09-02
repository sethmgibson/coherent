import { Node, SyntaxKind } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const PROTOCOL_PROPS = new Set([
  "status",
  "state",
  "type",
  "kind",
  "mode",
  "source",
  "event",
  "action",
  "phase",
  "reason",
  "discriminator",
]);

interface LiteralUse {
  value: string;
  file: string;
  node: Node;
  via: string;
  owner: string;
  scope: string;
}

export function detectStringProtocols(ctx: AnalysisContext): Finding[] {
  const uses: LiteralUse[] = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    const relative = ctx.relativePath(file);
    for (const literal of file.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
      const value = literal.getLiteralValue();
      if (!value || value.length < 2 || value.length > 40) continue;
      if (looksLikeProse(value) || looksLikePath(value)) continue;
      const context = discriminantContext(ctx, literal);
      if (!context) continue;
      uses.push({
        value,
        file: relative,
        node: literal,
        via: context.via,
        owner: protocolOwner(context.via),
        scope: context.scope,
      });
    }
  }

  const byExact = groupBy(uses, (use) => `${use.owner}\0${use.scope}\0${use.value}`);
  const findings: Finding[] = [];
  const reported = new Set<string>();

  for (const [key, group] of byExact) {
    if (group.length < 2) continue;
    const value = group[0]!.value;
    const owner = group[0]!.owner;
    const scope = group[0]!.scope;
    const identity = `string-protocol:${owner}:${scope}:${value}`;
    reported.add(`${owner}\0${scope}\0${normalize(value)}`);
    findings.push(protocolFinding(ctx, identity, value, group, []));
    void key;
  }

  const byNorm = groupBy(
    uses,
    (use) => `${use.owner}\0${use.scope}\0${normalize(use.value)}`,
  );
  for (const [key, group] of byNorm) {
    const variants = [...new Set(group.map((use) => use.value))];
    if (variants.length < 2) continue;
    if (reported.has(key)) continue;
    const owner = group[0]!.owner;
    const scope = group[0]!.scope;
    const identity = `string-protocol-variants:${owner}:${scope}:${normalize(variants[0]!)}`;
    findings.push(protocolFinding(ctx, identity, variants.join(" | "), group, variants));
  }

  return findings;
}

function protocolFinding(
  ctx: AnalysisContext,
  identity: string,
  label: string,
  group: LiteralUse[],
  variants: string[],
): Finding {
  const files = [...new Set(group.map((use) => use.file))];
  const owners = [...new Set(group.map((use) => use.owner))];
  return makeFinding({
    ruleId: "A03",
    identity,
    title: variants.length > 0 ? "String protocol spelling variants" : "Repeated string discriminant",
    severity: "medium",
    confidence: variants.length > 0 ? "medium" : "high",
    status: "candidate",
    explanation:
      variants.length > 0
        ? `Likely spelling or case variants of the same ${owners.join("/")} protocol value: ${label}.`
        : `The literal '${label}' is used as a ${owners.join("/")} discriminant in multiple places.`,
    evidence: {
      summary: `${group.length} ${owners.join("/")} discriminant uses of '${label}'.`,
      details: [
        ...files.map((file) => `Seen in ${file}`),
        ...group.slice(0, 6).map((use) => `${use.via} in ${use.file}`),
        "This is not an automatic enum recommendation.",
      ],
    },
    locations: group.slice(0, 8).map((use) => locationOf(ctx, use.node, use.value)),
    affectedSymbols: [...new Set(group.map((use) => use.value))],
  });
}

function valueOf(literal: Node): string {
  return Node.isStringLiteral(literal) ? literal.getLiteralValue() : literal.getText();
}

function isTypedStringUnion(node: Node, value: string): boolean {
  try {
    const type = node.getType();
    const parts = type.isUnion() ? type.getUnionTypes() : [type];
    if (parts.length < 2 || !parts.every((part) => part.isStringLiteral())) return false;
    return parts.some((part) => part.getLiteralValue() === value);
  } catch {
    return false;
  }
}

function discriminantContext(
  ctx: AnalysisContext,
  literal: Node,
): { via: string; scope: string } | undefined {
  const parent = literal.getParent();
  if (!parent) return undefined;
  if (Node.isCaseClause(parent) || Node.isSwitchStatement(parent)) {
    return switchContext(ctx, literal, parent);
  }
  if (
    Node.isBinaryExpression(parent) &&
    ["===", "!==", "==", "!="].includes(parent.getOperatorToken().getText())
  ) {
    const other = parent.getLeft() === literal ? parent.getRight() : parent.getLeft();
    const text = other.getText();
    if (isTypedStringUnion(other, valueOf(literal))) return undefined;
    const owner = propertyName(other) || bareName(text);
    if (PROTOCOL_PROPS.has(owner)) {
      return {
        via: `compare-${owner}`,
        scope: discriminantScope(ctx, other, owner),
      };
    }
    return undefined;
  }
  return undefined;
}

function switchContext(
  ctx: AnalysisContext,
  literal: Node,
  parent: Node,
): { via: string; scope: string } | undefined {
  const sw = Node.isSwitchStatement(parent)
    ? parent
    : literal.getFirstAncestorByKind(SyntaxKind.SwitchStatement);
  if (!sw || !Node.isSwitchStatement(sw)) return undefined;
  const discriminant = sw.getExpression();
  if (isTypedStringUnion(discriminant, valueOf(literal))) return undefined;
  const owner = propertyName(discriminant) || bareName(discriminant.getText());
  if (PROTOCOL_PROPS.has(owner)) {
    return {
      via: `switch-${owner}`,
      scope: discriminantScope(ctx, discriminant, owner),
    };
  }
  return undefined;
}

function discriminantScope(
  ctx: AnalysisContext,
  discriminant: Node,
  owner: string,
): string {
  const symbol = Node.isPropertyAccessExpression(discriminant)
    ? discriminant.getNameNode().getSymbol()
    : discriminant.getSymbol();
  const declaration = symbol?.getAliasedSymbol()?.getDeclarations()[0]
    ?? symbol?.getDeclarations()[0];
  if (declaration) {
    const container =
      declaration.getFirstAncestorByKind(SyntaxKind.InterfaceDeclaration)?.getName() ??
      declaration.getFirstAncestorByKind(SyntaxKind.ClassDeclaration)?.getName() ??
      declaration.getFirstAncestorByKind(SyntaxKind.TypeAliasDeclaration)?.getName() ??
      owner;
    return `${ctx.relativePath(declaration.getSourceFile())}:${container}`;
  }
  const callable =
    discriminant.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)?.getName() ??
    discriminant.getFirstAncestorByKind(SyntaxKind.MethodDeclaration)?.getName() ??
    "module";
  return `${ctx.relativePath(discriminant.getSourceFile())}:${callable}:${owner}`;
}

function protocolOwner(via: string): string {
  return via.replace(/^(compare-|switch-)/, "") || via;
}

function propertyName(node: Node): string {
  if (Node.isPropertyAccessExpression(node)) return node.getName().toLowerCase();
  if (Node.isElementAccessExpression(node)) {
    const arg = node.getArgumentExpression();
    if (arg && Node.isStringLiteral(arg)) return arg.getLiteralValue().toLowerCase();
  }
  return "";
}

function bareName(text: string): string {
  const match = text.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
  return match?.[1]?.toLowerCase() ?? "";
}

function looksLikeProse(value: string): boolean {
  return /\s/.test(value) || /[.!?]/.test(value);
}

function looksLikePath(value: string): boolean {
  return value.includes("/") || value.includes("\\") || value.startsWith(".");
}

function normalize(value: string): string {
  return value.replace(/[-_\s]/g, "").toLowerCase();
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
