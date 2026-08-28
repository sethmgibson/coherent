import { Node, SyntaxKind } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { enclosingComments, locationOf } from "../analysis/inspect.js";
import { externalReferences } from "../analysis/references.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const NAME_SIGNAL =
  /(?:^|[^A-Za-z])(legacy|deprecated|compat(?:ibility)?|oldMode|newMode|v1|v2|temporary)/i;
const COMMENT_SIGNAL =
  /(legacy|deprecated|compat(?:ibility)?|fallback|temporary migration|remove (?:when|after|once)|todo:.*remove|obsolete|old path|new path)/i;
const BRANCH_SIGNAL =
  /(legacy|compat|oldMode|newMode|useV1|useV2|oldPath|newPath|isLegacy|enableLegacy)/i;

export function detectStaleCompatibility(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const file of ctx.sourceFiles) {
    const relative = ctx.relativePath(file);
    if (ctx.isTestFile(relative)) continue;
    for (const node of file.getDescendants()) {
      if (Node.isIdentifier(node) && NAME_SIGNAL.test(node.getText())) {
        const parent = node.getParent();
        if (!parent || !isNamedDeclaration(parent)) continue;
        addCompat(ctx, findings, seen, parent, node.getText(), relative, "name", [
          `Identifier '${node.getText()}' matches a compatibility naming signal.`,
          ...callerEvidence(parent),
          ...removalCondition(parent),
        ]);
      }
      const condition = Node.isIfStatement(node)
        ? node.getExpression()
        : Node.isConditionalExpression(node)
          ? node.getCondition()
          : undefined;
      if (condition && BRANCH_SIGNAL.test(condition.getText())) {
        addCompat(ctx, findings, seen, node, condition.getText(), relative, "branch", [
          `Branch condition '${condition.getText()}' looks like an old/new mode check.`,
          ...removalCondition(node),
        ]);
      }
    }
    for (const statement of file.getStatements()) {
      const comments = enclosingComments(statement).filter((text) => COMMENT_SIGNAL.test(text));
      if (comments.length === 0) continue;
      addCompat(ctx, findings, seen, statement, firstSymbol(statement), relative, "comment", [
        "A nearby comment describes compatibility, deprecation, or temporary migration.",
        ...comments.map((text) => text.replace(/\s+/g, " ").trim().slice(0, 160)),
        ...removalCondition(statement),
      ]);
    }
  }
  return findings;
}

function addCompat(
  ctx: AnalysisContext,
  findings: Finding[],
  seen: Set<string>,
  node: Node,
  symbol: string,
  relative: string,
  kind: string,
  details: string[],
): void {
  const identity = `compat:${kind}:${relative}:${symbol.replace(/\s+/g, " ").slice(0, 60)}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  findings.push(
    makeFinding({
      ruleId: "A07",
      identity,
      title: "Likely compatibility path",
      severity: "medium",
      confidence: "medium",
      status: "candidate",
      explanation:
        "Compatibility naming, comments, or old/new branches are present. This does not prove the path is obsolete.",
      evidence: { summary: details[0] ?? "Compatibility signal.", details },
      locations: [locationOf(ctx, node, symbol || undefined)],
      affectedSymbols: symbol ? [symbol] : [],
      changeRisk: "Removing compatibility code requires semantic proof that old callers are gone.",
    }),
  );
}

function isNamedDeclaration(node: Node): boolean {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isVariableDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isPropertyDeclaration(node) ||
    Node.isParameterDeclaration(node)
  );
}

function callerEvidence(node: Node): string[] {
  if (!Node.isReferenceFindable(node)) return [];
  const refs = externalReferences(node).slice(0, 5);
  if (refs.length === 0) return ["No internal callers were found (still not proof of obsolescence)."];
  return [
    `Apparent callers: ${refs
      .map((ref) => `${ref.getSourceFile().getBaseName()}:${ref.getStartLineNumber()}`)
      .join(", ")}`,
  ];
}

function removalCondition(node: Node): string[] {
  const comments = enclosingComments(node);
  const hits = comments.filter((text) =>
    /remove (?:when|after|once)|deprecated|todo:.*remove/i.test(text),
  );
  if (hits.length === 0) return [];
  return [`Apparent removal condition: ${hits[0]?.replace(/\s+/g, " ").trim().slice(0, 160)}`];
}

function firstSymbol(node: Node): string {
  const ident = node.getFirstDescendantByKind(SyntaxKind.Identifier);
  return ident?.getText() ?? node.getKindName();
}
