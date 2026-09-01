import { describe, expect, it } from "vitest";
import { DETECTOR_REVISION } from "../src/config.js";
import {
  checkRuntimeCompatibility,
  portableRuntimeIdentity,
  RUNTIME_CAPABILITIES,
  WORKFLOW_REVISION,
} from "../src/runtime.js";

describe("runtime compatibility", () => {
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
});
