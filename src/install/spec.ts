export const GITHUB_PACKAGE_SPEC = "github:sethmgibson/coherent";

/** Public launcher. The unscoped npm name `coherent` is a different package. */
export const PUBLIC_NPX_INSTALL =
  "npx --yes --package github:sethmgibson/coherent -- coherent install";

export const PUBLIC_NPM_EXEC_INSTALL =
  "npm exec --yes --package github:sethmgibson/coherent -- coherent install";

export function addCliCommand(manager: "pnpm" | "npm" | "yarn" | "bun" | "unknown"): string {
  switch (manager) {
    case "npm":
      return `npm install --save-dev ${GITHUB_PACKAGE_SPEC}`;
    case "yarn":
      return `yarn add --dev ${GITHUB_PACKAGE_SPEC}`;
    case "bun":
      return `bun add --dev ${GITHUB_PACKAGE_SPEC}`;
    case "pnpm":
    case "unknown":
      return `pnpm add --save-dev ${GITHUB_PACKAGE_SPEC}`;
  }
}
