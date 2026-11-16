import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DETECTOR_REVISION } from "../src/config.js";
import {
  checkRuntimeCompatibility,
  portableRuntimeIdentity,
  runtimeIdentity,
  RUNTIME_CAPABILITIES,
  WORKFLOW_REVISION,
} from "../src/runtime.js";

describe("runtime compatibility", () => {
  it("rejects skills that require the retired scheduler", () => {
    const runtime = portableRuntimeIdentity();
    expect(runtime.workflowRevision).toBe(3);
    expect(runtime.capabilities).not.toContain("inspect-terminal-state");
    expect(checkRuntimeCompatibility(runtime, {
      workflowRevision: 2,
      detectorRevision: DETECTOR_REVISION,
      capabilities: ["inspect-terminal-state"],
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("workflow revision"),
      expect.stringContaining("inspect-terminal-state"),
    ]));
  });

  it("fails closed when a newer skill requires a different runtime", () => {
    const runtime = portableRuntimeIdentity();
    expect(checkRuntimeCompatibility(runtime, {
      workflowRevision: WORKFLOW_REVISION,
      detectorRevision: DETECTOR_REVISION,
      capabilities: [...RUNTIME_CAPABILITIES],
    })).toEqual([]);

    expect(checkRuntimeCompatibility(
      { ...runtime, detectorRevision: DETECTOR_REVISION - 1, capabilities: ["review-queue"] },
      {
        workflowRevision: WORKFLOW_REVISION,
        detectorRevision: DETECTOR_REVISION,
        capabilities: [...RUNTIME_CAPABILITIES],
      },
    )).toEqual(expect.arrayContaining([
      expect.stringContaining("detector revision"),
      expect.stringContaining("doctor-staged"),
    ]));
  });

  it("reads the declared revision of the scoped package from package-lock.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-runtime-lock-"));
    try {
      const revision = "b".repeat(40);
      await writeFile(join(root, "package-lock.json"), JSON.stringify({
        packages: {
          "node_modules/@aevumvector/coherent": {
            resolved: `git+ssh://git@github.com/sethmgibson/coherent.git#${revision}`,
          },
        },
      }));
      expect((await runtimeIdentity(root)).declaredRevision).toBe(revision);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
