import { accessSync, constants, existsSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import type { ProviderId } from "./providers.js";

export type DetectionScope = "project" | "global";
export type DetectionReason = "project harness folder" | "user harness folder" | "CLI on PATH";

export interface HarnessDetection {
  provider: ProviderId;
  scope: DetectionScope;
  foundPath: string;
  reason: DetectionReason;
}

const PROJECT_HINTS: { folder: string; provider: ProviderId }[] = [
  { folder: ".agents", provider: "codex" },
  { folder: ".codex", provider: "codex" },
  { folder: ".cursor", provider: "cursor" },
];

const GLOBAL_HINTS: { folder: string; provider: ProviderId }[] = [
  { folder: ".codex", provider: "codex" },
  { folder: ".agents", provider: "codex" },
  { folder: ".cursor", provider: "cursor" },
];

const PATH_HINTS: { command: string; provider: ProviderId }[] = [
  { command: "codex", provider: "codex" },
  { command: "cursor", provider: "cursor" },
];

export const DEFAULT_PROVIDERS: ProviderId[] = ["codex", "cursor"];

export function collectInstallDetections(
  root: string,
  home: string,
  pathEnv = process.env.PATH ?? "",
): HarnessDetection[] {
  const detections: HarnessDetection[] = [];
  for (const hint of PROJECT_HINTS) {
    const foundPath = join(root, hint.folder);
    if (!existsSync(foundPath)) continue;
    detections.push({
      provider: hint.provider,
      scope: "project",
      foundPath,
      reason: "project harness folder",
    });
  }
  for (const hint of GLOBAL_HINTS) {
    const foundPath = join(home, hint.folder);
    if (!existsSync(foundPath)) continue;
    detections.push({
      provider: hint.provider,
      scope: "global",
      foundPath,
      reason: "user harness folder",
    });
  }
  for (const hint of PATH_HINTS) {
    const foundPath = commandOnPath(hint.command, pathEnv);
    if (foundPath === undefined) continue;
    detections.push({
      provider: hint.provider,
      scope: "global",
      foundPath,
      reason: "CLI on PATH",
    });
  }
  return detections;
}

export function defaultDetectedProviders(detections: readonly HarnessDetection[]): ProviderId[] {
  const project = uniqueProviders(detections.filter((detection) => detection.scope === "project"));
  if (project.length > 0) return project;
  return uniqueProviders(detections.filter((detection) => detection.scope === "global"));
}

export function providersOrDefault(providers: readonly ProviderId[]): ProviderId[] {
  return providers.length > 0 ? [...providers] : [...DEFAULT_PROVIDERS];
}

export function uniqueProviders(detections: readonly HarnessDetection[]): ProviderId[] {
  const providers: ProviderId[] = [];
  for (const detection of detections) {
    if (!providers.includes(detection.provider)) providers.push(detection.provider);
  }
  return providers;
}

export function formatInstallDetectionLines(
  projectRoot: string,
  detections: readonly HarnessDetection[],
  home: string,
): string[] {
  if (detections.length === 0) {
    return [`No harnesses detected under ${formatPathForDisplay(projectRoot, home)} or ${formatPathForDisplay(home, home)}.`];
  }
  const names = detections.map((detection) => detection.provider);
  const width = Math.max(...names.map((name) => name.length));
  return [
    "Detected harnesses:",
    ...detections.map((detection, index) => {
      const name = (names[index] ?? detection.provider).padEnd(width);
      return `  ${name}  ${formatPathForDisplay(detection.foundPath, home)}`;
    }),
  ];
}

export function formatPathForDisplay(path: string, home: string): string {
  if (path === home) return "~";
  if (path.startsWith(`${home}/`) || path.startsWith(`${home}\\`)) {
    return `~/${path.slice(home.length + 1).replaceAll("\\", "/")}`;
  }
  return path;
}

export function commandOnPath(command: string, pathEnv: string): string | undefined {
  const candidates = process.platform === "win32"
    ? [`${command}.exe`, `${command}.cmd`, `${command}.bat`, command]
    : [command];
  for (const directory of pathEnv.split(delimiter)) {
    if (!directory) continue;
    for (const candidate of candidates) {
      const path = resolve(directory, candidate);
      try {
        if (statSync(path).isFile()) {
          accessSync(path, constants.X_OK);
          return path;
        }
      } catch {
        // not a usable executable
      }
    }
  }
  return undefined;
}

