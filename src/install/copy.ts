import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ADAPTER_OPEN = "<!-- coherent:adapter -->";
export const ADAPTER_CLOSE = "<!-- /coherent:adapter -->";
export const PREVENTION_OPEN = "<!-- coherent:prevention -->";
export const PREVENTION_CLOSE = "<!-- /coherent:prevention -->";

export type CopyAction = "wrote" | "updated" | "unchanged" | "skipped";

export interface CopyResult {
  path: string;
  action: CopyAction;
  reason?: string;
}

export type ManagedKind = "adapter" | "prevention";

export async function writeManagedFile(
  dest: string,
  shipped: string,
  kind: ManagedKind,
): Promise<CopyResult> {
  let existing: string | undefined;
  try {
    existing = await readFile(dest, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing === undefined) {
    await writeText(dest, shipped);
    return { path: dest, action: "wrote" };
  }
  if (existing === shipped) return { path: dest, action: "unchanged" };
  const fences = fencesFor(kind);
  const refreshed = replaceFenced(existing, shipped, fences.open, fences.close);
  if (refreshed !== undefined) {
    if (refreshed === existing) return { path: dest, action: "unchanged" };
    await writeText(dest, refreshed);
    return { path: dest, action: "updated" };
  }
  if (looksLikeStub(existing, kind)) {
    await writeText(dest, shipped);
    return { path: dest, action: "updated" };
  }
  return { path: dest, action: "skipped", reason: "user edits" };
}

export const BACKEND_ALIAS_SKILL = `---
name: backend
description: "Alias for /coherent. Use when the user wants Impeccable-style maintainability work on a backend or large AI-built codebase. Prefer /coherent. Not for frontend visual design."
argument-hint: "[init|refresh|audit|review|baseline|check|plan|fix|doctor|install|update] [target]"
---

${ADAPTER_OPEN}
This is a CLI and skill alias for Coherent. Prefer \`/coherent\`.

Load the canonical skill at \`skills/coherent/SKILL.md\` and the playbook it names. Do not invent a second methodology here.

In chat, \`/backend init\` (and the other \`/backend\` commands) map to the same playbooks as \`/coherent\`.

CLI: \`coherent\` (alias \`backend\`).
${ADAPTER_CLOSE}
`;

function fencesFor(kind: ManagedKind): { open: string; close: string } {
  return kind === "prevention"
    ? { open: PREVENTION_OPEN, close: PREVENTION_CLOSE }
    : { open: ADAPTER_OPEN, close: ADAPTER_CLOSE };
}

function looksLikeStub(existing: string, kind: ManagedKind): boolean {
  if (kind === "prevention") return false;
  const lines = existing.split("\n").length;
  if (lines > 40) return false;
  return (
    existing.includes("skills/coherent/SKILL.md") &&
    (existing.includes("This is a Cursor adapter") ||
      existing.includes("Alias for /coherent") ||
      existing.includes("skill alias for Coherent"))
  );
}

function replaceFenced(
  existing: string,
  shipped: string,
  open: string,
  close: string,
): string | undefined {
  if (!existing.includes(open) || !existing.includes(close)) return undefined;
  const interiors = extractInteriors(shipped, open, close);
  if (interiors.length === 0) return undefined;
  let index = 0;
  return existing.replace(fenceRe(open, close), () => {
    const body = interiors[index] ?? interiors[interiors.length - 1] ?? "";
    index += 1;
    return `${open}\n${body}\n${close}`;
  });
}

function extractInteriors(markdown: string, open: string, close: string): string[] {
  return [...markdown.matchAll(fenceRe(open, close))].map((match) => match[1] ?? "");
}

function fenceRe(open: string, close: string): RegExp {
  return new RegExp(
    `${escapeRegExp(open)}\\n([\\s\\S]*?)\\n${escapeRegExp(close)}`,
    "g",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function writeText(dest: string, contents: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");
}
