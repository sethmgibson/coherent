import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { artifactVersions } from "./config.js";

const execFileAsync = promisify(execFile);

export const WORKFLOW_REVISION = 2;
export const RUNTIME_CAPABILITIES = [
  "canonical-skill-path",
  "doctor-ref",
  "doctor-staged",
  "inspect-terminal-state",
  "review-aware-check",
  "review-queue",
  "self-describing-json",
  "python-ast",
] as const;

export type RuntimeCapability = (typeof RUNTIME_CAPABILITIES)[number];

export interface PortableRuntimeIdentity extends ReturnType<typeof artifactVersions> {
  workflowRevision: number;
  capabilities: RuntimeCapability[];
}

export interface RuntimeIdentity extends PortableRuntimeIdentity {
  packageRoot: string;
  skillPath: string;
  sourceRevision?: string;
  sourceDirty?: boolean;
  declaredRevision?: string;
  diagnostics: string[];
}

export interface RuntimeRequirement {
  workflowRevision: number;
  detectorRevision: number;
  capabilities: string[];
}

export function portableRuntimeIdentity(): PortableRuntimeIdentity {
  return {
    ...artifactVersions(),
    workflowRevision: WORKFLOW_REVISION,
    capabilities: [...RUNTIME_CAPABILITIES],
  };
}

export async function runtimeIdentity(targetRoot?: string): Promise<RuntimeIdentity> {
  const pkg = packageRoot();
  const [source, declared] = await Promise.all([
    packageSourceRevision(pkg),
    targetRoot ? declaredCoherentRevision(resolve(targetRoot)) : undefined,
  ]);
  return {
    ...portableRuntimeIdentity(),
    packageRoot: pkg,
    skillPath: join(pkg, "skills", "coherent", "SKILL.md"),
    ...(source?.revision ? { sourceRevision: source.revision } : {}),
    ...(source ? { sourceDirty: source.dirty } : {}),
    ...(declared?.revision ? { declaredRevision: declared.revision } : {}),
    diagnostics: [...source.diagnostics, ...(declared?.diagnostics ?? [])],
  };
}

export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "skills", "coherent", "SKILL.md"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find the Coherent package (skills/coherent is missing).");
}

export function checkRuntimeCompatibility(
  runtime: PortableRuntimeIdentity,
  requirement: RuntimeRequirement,
): string[] {
  const issues: string[] = [];
  if (runtime.workflowRevision !== requirement.workflowRevision) {
    issues.push(
      `workflow revision ${runtime.workflowRevision} does not match required ${requirement.workflowRevision}`,
    );
  }
  if (runtime.detectorRevision !== requirement.detectorRevision) {
    issues.push(
      `detector revision ${runtime.detectorRevision} does not match required ${requirement.detectorRevision}`,
    );
  }
  const available = new Set<string>(runtime.capabilities);
  for (const capability of requirement.capabilities) {
    if (!available.has(capability)) issues.push(`required capability is missing: ${capability}`);
  }
  return issues;
}

export function renderRuntimeIdentity(runtime: PortableRuntimeIdentity): string {
  return `Runtime: Coherent ${runtime.coherentVersion}  workflow ${runtime.workflowRevision}  detector ${runtime.detectorRevision}  fingerprint ${runtime.fingerprintVersion}  schema ${runtime.schemaVersion}`;
}

export function renderRuntimeDetails(runtime: RuntimeIdentity): string {
  return [
    renderRuntimeIdentity(runtime),
    `Package: ${runtime.packageRoot}`,
    `Canonical skill: ${runtime.skillPath}`,
    ...(runtime.sourceRevision
      ? [`Source revision: ${runtime.sourceRevision}${runtime.sourceDirty ? " (dirty)" : ""}`]
      : []),
    ...(runtime.declaredRevision ? [`Declared lock revision: ${runtime.declaredRevision}`] : []),
    ...runtime.diagnostics.map((diagnostic) => `Diagnostic: ${diagnostic}`),
    `Capabilities: ${runtime.capabilities.join(", ")}`,
  ].join("\n");
}

