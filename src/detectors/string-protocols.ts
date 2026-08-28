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
      const via = discriminantContext(literal);
      if (!via) continue;
      uses.push({ value, file: relative, node: literal, via });
    }
  }

  const byExact = groupBy(uses, (use) => use.value);
  const findings: Finding[] = [];
  const reported = new Set<string>();

  for (const [value, group] of byExact) {
    if (group.length < 2) continue;
    const identity = `string-protocol:${normalize(value)}`;
    reported.add(identity);
    findings.push(protocolFinding(ctx, identity, value, group, []));
  }

  const byNorm = groupBy(uses, (use) => normalize(use.value));
  for (const [key, group] of byNorm) {
    const variants = [...new Set(group.map((use) => use.value))];
    if (variants.length < 2) continue;
    const identity = `string-protocol-variants:${key}`;
    if (reported.has(identity)) continue;
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
  return makeFinding({
    ruleId: "A03",
    identity,
    title: variants.length > 0 ? "String protocol spelling variants" : "Repeated string discriminant",
    severity: "medium",
    confidence: variants.length > 0 ? "medium" : "high",
    status: "candidate",
    explanation:
      variants.length > 0
        ? `Likely spelling or case variants of the same protocol value: ${label}.`
        : `The literal '${label}' is used as a status/type/mode/event discriminant in multiple places.`,
    evidence: {
      summary: `${group.length} discriminant uses of '${label}'.`,
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

function discriminantContext(literal: Node): string | undefined {
  const parent = literal.getParent();
  if (!parent) return undefined;
  if (Node.isCaseClause(parent) || Node.isSwitchStatement(parent)) return "switch-case";
  if (
    Node.isBinaryExpression(parent) &&
    ["===", "!==", "==", "!="].includes(parent.getOperatorToken().getText())
  ) {
    const other = parent.getLeft() === literal ? parent.getRight() : parent.getLeft();
    const text = other.getText();
    if (isTypedStringUnion(other, valueOf(literal))) return undefined;
    if (PROTOCOL_PROPS.has(propertyName(other)) || PROTOCOL_PROPS.has(bareName(text))) {
      return `compare-${propertyName(other) || bareName(text)}`;
    }
    return undefined;
  }
  return undefined;
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
