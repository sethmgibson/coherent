import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  formatProviderList,
  normalizeInstallScope,
  parseProviderList,
  type InstallScope,
  type ProviderId,
} from "./providers.js";

export type AskFn = (question: string) => Promise<string>;

export function isInteractive(flag?: boolean): boolean {
  if (flag !== undefined) return flag;
  return Boolean(stdin.isTTY && stdout.isTTY);
}

export async function ask(question: string): Promise<string> {
  if (!isInteractive()) {
    throw new Error("Refusing to prompt on a non-TTY. Pass --yes or --providers and --scope.");
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function promptProviders(
  detected: readonly ProviderId[],
  askFn: AskFn = ask,
): Promise<ProviderId[]> {
  if (detected.length > 0) {
    const answer = await askFn(
      `Install for detected only (${formatProviderList(detected)}), or customize? [detected] `,
    );
    if (answer === "" || /^(detected|d|1|yes|y)$/i.test(answer)) return [...detected];
  }
  while (true) {
    const answer = await askFn("Providers (comma-separated: codex, cursor): ");
    const parsed = parseProviderList(answer);
    if (parsed.invalid.length > 0) {
      stdout.write(`Unknown provider(s): ${parsed.invalid.join(", ")}\n`);
      continue;
    }
    if (parsed.providers.length > 0) return parsed.providers;
    stdout.write("Choose at least one provider: codex, cursor.\n");
  }
}

export async function promptScope(
  projectRoot: string,
  home: string,
  askFn: AskFn = ask,
): Promise<InstallScope> {
  const answer = await askFn(
    `Install location: project (${projectRoot}) or global (${home})? [project] `,
  );
  if (answer === "") return "project";
  const scope = normalizeInstallScope(answer);
  if (scope === undefined) {
    stdout.write(`Unknown install location "${answer}", using project.\n`);
    return "project";
  }
  return scope;
}
