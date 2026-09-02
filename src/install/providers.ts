export const PROVIDERS = ["codex", "cursor"] as const;

export type ProviderId = (typeof PROVIDERS)[number];
export type InstallScope = "project" | "global";

const PROVIDER_ALIASES: Record<string, ProviderId> = {
  codex: "codex",
  agents: "codex",
  ".agents": "codex",
  ".codex": "codex",
  cursor: "cursor",
  ".cursor": "cursor",
};

export function parseProviderList(value: string): { providers: ProviderId[]; invalid: string[] } {
  const providers: ProviderId[] = [];
  const invalid: string[] = [];
  for (const raw of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const key = raw.toLowerCase();
    const provider = PROVIDER_ALIASES[key] ?? PROVIDER_ALIASES[`.${key}`];
    if (provider === undefined) {
      invalid.push(raw);
      continue;
    }
    if (!providers.includes(provider)) providers.push(provider);
  }
  return { providers, invalid };
}

export function parseProvidersOption(value: string): ProviderId[] {
  const { providers, invalid } = parseProviderList(value);
  if (invalid.length > 0) {
    throw new Error(`Unknown provider(s): ${invalid.join(", ")}. Use --providers=codex,cursor.`);
  }
  if (providers.length === 0) {
    throw new Error("Choose at least one provider: codex, cursor.");
  }
  return providers;
}

export function normalizeInstallScope(value: string): InstallScope | undefined {
  const key = value.trim().toLowerCase();
  if (key === "p" || key === "project" || key === "local" || key === "repo") return "project";
  if (key === "g" || key === "global" || key === "u" || key === "user" || key === "home") {
    return "global";
  }
  return undefined;
}

export function parseInstallScope(value: string): InstallScope {
  const scope = normalizeInstallScope(value);
  if (scope === undefined) {
    throw new Error(`Unknown install scope: ${value}. Use --scope=project or --scope=global.`);
  }
  return scope;
}

export function formatProviderList(providers: readonly ProviderId[]): string {
  return providers.join(", ");
}
