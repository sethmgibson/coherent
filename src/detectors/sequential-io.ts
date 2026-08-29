import { Node, SyntaxKind, type VariableDeclaration } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

interface AwaitDescription {
  names: string[];
  text: string;
  uses: Set<string>;
  callee?: string;
  resource?: string;
}

export function detectSequentialIo(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    const relative = ctx.relativePath(file);
    for (const fn of [...file.getFunctions(), ...file.getClasses().flatMap((cls) => cls.getMethods())]) {
      const name = fn.getName() ?? "anonymous";
      const body = fn.getBody();
      if (!body || !Node.isBlock(body)) continue;
      reportAwaitInLoops(ctx, findings, relative, name, fn, body);
      reportIndependentAwaits(ctx, findings, relative, name, fn, body);
    }
  }
  return findings;
}

function reportAwaitInLoops(
  ctx: AnalysisContext,
  findings: Finding[],
  relative: string,
  name: string,
  fn: Node,
  body: Node,
): void {
  const loopKinds = [
    SyntaxKind.ForStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.WhileStatement,
  ];
  const awaits = body.getDescendantsOfKind(SyntaxKind.AwaitExpression);
  const inLoop = awaits.filter((node) =>
    loopKinds.some((kind) => node.getFirstAncestorByKind(kind) !== undefined),
  );
  if (inLoop.length === 0) return;
  findings.push(
    makeFinding({
      ruleId: "E05",
      identity: `await-in-loop:${relative}:${name}`,
      title: "Await inside a loop",
      severity: "medium",
      confidence: "high",
      status: "candidate",
      explanation: `'${name}' awaits inside a loop. Reported separately from sequential independent awaits.`,
      evidence: {
        summary: `${inLoop.length} await(s) inside a loop.`,
        details: inLoop.slice(0, 5).map((node) => node.getText().replace(/\s+/g, " ").slice(0, 80)),
      },
      locations: [locationOf(ctx, fn, name)],
      affectedSymbols: [name],
    }),
  );
}

function reportIndependentAwaits(
  ctx: AnalysisContext,
  findings: Finding[],
  relative: string,
  name: string,
  fn: Node,
  body: Node,
): void {
  const statements = Node.isBlock(body) ? body.getStatements() : [];
  const sequence: AwaitDescription[] = [];
  for (const statement of statements) {
    if (statement.getFirstDescendantByKind(SyntaxKind.AwaitExpression) === undefined) {
      if (sequence.length >= 2) flush(ctx, findings, relative, name, fn, sequence);
      sequence.length = 0;
      continue;
    }
    if (inLoop(statement) || isControlFlowStatement(statement)) {
      if (sequence.length >= 2) flush(ctx, findings, relative, name, fn, sequence);
      sequence.length = 0;
      continue;
    }
    sequence.push(describeAwaitStatement(statement));
  }
  if (sequence.length >= 2) flush(ctx, findings, relative, name, fn, sequence);
}

function flush(
  ctx: AnalysisContext,
  findings: Finding[],
  relative: string,
  name: string,
  fn: Node,
  sequence: AwaitDescription[],
): void {
  const produced = new Set<string>();
  const relations: string[] = [];
  let independent = 0;
  let dependent = 0;
  for (const [index, item] of sequence.entries()) {
    const usesPrior = [...item.uses].some((ident) => produced.has(ident));
    const effectOrdered = index > 0 && requiredEffectOrder(sequence[index - 1]!, item);
    if (usesPrior || effectOrdered) {
      dependent += 1;
      relations.push(`${item.text} — ${effectOrdered ? "effect ordered" : "clearly dependent"}`);
    } else {
      independent += 1;
      relations.push(`${item.text} — likely independent`);
    }
    for (const producedName of item.names) produced.add(producedName);
  }
  if (independent < 2 && dependent === sequence.length - 1) return;
  findings.push(
    makeFinding({
      ruleId: "E05",
      identity: `seq-await:${relative}:${name}`,
      title: "Sequential awaits",
      severity: "medium",
      confidence: independent >= 2 ? "medium" : "low",
      status: "candidate",
      explanation: `'${name}' has sequential awaits. Independence is inferred from identifier use only.`,
      evidence: {
        summary: `${independent} likely independent, ${dependent} clearly dependent.`,
        details: relations,
      },
      locations: [locationOf(ctx, fn, name)],
      affectedSymbols: [name],
    }),
  );
}

function describeAwaitStatement(statement: Node): AwaitDescription {
  const names: string[] = [];
  if (Node.isVariableStatement(statement)) {
    for (const decl of statement.getDeclarations()) names.push(...bindingNames(decl));
  }
  const awaitExpr = statement.getFirstDescendantByKind(SyntaxKind.AwaitExpression);
  const awaited = awaitExpr?.getExpression();
  const call = awaited && Node.isCallExpression(awaited) ? awaited : undefined;
  const uses = new Set<string>();
  if (awaitExpr) {
    for (const ident of awaitExpr.getDescendantsOfKind(SyntaxKind.Identifier)) {
      uses.add(ident.getText());
    }
  }
  for (const name of names) uses.delete(name);
  const callee = call?.getExpression().getText();
  const resource = call?.getArguments()[0]?.getText();
  return {
    names,
    text: statement.getText().replace(/\s+/g, " ").trim().slice(0, 80),
    uses,
    ...(callee ? { callee } : {}),
    ...(resource ? { resource } : {}),
  };
}

function requiredEffectOrder(left: AwaitDescription, right: AwaitDescription): boolean {
  const leftCall = simpleCallName(left.callee);
  const rightCall = simpleCallName(right.callee);
  if (leftCall === "mkdir" && rightCall === "writeFile" && left.resource && right.resource) {
    return normalize(left.resource) === `dirname(${normalize(right.resource)})`;
  }
  if (leftCall === "writeFile" && rightCall === "chmod") {
    return normalize(left.resource) === normalize(right.resource);
  }
  return false;
}

function simpleCallName(callee: string | undefined): string | undefined {
  return callee?.match(/([A-Za-z_$][\w$]*)$/)?.[1];
}

function normalize(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "");
}

function isControlFlowStatement(node: Node): boolean {
  return (
    Node.isIfStatement(node) ||
    Node.isTryStatement(node) ||
    Node.isSwitchStatement(node) ||
    Node.isForStatement(node) ||
    Node.isForOfStatement(node) ||
    Node.isForInStatement(node) ||
    Node.isWhileStatement(node)
  );
}

function bindingNames(decl: VariableDeclaration): string[] {
  const name = decl.getNameNode();
  if (Node.isIdentifier(name)) return [name.getText()];
  return name.getDescendantsOfKind(SyntaxKind.Identifier).map((ident) => ident.getText());
}

function inLoop(node: Node): boolean {
  return (
    node.getFirstAncestorByKind(SyntaxKind.ForStatement) !== undefined ||
    node.getFirstAncestorByKind(SyntaxKind.ForOfStatement) !== undefined ||
    node.getFirstAncestorByKind(SyntaxKind.ForInStatement) !== undefined ||
    node.getFirstAncestorByKind(SyntaxKind.WhileStatement) !== undefined
  );
}
