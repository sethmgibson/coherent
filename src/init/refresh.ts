import { readFile, writeFile } from "node:fs/promises";
import type { Inventory } from "../inventory.js";
import {
  DISCOVERED_CLOSE,
  DISCOVERED_OPEN,
  generateArchitectureMarkdown,
} from "./architecture.js";

const FENCE_RE = new RegExp(
  `${escapeRegExp(DISCOVERED_OPEN)}\\n([\\s\\S]*?)\\n${escapeRegExp(DISCOVERED_CLOSE)}`,
  "g",
);

const DISCOVERED_PREFIX =
  /^(Package manager:|Packages:|Detected frameworks:|Languages:|Approximate size:|Dependencies:|Observed |Declared entrypoints|Probable entrypoint)/;

export function hasDiscoveredFences(markdown: string): boolean {
  FENCE_RE.lastIndex = 0;
  return FENCE_RE.test(markdown);
}

export function extractDiscoveredInteriors(markdown: string): string[] {
  return [...markdown.matchAll(new RegExp(FENCE_RE.source, "g"))].map((match) => match[1] ?? "");
}

/** Compare inventory facts, ignoring formatter wrapping and extra blank lines. */
export function normalizeDiscoveredFacts(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function refreshArchitectureMarkdown(existing: string, inventory: Inventory): string {
  const generated = generateArchitectureMarkdown(inventory);
  if (!existing.trim()) return generated;
  if (hasDiscoveredFences(existing)) return replaceFencedInteriors(existing, generated);
  return migrateUnfenced(existing, generated);
}

export async function refreshArchitectureFile(
  architecturePath: string,
  inventory: Inventory,
): Promise<string> {
  let existing = "";
  try {
    existing = await readFile(architecturePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const next = refreshArchitectureMarkdown(existing, inventory);
  await writeFile(architecturePath, next, "utf8");
  return next;
}

function replaceFencedInteriors(existing: string, generated: string): string {
  const interiors = extractDiscoveredInteriors(generated);
  let index = 0;
  return existing.replace(new RegExp(FENCE_RE.source, "g"), () => {
    const body = interiors[index] ?? "";
    index += 1;
    return `${DISCOVERED_OPEN}\n${body}\n${DISCOVERED_CLOSE}`;
  });
}

/**
 * One-release path for unfenced ARCHITECTURE.md (including leftover `.backend/`).
 * Unknown human-authored `##` sections must survive verbatim. After fences
 * exist, `replaceFencedInteriors` is the only refresh path.
 */
function migrateUnfenced(existing: string, generated: string): string {
  const existingSections = splitSections(existing);
  const generatedSections = splitSections(generated);
  const rebuilt: string[] = [];
  const heading = existing.split("\n")[0]?.startsWith("# ")
    ? (existing.split("\n")[0] ?? "# Architecture")
    : "# Architecture";
  rebuilt.push(heading);
  const intro = generatedSections.get("") ?? generated.split("\n## ")[0]?.split("\n").slice(1).join("\n");
  if (intro?.trim()) rebuilt.push("", intro.trim());

  const emitted = new Set<string>();
  for (const [title, existingBody] of existingSections) {
    if (!title) continue;
    const generatedBody = generatedSections.get(title);
    if (generatedBody !== undefined) {
      rebuilt.push("", `## ${title}`, "", refreshSection(existingBody, generatedBody));
    } else {
      rebuilt.push("", verbatimSection(title, existingBody));
    }
    emitted.add(title);
  }
  for (const [title, generatedBody] of generatedSections) {
    if (!title || emitted.has(title)) continue;
    rebuilt.push("", `## ${title}`, "", refreshSection(undefined, generatedBody));
  }
  if (!rebuilt.join("\n").includes("<!-- coherent:architecture-schema 1 -->")) {
    rebuilt.push("", "<!-- coherent:architecture-schema 1 -->");
  }
  return `${rebuilt.join("\n").trimEnd()}\n`;
}

function verbatimSection(title: string, body: string): string {
  return `## ${title}\n${body}`.replace(/\n+$/g, "");
}

function refreshSection(existingBody: string | undefined, generatedBody: string): string {
  const fences = extractDiscoveredInteriors(generatedBody);
  if (fences.length === 0) {
    return existingBody && /Status: confirmed/.test(existingBody) ? existingBody.trim() : generatedBody.trim();
  }
  if (!existingBody) return generatedBody.trim();
  const addenda = extractSemanticAddenda(existingBody, fences.join("\n"));
  if (!addenda) return generatedBody.trim();
  return `${stripGeneratedPlaceholders(generatedBody).trim()}\n\n${addenda}`.trim();
}

function extractSemanticAddenda(existingSection: string, generatedFencedText: string): string {
  const generatedLines = new Set(
    generatedFencedText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const kept: string[] = [];
  for (const line of existingSection.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) continue;
    if (generatedLines.has(trimmed)) continue;
    if (DISCOVERED_PREFIX.test(trimmed)) continue;
    if (trimmed === "> Status: automatically discovered (packages and frameworks)") continue;
    if (trimmed === "> Status: automatically discovered (package entrypoints and exports)") continue;
    if (trimmed === "> Status: partially discovered") continue;
    if (trimmed.startsWith("> Additional service boundaries")) continue;
    if (trimmed.startsWith("> HTTP, RPC, and CLI")) continue;
    if (trimmed.startsWith("TODO: ")) continue;
    if (trimmed === DISCOVERED_OPEN || trimmed === DISCOVERED_CLOSE) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripGeneratedPlaceholders(generatedBody: string): string {
  return generatedBody
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("TODO: ") && !trimmed.startsWith("> Additional service boundaries");
    })
    .join("\n");
}

function splitSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = markdown.split(/^## /m);
  const preface = parts.shift() ?? "";
  sections.set("", preface.replace(/^# .*\n/, "").trim());
  for (const part of parts) {
    const newline = part.indexOf("\n");
    const title = (newline === -1 ? part : part.slice(0, newline)).trim();
    const body = newline === -1 ? "" : part.slice(newline + 1);
    sections.set(title, body);
  }
  return sections;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
