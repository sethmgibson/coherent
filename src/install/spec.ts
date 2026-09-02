export const GITHUB_PACKAGE_SPEC = "github:sethmgibson/coherent";

/** Public launcher. The unscoped npm name `coherent` is a different package. */
export const PUBLIC_NPX_INSTALL =
  "npx --yes --package github:sethmgibson/coherent -- coherent install";

export const PUBLIC_NPM_EXEC_INSTALL =
  "npm exec --yes --package github:sethmgibson/coherent -- coherent install";

export type SupportedManager = "pnpm" | "npm" | "yarn" | "bun";
export type ProjectManager = SupportedManager | "unknown";

export function resolveInstallManager(manager: ProjectManager): SupportedManager {
  return manager === "unknown" ? "npm" : manager;
}

export function cliInstallArgv(
  manager: ProjectManager,
  spec: string = GITHUB_PACKAGE_SPEC,
): { command: string; args: string[] } {
  switch (resolveInstallManager(manager)) {
    case "npm":
      return { command: "npm", args: ["install", "--save-dev", spec] };
    case "yarn":
      return { command: "yarn", args: ["add", "--dev", spec] };
    case "bun":
      return { command: "bun", args: ["add", "--dev", spec] };
    case "pnpm":
      return { command: "pnpm", args: ["add", "--save-dev", spec] };
  }
}

export function addCliCommand(manager: ProjectManager): string {
  const { command, args } = cliInstallArgv(manager);
  return [command, ...args].join(" ");
}

const SAME_GITHUB_SPEC =
  /^(?:github:)?sethmgibson\/coherent(?:\.git)?(?:[#?].*)?$/i;
const SAME_GIT_HTTPS_SPEC =
  /^git\+https:\/\/github\.com\/sethmgibson\/coherent(?:\.git)?(?:[#?].*)?$/i;

export function isSameCoherentPackageSpec(spec: string): boolean {
  const value = spec.trim();
  return SAME_GITHUB_SPEC.test(value) || SAME_GIT_HTTPS_SPEC.test(value);
}
