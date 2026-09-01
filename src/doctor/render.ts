import type { DoctorResult } from "./types.js";
import { renderRuntimeDetails } from "../runtime.js";

export function renderDoctor(result: DoctorResult): string {
  const lines = [
    "Coherent doctor",
    renderRuntimeDetails(result.runtime),
    renderTarget(result),
    "",
  ];
  if (result.ok) {
    lines.push("No issues. Decisions, baseline (when present), and discovered architecture look consistent.");
    return `${lines.join("\n")}\n`;
  }
  lines.push(`${result.issues.length} issue(s):`);
  for (const issue of result.issues) {
    lines.push(`  [${issue.code}] ${issue.message}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderTarget(result: DoctorResult): string {
  const { target } = result;
  const label = target.kind === "ref" ? `ref ${target.ref}` : target.kind;
  const git = target.gitHead ? ` at ${target.gitHead}` : "";
  const dirty = target.kind === "worktree" && target.worktreeDirty
    ? " (dirty; this does not validate the staged or committed artifact)"
    : "";
  return `Validation target: ${label}${git}${dirty}`;
}
