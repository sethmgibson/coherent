import { Node, type ClassDeclaration } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf, nameStem, type ShapedType } from "../analysis/inspect.js";
import { describeFields } from "../analysis/shape-fields.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

interface Overlap {
  left: number;
  right: number;
  shared: string[];
  onlyLeft: string[];
  onlyRight: string[];
  overlap: number;
  typeCompatible: number;
  typeMismatches: string[];
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
    const highOverlap = related.some((pair) => pair.overlap >= 0.8 && pair.typeMismatches.length === 0);
    findings.push(
      makeFinding({
        ruleId: "A06",
        identity: `duplicate-rep:${names.join("+")}`,
        title: "Structurally similar representations",
        severity: "medium",
        confidence: highOverlap || named ? "high" : "medium",
        status: "candidate",
        explanation: clusterExplanation(cluster, related, first, left, right),
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
      const fields = describeFields(iface.getProperties());
      if (fields.length >= 3 && iface.getName()) {
        shapes.push({
          name: iface.getName(),
          file: relative,
          node: iface,
          properties: fields.map((field) => field.name),
          fields,
        });
      }
    }
    for (const cls of file.getClasses()) {
      if (!isDataContainer(cls) || !cls.getName()) continue;
      const fields = describeFields(cls.getProperties());
      if (fields.length >= 3) {
        shapes.push({
          name: cls.getName()!,
          file: relative,
          node: cls,
          properties: fields.map((field) => field.name),
          fields,
        });
      }
    }
    for (const alias of file.getTypeAliases()) {
      const typeNode = alias.getTypeNode();
      if (!typeNode || !Node.isTypeLiteral(typeNode) || !alias.getName()) continue;
      const fields = describeFields(typeNode.getMembers());
      if (fields.length >= 3) {
        shapes.push({
          name: alias.getName(),
          file: relative,
          node: alias,
          properties: fields.map((field) => field.name),
          fields,
        });
      }
    }
  }
  return shapes;
}

function overlappingPairs(shapes: ShapedType[]): Overlap[] {
  const pairs: Overlap[] = [];
  const propertiesByShape = shapes.map((shape) => new Set(shape.properties));
  const indexesByProperty = new Map<string, number[]>();
  for (const [index, properties] of propertiesByShape.entries()) {
    for (const property of properties) {
      const indexes = indexesByProperty.get(property) ?? [];
      indexes.push(index);
      indexesByProperty.set(property, indexes);
    }
  }

  const candidates = new Map<string, { left: number; right: number; shared: string[] }>();
  for (const [property, indexes] of indexesByProperty) {
    for (let leftOffset = 0; leftOffset < indexes.length; leftOffset += 1) {
      for (let rightOffset = leftOffset + 1; rightOffset < indexes.length; rightOffset += 1) {
        const left = indexes[leftOffset];
        const right = indexes[rightOffset];
        if (left === undefined || right === undefined) continue;
        const key = `${left}:${right}`;
        const candidate = candidates.get(key) ?? { left, right, shared: [] };
        candidate.shared.push(property);
        candidates.set(key, candidate);
      }
    }
  }

  for (const candidate of candidates.values()) {
    if (candidate.shared.length < 3) continue;
    const left = shapes[candidate.left];
    const right = shapes[candidate.right];
    const leftProperties = propertiesByShape[candidate.left];
    const rightProperties = propertiesByShape[candidate.right];
    if (!left || !right || !leftProperties || !rightProperties) continue;
    if (left.name === right.name && left.file === right.file) continue;
    if (extendsOther(left, right)) continue;
    const larger = Math.max(left.properties.length, right.properties.length);
    const overlap = candidate.shared.length / larger;
    if (overlap < 0.6) continue;
    const typeMismatches = fieldDifferences(left, right, candidate.shared);
    pairs.push({
      left: candidate.left,
      right: candidate.right,
      shared: candidate.shared,
      onlyLeft: left.properties.filter((name) => !rightProperties.has(name)),
      onlyRight: right.properties.filter((name) => !leftProperties.has(name)),
      overlap,
      typeCompatible: candidate.shared.length - typeMismatches.length,
      typeMismatches,
      named: nameStem(left.name) === nameStem(right.name) && nameStem(left.name).length > 1,
    });
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
  related: Overlap[],
  first: Overlap | undefined,
  left?: ShapedType,
  right?: ShapedType,
): string {
  if (cluster.length === 2 && first && left && right) {
    const larger = Math.max(left.properties.length, right.properties.length);
    const typeNote = first.typeMismatches.length > 0
      ? `${first.typeCompatible}/${first.shared.length} shared names have compatible types`
      : `${first.shared.length} shared names have compatible types`;
    return `${left.name} and ${right.name} share ${first.shared.length}/${larger} property names (${typeNote}). This is not a claim of semantic equivalence.`;
  }
  const mismatches = related.flatMap((pair) => pair.typeMismatches);
  const typeNote = mismatches.length > 0
    ? ` Type differences remain among shared names.`
    : "";
  return `${cluster.map((shape) => shape.name).join(", ")} share overlapping property names (${cluster.length} representations).${typeNote} This is not a claim of semantic equivalence.`;
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
      summary: `${Math.round(first.overlap * 100)}% name overlap (${first.shared.length}/${larger} properties); ${first.typeCompatible}/${first.shared.length} type-compatible.`,
      details: [
        `Shared names: ${first.shared.join(", ")}`,
        `${left.name} unique: ${first.onlyLeft.join(", ") || "(none)"}`,
        `${right.name} unique: ${first.onlyRight.join(", ") || "(none)"}`,
        first.typeMismatches.length > 0
          ? `Type differences: ${first.typeMismatches.join("; ")}`
          : "Shared names have matching type, optionality, and nullability.",
        `Locations: ${left.file}, ${right.file}`,
        first.named ? `Naming stems match ('${nameStem(left.name)}').` : "Names differ.",
      ],
    };
  }
  const mismatches = [...new Set(related.flatMap((pair) => pair.typeMismatches))];
  const overlapPct = Math.round(Math.max(...related.map((pair) => pair.overlap)) * 100);
  return {
    summary: `${cluster.length} representations with up to ${overlapPct}% name overlap (${related.length} pairwise overlaps).`,
    details: [
      ...cluster.map((shape) => `${shape.name} (${shape.file})`),
      mismatches.length > 0
        ? `Type differences: ${mismatches.join("; ")}`
        : "Shared names have matching type, optionality, and nullability in each pair.",
      "Pairwise overlaps aggregated to avoid one finding per pair.",
    ],
  };
}

function fieldDifferences(left: ShapedType, right: ShapedType, shared: string[]): string[] {
  const leftByName = new Map(left.fields.map((field) => [field.name, field]));
  const rightByName = new Map(right.fields.map((field) => [field.name, field]));
  const diffs: string[] = [];
  for (const name of shared) {
    const a = leftByName.get(name);
    const b = rightByName.get(name);
    if (!a || !b) continue;
    const parts: string[] = [];
    if (a.typeText !== b.typeText) parts.push(`${a.typeText} vs ${b.typeText}`);
    if (a.optional !== b.optional) parts.push(a.optional ? "optional vs required" : "required vs optional");
    if (a.nullable !== b.nullable) parts.push(a.nullable ? "nullable vs non-null" : "non-null vs nullable");
    if (parts.length > 0) diffs.push(`${name}: ${parts.join(", ")}`);
  }
  return diffs;
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
