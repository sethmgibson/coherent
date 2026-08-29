import { Node, type ClassDeclaration } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf, nameStem, type ShapedType } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

interface Overlap {
  left: number;
  right: number;
  shared: string[];
  onlyLeft: string[];
  onlyRight: string[];
  overlap: number;
  named: boolean;
}

export function detectDuplicateRepresentations(ctx: AnalysisContext): Finding[] {
  const shapes = collectShapes(ctx);
  const pairs = overlappingPairs(shapes);
  const findings: Finding[] = [];
  for (const members of clusterPairs(shapes.length, pairs)) {
    const cluster = members.map((index) => shapes[index]!);
    const related = pairs.filter((pair) => members.includes(pair.left) && members.includes(pair.right));
    const names = cluster.map((shape) => shape.name).sort();
    const first = related[0];
    const left = first ? shapes[first.left] : undefined;
    const right = first ? shapes[first.right] : undefined;
    const named = related.some((pair) => pair.named);
    const highOverlap = related.some((pair) => pair.overlap >= 0.8);
    findings.push(
      makeFinding({
        ruleId: "A06",
        identity: `duplicate-rep:${names.join("+")}`,
        title: "Structurally similar representations",
        severity: "medium",
        confidence: highOverlap || named ? "high" : "medium",
        status: "candidate",
        explanation: clusterExplanation(cluster, first, left, right),
        evidence: clusterEvidence(cluster, related, first, left, right),
        locations: cluster.map((shape) => locationOf(ctx, shape.node, shape.name)),
        affectedSymbols: names,
        ...(named && left ? { authoritativeConcept: nameStem(left.name) } : {}),
      }),
    );
  }
  return findings;
}

function collectShapes(ctx: AnalysisContext): ShapedType[] {
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
  return shapes;
}

function overlappingPairs(shapes: ShapedType[]): Overlap[] {
  const pairs: Overlap[] = [];
  for (let i = 0; i < shapes.length; i += 1) {
    const left = shapes[i];
    if (!left) continue;
    for (let j = i + 1; j < shapes.length; j += 1) {
      const right = shapes[j];
      if (!right || (left.name === right.name && left.file === right.file)) continue;
      if (extendsOther(left, right)) continue;
      const shared = left.properties.filter((name) => right.properties.includes(name));
      const larger = Math.max(left.properties.length, right.properties.length);
      const overlap = shared.length / larger;
      if (shared.length < 3 || overlap < 0.6) continue;
      pairs.push({
        left: i,
        right: j,
        shared,
        onlyLeft: left.properties.filter((name) => !right.properties.includes(name)),
        onlyRight: right.properties.filter((name) => !left.properties.includes(name)),
        overlap,
        named: nameStem(left.name) === nameStem(right.name) && nameStem(left.name).length > 1,
      });
    }
  }
  return pairs;
}

function clusterPairs(count: number, pairs: Overlap[]): number[][] {
  const parent = Array.from({ length: count }, (_, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parent[current] !== current) current = parent[current]!;
    return current;
  };
  for (const pair of pairs) {
    const left = find(pair.left);
    const right = find(pair.right);
    if (left !== right) parent[left] = right;
  }
  const groups = new Map<number, number[]>();
  const used = new Set(pairs.flatMap((pair) => [pair.left, pair.right]));
  for (const index of used) {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(index);
    groups.set(root, list);
  }
  return [...groups.values()].filter((group) => group.length >= 2);
}

function clusterExplanation(
  cluster: ShapedType[],
  first: Overlap | undefined,
  left?: ShapedType,
  right?: ShapedType,
): string {
  if (cluster.length === 2 && first && left && right) {
    return `${left.name} and ${right.name} share ${first.shared.length}/${Math.max(left.properties.length, right.properties.length)} structurally compatible properties. This is not a claim of semantic equivalence.`;
  }
  return `${cluster.map((shape) => shape.name).join(", ")} share structurally compatible properties (${cluster.length} representations). This is not a claim of semantic equivalence.`;
}

function clusterEvidence(
  cluster: ShapedType[],
  related: Overlap[],
  first: Overlap | undefined,
  left?: ShapedType,
  right?: ShapedType,
): { summary: string; details: string[] } {
  if (cluster.length === 2 && first && left && right) {
    const larger = Math.max(left.properties.length, right.properties.length);
    return {
      summary: `${Math.round(first.overlap * 100)}% overlap (${first.shared.length}/${larger} properties).`,
      details: [
        `Shared: ${first.shared.join(", ")}`,
        `${left.name} unique: ${first.onlyLeft.join(", ") || "(none)"}`,
        `${right.name} unique: ${first.onlyRight.join(", ") || "(none)"}`,
        `Locations: ${left.file}, ${right.file}`,
        first.named ? `Naming stems match ('${nameStem(left.name)}').` : "Names differ.",
      ],
    };
  }
  return {
    summary: `${cluster.length} structurally similar representations (${related.length} pairwise overlaps).`,
    details: [
      ...cluster.map((shape) => `${shape.name} (${shape.file})`),
      "Pairwise overlaps aggregated to avoid one finding per pair.",
    ],
  };
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
