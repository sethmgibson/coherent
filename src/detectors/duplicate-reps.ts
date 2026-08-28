import { Node, type ClassDeclaration } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf, nameStem, type ShapedType } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

export function detectDuplicateRepresentations(ctx: AnalysisContext): Finding[] {
  const shapes: ShapedType[] = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    const relative = ctx.relativePath(file);
    for (const iface of file.getInterfaces()) {
      const properties = iface.getProperties().map((prop) => prop.getName());
      if (properties.length >= 3 && iface.getName()) {
        shapes.push({ name: iface.getName(), file: relative, node: iface, properties });
      }
    }
    for (const cls of file.getClasses()) {
      if (!isDataContainer(cls) || !cls.getName()) continue;
      const properties = cls.getProperties().map((prop) => prop.getName());
      if (properties.length >= 3) {
        shapes.push({ name: cls.getName()!, file: relative, node: cls, properties });
      }
    }
    for (const alias of file.getTypeAliases()) {
      const typeNode = alias.getTypeNode();
      if (!typeNode || !Node.isTypeLiteral(typeNode) || !alias.getName()) continue;
      const properties = typeNode.getMembers().flatMap((member) =>
        Node.isPropertySignature(member) ? [member.getName()] : [],
      );
      if (properties.length >= 3) {
        shapes.push({ name: alias.getName(), file: relative, node: alias, properties });
      }
    }
  }

  const findings: Finding[] = [];
  for (let i = 0; i < shapes.length; i += 1) {
    const left = shapes[i];
    if (!left) continue;
    for (let j = i + 1; j < shapes.length; j += 1) {
      const right = shapes[j];
      if (!right || left.name === right.name && left.file === right.file) continue;
      if (extendsOther(left, right)) continue;
      const shared = left.properties.filter((name) => right.properties.includes(name));
      const onlyLeft = left.properties.filter((name) => !right.properties.includes(name));
      const onlyRight = right.properties.filter((name) => !left.properties.includes(name));
      const larger = Math.max(left.properties.length, right.properties.length);
      const overlap = shared.length / larger;
      if (shared.length < 3 || overlap < 0.6) continue;
      const named = nameStem(left.name) === nameStem(right.name) && nameStem(left.name).length > 1;
      const pair = [left.name, right.name].sort();
      findings.push(
        makeFinding({
          ruleId: "A06",
          identity: `duplicate-rep:${pair.join("+")}`,
          title: "Structurally similar representations",
          severity: "medium",
          confidence: overlap >= 0.8 || named ? "high" : "medium",
          status: "candidate",
          explanation: `${left.name} and ${right.name} share ${shared.length}/${larger} structurally compatible properties. This is not a claim of semantic equivalence.`,
          evidence: {
            summary: `${Math.round(overlap * 100)}% overlap (${shared.length}/${larger} properties).`,
            details: [
              `Shared: ${shared.join(", ")}`,
              `${left.name} unique: ${onlyLeft.join(", ") || "(none)"}`,
              `${right.name} unique: ${onlyRight.join(", ") || "(none)"}`,
              `Locations: ${left.file}, ${right.file}`,
              named ? `Naming stems match ('${nameStem(left.name)}').` : "Names differ.",
            ],
          },
          locations: [
            locationOf(ctx, left.node, left.name),
            locationOf(ctx, right.node, right.name),
          ],
          affectedSymbols: [left.name, right.name],
          ...(named ? { authoritativeConcept: nameStem(left.name) } : {}),
        }),
      );
    }
  }
  return findings;
}

function isDataContainer(cls: ClassDeclaration): boolean {
  const methods = cls.getMethods().filter((method) => {
    const name = method.getName();
    return name !== "constructor" && !name.startsWith("get") && !name.startsWith("set");
  });
  return methods.length === 0 && cls.getProperties().length >= 3;
}

function extendsOther(left: ShapedType, right: ShapedType): boolean {
  for (const pair of [
    [left, right],
    [right, left],
  ] as const) {
    const node = pair[0].node;
    if (Node.isClassDeclaration(node)) {
      const base = node.getBaseClass();
      if (base?.getName() === pair[1].name) return true;
    }
    if (Node.isInterfaceDeclaration(node)) {
      if (node.getExtends().some((ext) => ext.getExpression().getText() === pair[1].name)) {
        return true;
      }
    }
  }
  return false;
}
