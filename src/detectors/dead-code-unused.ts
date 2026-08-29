import { Node } from "ts-morph";
import type { AnalysisContext } from "../analysis/context.js";
import {
  hasFrameworkDecorator,
  isCliSurface,
  isJobSurface,
  locationOf,
  looksLikeFrameworkName,
} from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

export function classifyUnused(
  ctx: AnalysisContext,
  node: Node,
  name: string,
  relative: string,
  dynamicFiles: Set<string>,
  kind: string,
  exported: boolean,
  decorated = hasFrameworkDecorator(node),
): Finding {
  const reasons: string[] = [`No static references to ${kind} '${name}' were found.`];
  const indirect = indirectReachability(name, relative, exported, decorated, dynamicFiles, ctx);
  if (indirect.length > 0) {
    reasons.push(...indirect);
    return unusedFinding(ctx, node, name, relative, "candidate", "medium", reasons, kind);
  }
  reasons.push("Not exported, decorated, or registered as a framework/CLI/public surface.");
  return unusedFinding(ctx, node, name, relative, "confirmed", "high", reasons, kind);
}

export function unusedFinding(
  ctx: AnalysisContext,
  node: Node,
  name: string,
  relative: string,
  status: "confirmed" | "candidate",
  confidence: "high" | "medium",
  details: string[],
  kind = "declaration",
): Finding {
  return makeFinding({
    ruleId: "A08",
    identity: `${status === "confirmed" ? "unused" : "unused-candidate"}:${relative}:${name}`,
    title: status === "confirmed" ? "Unused internal declaration" : "Possibly unused export or registration",
    severity: status === "confirmed" ? "high" : "medium",
    confidence,
    status,
    explanation:
      status === "confirmed"
        ? `${kind} '${name}' has no reachable static use.`
        : `${kind} '${name}' has no internal callers, but may be reachable indirectly.`,
    evidence: { summary: details[0] ?? "No static references.", details },
    locations: [locationOf(ctx, node, name)],
    affectedSymbols: [name],
    changeRisk:
      status === "confirmed"
        ? "Low if no reflection or generated callers exist."
        : "Do not delete without confirming public, DI, CLI, or dynamic reachability.",
  });
}

function indirectReachability(
  name: string,
  relative: string,
  exported: boolean,
  decorated: boolean,
  dynamicFiles: Set<string>,
  ctx: AnalysisContext,
): string[] {
  const reasons: string[] = [];
  if (decorated) reasons.push("Has a framework decorator; may be constructed by DI or reflection.");
  if (looksLikeFrameworkName(name)) {
    reasons.push("Name matches a framework role (service, controller, handler, job, ...).");
  }
  if (exported && ctx.isPublicModule(relative)) {
    reasons.push("Exported from a package entrypoint, bin, or public export.");
  } else if (exported) {
    reasons.push("Exported; no internal callers. May still be a public or future API.");
  }
  if (exported && isCliSurface(relative)) {
    reasons.push("Exported from a CLI command surface.");
  }
  if (exported && isJobSurface(relative)) {
    reasons.push("Exported from a job/worker/queue surface.");
  }
  if (dynamicFiles.has(relative) && exported) {
    reasons.push("Module is loaded via dynamic import(); exports are not treated as dead.");
  }
  return reasons;
}
