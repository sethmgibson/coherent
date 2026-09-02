import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/fixtures/**"],
    // Audit, plan, and install tests spawn real work. GitHub Actions Node 22
    // plus a loaded local suite exceed Vitest's 5s default without hanging.
    testTimeout: 20_000,
  },
});
