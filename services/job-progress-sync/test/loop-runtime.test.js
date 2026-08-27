import assert from "node:assert/strict";
import test from "node:test";

import { WORKFLOWS } from "../src/loop-runtime.js";

test("exposes only opportunity and application progress workflows", () => {
  assert.deepEqual(WORKFLOWS, {
    OPPORTUNITY: "opportunity-loop",
    APPLICATION_PROGRESS: "application-progress-loop",
  });
});
