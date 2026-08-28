import { Node, SyntaxKind } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf, type ShapedType } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const CONTEXT_NAME = /(context|state|input|options|payload|bag|request|session)/i;

type Bag = ShapedType;

export function detectContextExplosion(ctx: AnalysisContext): Finding[] {
  const bags: Bag[] = [];
  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    const relative = ctx.relativePath(file);
    for (const iface of file.getInterfaces()) {
      maybeBag(bags, iface.getName(), relative, iface.getProperties().map((prop) => prop.getName()), iface);
    }
    for (const cls of file.getClasses()) {
      maybeBag(bags, cls.getName(), relative, cls.getProperties().map((prop) => prop.getName()), cls);
    }
    for (const alias of file.getTypeAliases()) {
      const typeNode = alias.getTypeNode();
      if (!typeNode || !Node.isTypeLiteral(typeNode)) continue;
      const props = typeNode.getMembers().flatMap((member) =>
        Node.isPropertySignature(member) ? [member.getName()] : [],
      );
      maybeBag(bags, alias.getName(), relative, props, alias);
    }
  }

  const findings: Finding[] = [];
  for (const bag of bags) {
    const consumers = findConsumers(ctx, bag);
    const tiny = consumers.filter((consumer) => consumer.used.length > 0 && consumer.used.length <= 2);
    const mutations = consumers.filter((consumer) => consumer.mutates);
    findings.push(
      makeFinding({
        ruleId: "C04",
        identity: `context-object:${bag.file}:${bag.name}`,
        title: "Large context / options object",
        severity: bag.properties.length >= 12 ? "high" : "medium",
        confidence: "medium",
        status: "candidate",
        explanation: `'${bag.name}' has ${bag.properties.length} properties and is passed broadly. Hybrid signal — not every large object is a problem.`,
        evidence: {
          summary: `${bag.properties.length} properties; ${consumers.length} consumer(s).`,
          details: [
            `Properties: ${bag.properties.join(", ")}`,
            ...consumers.map(
              (consumer) =>
                `${consumer.name} uses ${consumer.used.length}/${bag.properties.length}` +
                (consumer.used.length ? ` (${consumer.used.join(", ")})` : " (none observed)") +
                (consumer.mutates ? "; mutates the object" : ""),
            ),
            tiny.length > 0
              ? `${tiny.length} consumer(s) use only a tiny subset.`
              : "No tiny-subset consumers observed.",
            mutations.length > 0 ? `${mutations.length} consumer(s) mutate the object.` : "No mutations observed.",
          ],
        },
        locations: [locationOf(ctx, bag.node, bag.name), ...consumers.map((c) => c.location)],
        affectedSymbols: [bag.name, ...consumers.map((c) => c.name)],
      }),
    );
  }
  return findings;
}

function maybeBag(
  bags: Bag[],
  name: string | undefined,
  file: string,
  properties: string[],
  node: Bag["node"],
): void {
  if (!name) return;
  if (CONTEXT_NAME.test(name) && properties.length >= 8) {
    bags.push({ name, file, properties, node });
  }
}

function findConsumers(ctx: AnalysisContext, bag: Bag) {
  const consumers: {
    name: string;
    used: string[];
    mutates: boolean;
    location: ReturnType<typeof locationOf>;
  }[] = [];
  for (const file of ctx.sourceFiles) {
    const functions = [...file.getFunctions(), ...file.getClasses().flatMap((cls) => cls.getMethods())];
    for (const fn of functions) {
      const param = fn.getParameters().find((item) => {
        const typeText = item.getTypeNode()?.getText() ?? item.getType().getText();
        return typeText === bag.name || typeText.endsWith(`.${bag.name}`);
      });
      if (!param) continue;
      const paramName = param.getName();
      const used = new Set<string>();
      let mutates = false;
      const body = fn.getBody();
      if (body) {
        for (const access of body.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
          if (access.getExpression().getText() !== paramName) continue;
          const prop = access.getName();
          if (bag.properties.includes(prop)) used.add(prop);
          const parent = access.getParent();
          if (parent && Node.isBinaryExpression(parent) && parent.getLeft() === access) mutates = true;
        }
      }
      consumers.push({
        name: fn.getName() ?? paramName,
        used: [...used],
        mutates,
        location: locationOf(ctx, fn, fn.getName() ?? paramName),
      });
    }
  }
  return consumers;
}
