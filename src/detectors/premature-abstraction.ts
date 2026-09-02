import type { ClassDeclaration, InterfaceDeclaration, Symbol, Type } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import { locationOf } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const BOUNDARY = /(Repository|Store|Client|Gateway|Port|Adapter|ReadModel|Persistence|Reader|Writer|Expirer)$/;

export function detectPrematureAbstraction(ctx: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  const classes = ctx.sourceFiles.flatMap((file) =>
    file.getClasses().map((cls) => ({ cls, file: ctx.relativePath(file) })),
  );

  for (const file of ctx.sourceFiles) {
    if (ctx.isTestFile(ctx.relativePath(file))) continue;
    const relative = ctx.relativePath(file);
    for (const iface of file.getInterfaces()) {
      const name = iface.getName();
      if (!name) continue;
      if (BOUNDARY.test(name)) continue;
      const impls = classes.filter(({ cls, file: implFile }) => {
        if (ctx.isTestFile(implFile)) return false;
        return implementsSymbol(cls, iface);
      });
      if (impls.length !== 1) continue;
      const impl = impls[0];
      if (!impl) continue;
      findings.push(singleImplFinding(ctx, iface, name, relative, impl.cls, impl.file, "interface"));
    }
    for (const cls of file.getClasses()) {
      if (!cls.isAbstract() || !cls.getName()) continue;
      const name = cls.getName()!;
      const subclasses = classes.filter(({ cls: other, file: implFile }) => {
        if (ctx.isTestFile(implFile)) return false;
        return extendsDeclaration(other, cls);
      });
      if (subclasses.length !== 1) continue;
      const only = subclasses[0];
      if (!only) continue;
      findings.push(singleImplFinding(ctx, cls, name, relative, only.cls, only.file, "abstract-class"));
    }
  }
  return findings;
}

function implementsSymbol(cls: ClassDeclaration, iface: InterfaceDeclaration): boolean {
  const target = declarationSymbol(iface.getSymbol());
  if (!target) return false;
  return cls.getImplements().some((impl) => sameSymbol(typeSymbol(impl.getType()), target));
}

function extendsDeclaration(sub: ClassDeclaration, base: ClassDeclaration): boolean {
  const resolved = sub.getBaseClass();
  if (resolved === base) return true;
  const target = declarationSymbol(base.getSymbol());
  return Boolean(target && resolved && sameSymbol(resolved.getSymbol(), target));
}

function typeSymbol(type: Type): Symbol | undefined {
  return declarationSymbol(type.getAliasSymbol() ?? type.getSymbol());
}

function declarationSymbol(symbol: Symbol | undefined): Symbol | undefined {
  if (!symbol) return undefined;
  return symbol.getAliasedSymbol() ?? symbol;
}

function sameSymbol(left: Symbol | undefined, right: Symbol): boolean {
  if (!left) return false;
  if (left === right) return true;
  const leftName = left.getFullyQualifiedName();
  const rightName = right.getFullyQualifiedName();
  return leftName.length > 0 && leftName === rightName;
}

function singleImplFinding(
  ctx: AnalysisContext,
  abstraction: InterfaceDeclaration | ClassDeclaration,
  name: string,
  file: string,
  impl: ClassDeclaration,
  implFile: string,
  kind: "interface" | "abstract-class",
): Finding {
  const implName = impl.getName() ?? "(anonymous)";
  const boundary = BOUNDARY.test(name);
  const details = [
    `${kind === "interface" ? "Interface" : "Abstract class"} '${name}' in ${file} has one known production implementation: ${implName} (${implFile}).`,
    boundary
      ? "Name looks like an I/O or persistence boundary; a single adapter can still be intentional."
      : "No second production implementation was found.",
    "Hybrid signal only — do not collapse without semantic review.",
  ];
  return makeFinding({
    ruleId: "B03",
    identity: `single-impl:${file}:${name}`,
    title: "Single-implementation abstraction",
    severity: "medium",
    confidence: boundary ? "low" : "medium",
    status: "candidate",
    detectionMode: "hybrid",
    explanation: `'${name}' in ${file} appears to have one concrete implementation. That is a candidate for premature abstraction, not proof.`,
    evidence: { summary: details[0] ?? name, details },
    locations: [
      locationOf(ctx, abstraction, name),
      locationOf(ctx, impl, implName),
    ],
    affectedSymbols: [name, implName],
  });
}
