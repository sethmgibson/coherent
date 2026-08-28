import type { ClassDeclaration, InterfaceDeclaration } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const BOUNDARY = /(Repository|Store|Client|Gateway|Port|Adapter)$/;

export function detectPrematureAbstraction(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  const classes = ctx.sourceFiles.flatMap((file) =>
    file.getClasses().map((cls) => ({ cls, file: ctx.relativePath(file) })),
  );

  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    for (const iface of file.getInterfaces()) {
      const name = iface.getName();
      if (!name) continue;
      const impls = classes.filter(({ cls, file: implFile }) => {
        if (ctx.isTestFile(implFile)) return false;
        return cls.getImplements().some((impl) => impl.getExpression().getText() === name);
      });
      if (impls.length !== 1) continue;
      const impl = impls[0];
      if (!impl) continue;
      findings.push(singleImplFinding(ctx, iface, name, impl.cls, impl.file, "interface"));
    }
    for (const cls of file.getClasses()) {
      if (!cls.isAbstract() || !cls.getName()) continue;
      const name = cls.getName()!;
      const subclasses = classes.filter(({ cls: other, file: implFile }) => {
        if (ctx.isTestFile(implFile)) return false;
        return other.getBaseClass()?.getName() === name;
      });
      if (subclasses.length !== 1) continue;
      const only = subclasses[0];
      if (!only) continue;
      findings.push(singleImplFinding(ctx, cls, name, only.cls, only.file, "abstract-class"));
    }
  }
  return findings;
}

function singleImplFinding(
  ctx: AnalysisContext,
  abstraction: InterfaceDeclaration | ClassDeclaration,
  name: string,
  impl: ClassDeclaration,
  implFile: string,
  kind: "interface" | "abstract-class",
): Finding {
  const implName = impl.getName() ?? "(anonymous)";
  const boundary = BOUNDARY.test(name);
  const details = [
    `${kind === "interface" ? "Interface" : "Abstract class"} '${name}' has one known production implementation: ${implName} (${implFile}).`,
    boundary
      ? "Name looks like an I/O or persistence boundary; a single adapter can still be intentional."
      : "No second production implementation was found.",
    "Hybrid signal only — do not collapse without semantic review.",
  ];
  return makeFinding({
    ruleId: "B03",
    identity: `single-impl:${name}`,
    title: "Single-implementation abstraction",
    severity: "medium",
    confidence: boundary ? "low" : "medium",
    status: "candidate",
    detectionMode: "hybrid",
    explanation: `'${name}' appears to have one concrete implementation. That is a candidate for premature abstraction, not proof.`,
    evidence: { summary: details[0] ?? name, details },
    locations: [
      locationOf(ctx, abstraction, name),
      locationOf(ctx, impl, implName),
    ],
    affectedSymbols: [name, implName],
  });
}