export function renderRuntimeRequirementMarkdown(): string {
  const runtime = portableRuntimeIdentity();
  const requiredCapabilities = runtime.capabilities.join(" ");
  return `# Runtime compatibility

This packaged skill requires workflow revision **${runtime.workflowRevision}** and detector revision
**${runtime.detectorRevision}**. Before a full cleanup, run the exact CLI that will perform the
work and require every capability used by this playbook:

\`\`\`bash
coherent version . --json --expect-workflow ${runtime.workflowRevision} --expect-detector ${runtime.detectorRevision} --require-capability ${requiredCapabilities}
\`\`\`

If this command is missing or exits non-zero, stop before \`doctor\`, \`inspect\`, baseline,
or review writes. Inspect the reported package path and the target lockfile revision, then
update either the skill or CLI so they describe one workflow. A shared package version alone
is not sufficient evidence when Git dependencies can resolve different commits.

The JSON report exposes \`runtime.skillPath\`. Editor adapters should load that exact file
instead of guessing that the target repository contains a \`skills/coherent\` checkout.

The required capabilities are: ${runtime.capabilities.map((capability) => `\`${capability}\``).join(", ")}.
`;
}

async function packageSourceRevision(
  pkg: string,
): Promise<{ revision?: string; dirty?: boolean; diagnostics: string[] }> {
  try {
    const { stdout: top } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: pkg,
    });
    if (resolve(top.trim()) !== resolve(pkg)) {
      return {
        diagnostics: [
          "The executing package has no standalone Git metadata; use the target lock revision to identify an installed Git dependency.",
        ],
      };
    }
    const [{ stdout }, { stdout: status }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: pkg }),
      execFileAsync("git", ["status", "--porcelain"], { cwd: pkg }),
    ]);
    const revision = revisionFrom(stdout);
    return revision
      ? { revision, dirty: status.length > 0, diagnostics: [] }
      : { diagnostics: ["Git did not return a source revision for the executing package."] };
  } catch (error) {
    return {
      diagnostics: [
        `Could not inspect Git metadata for the executing package: ${errorMessage(error)}`,
      ],
    };
  }
}

async function declaredCoherentRevision(
  root: string,
): Promise<{ revision?: string; diagnostics: string[] }> {
  const names = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"];
  const reads = await Promise.allSettled(
    names.map(async (name) => ({ name, text: await readFile(join(root, name), "utf8") })),
  );
  const diagnostics: string[] = [];
  for (const result of reads) {
    if (result.status === "rejected") {
      const reason: unknown = result.reason;
      if (!isMissingFileError(reason)) throw reason;
      continue;
    }
    const nearbyRevision = revisionNearCoherent(result.value.text);
    const parsed: { revision?: string; diagnostic?: string } = result.value.name === "package-lock.json"
      ? revisionFromPackageLock(result.value.text)
      : nearbyRevision
        ? { revision: nearbyRevision }
        : {};
    if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
    if (parsed.revision) return { revision: parsed.revision, diagnostics };
  }
  return { diagnostics };
}

function revisionFromPackageLock(
  text: string,
): { revision?: string; diagnostic?: string } {
  try {
    const lock = JSON.parse(text) as {
      packages?: Record<string, { resolved?: unknown }>;
      dependencies?: Record<string, { resolved?: unknown }>;
    };
    const resolved = lock.packages?.["node_modules/coherent"]?.resolved
      ?? lock.dependencies?.coherent?.resolved;
    const revision = typeof resolved === "string" ? revisionFrom(resolved) : undefined;
    return revision ? { revision } : {};
  } catch (error) {
    return { diagnostic: `Could not parse package-lock.json: ${errorMessage(error)}` };
  }
}

function revisionNearCoherent(text: string): string | undefined {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!/coherent/i.test(lines[index] ?? "")) continue;
    const window = lines.slice(index, index + 8).join("\n");
    const revision = revisionFrom(window);
    if (revision) return revision;
  }
  return undefined;
}

function revisionFrom(value: string): string | undefined {
  return value.match(/\b[0-9a-f]{40}\b/i)?.[0]?.toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
