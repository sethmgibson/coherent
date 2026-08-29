import { Node, SyntaxKind, type FunctionDeclaration, type MethodDeclaration } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

export function detectBooleanExplosion(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  const flagSets: { name: string; flags: string[]; file: string }[] = [];

  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    const relative = ctx.relativePath(file);
    const functions = [
      ...file.getFunctions(),
      ...file.getClasses().flatMap((cls) => cls.getMethods()),
    ];
    for (const fn of functions) {
      const name = fn.getName();
      if (!name) continue;
      const boolParams = fn
        .getParameters()
        .filter((param) => param.getType().getText() === "boolean" || param.getTypeNode()?.getText() === "boolean")
        .map((param) => param.getName());
      const branched = booleanBranches(fn);
      flagSets.push({ name, flags: [...new Set([...boolParams, ...branched])], file: relative });

      if (boolParams.length >= 3) {
        findings.push(
          flagFinding(ctx, fn, name, relative, boolParams, branched, "boolean-params"),
        );
        continue;
      }
      if (boolParams.length >= 2 && branched.length >= 3) {
        findings.push(
          flagFinding(ctx, fn, name, relative, boolParams, branched, "boolean-branching"),
        );
      }
    }
  }

  const combinations = new Map<string, string[]>();
  for (const entry of flagSets) {
    if (entry.flags.length < 3) continue;
    const key = [...entry.flags].sort().join("+");
    const list = combinations.get(key) ?? [];
    list.push(`${entry.name} (${entry.file})`);
    combinations.set(key, list);
  }
  for (const [key, users] of combinations) {
    if (users.length < 2) continue;
    findings.push(
      makeFinding({
        ruleId: "C03",
        identity: `bool-combo:${key}`,
        title: "Repeated boolean flag combination",
        severity: "medium",
        confidence: "medium",
        status: "candidate",
        explanation:
          "The same set of boolean flags appears in multiple functions, which may hide a state model.",
        evidence: {
          summary: `Flags ${key} appear together in ${users.length} functions.`,
          details: users,
        },
        locations: [],
        affectedSymbols: key.split("+"),
      }),
    );
  }
  return findings;
}

function flagFinding(
  ctx: AnalysisContext,
  fn: FunctionDeclaration | MethodDeclaration,
  name: string,
  relative: string,
  boolParams: string[],
  branched: string[],
  kind: string,
): Finding {
  return makeFinding({
    ruleId: "C03",
    identity: `${kind}:${relative}:${name}`,
    title: "Boolean parameter / branch explosion",
    severity: boolParams.length >= 4 ? "high" : "medium",
    confidence: "high",
    status: "candidate",
    explanation: `'${name}' selects behavior with several booleans. Two booleans alone are not enough to report.`,
    evidence: {
      summary: `${boolParams.length} boolean parameters; branches on ${branched.join(", ") || "those flags"}.`,
      details: [
        `Boolean parameters: ${boolParams.join(", ")}`,
        branched.length > 0 ? `Boolean branches: ${branched.join(", ")}` : "No additional boolean identifiers branched.",
      ],
    },
    locations: [locationOf(ctx, fn, name)],
    affectedSymbols: [name, ...boolParams],
  });
}

function booleanBranches(fn: FunctionDeclaration | MethodDeclaration): string[] {
  const names = new Set<string>();
  const body = fn.getBody();
  if (!body) return [];
  for (const iff of body.getDescendantsOfKind(SyntaxKind.IfStatement)) {
    collectBooleanIdents(iff.getExpression(), names);
  }
  for (const cond of body.getDescendantsOfKind(SyntaxKind.ConditionalExpression)) {
    collectBooleanIdents(cond.getCondition(), names);
  }
  return [...names];
}

const NOT_A_FLAG = new Set([
  "undefined",
  "null",
  "NaN",
  "true",
  "false",
  "typeof",
  "instanceof",
  "length",
  "size",
  "count",
  "amount",
  "value",
  "name",
  "type",
  "id",
  "index",
  "key",
  "error",
  "message",
  "status",
  "code",
  "result",
  "data",
]);

const FLAG_NAME =
  /^(is|has|can|should|need|allow|enable|disable|show|hide|skip|force|include|exclude|use|with|require)[A-Z0-9_]|Flag$|Enabled$|Disabled$|Visible$|Hidden$|Active$|Required$|Optional$|^(ok|debug|verbose|silent|dryRun|enabled|disabled|visible|hidden|active|inactive|notify|rush)$/i;

function collectBooleanIdents(node: Node, names: Set<string>): void {
  if (Node.isParenthesizedExpression(node)) {
    collectBooleanIdents(node.getExpression(), names);
    return;
  }
  if (Node.isPrefixUnaryExpression(node)) {
    collectBooleanIdents(node.getOperand(), names);
    return;
  }
  if (Node.isBinaryExpression(node)) {
    collectBooleanIdents(node.getLeft(), names);
    collectBooleanIdents(node.getRight(), names);
    return;
  }
  const name = flagName(node);
  if (name) names.add(name);
}

function flagName(node: Node): string | undefined {
  const name = Node.isIdentifier(node)
    ? node.getText()
    : Node.isPropertyAccessExpression(node)
      ? node.getName()
      : undefined;
  if (!name || NOT_A_FLAG.has(name)) return undefined;
  if (node.getType().getText() === "boolean") return name;
  return FLAG_NAME.test(name) ? name : undefined;
}
