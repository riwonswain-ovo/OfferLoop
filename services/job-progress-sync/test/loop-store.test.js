import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LoopStore } from "../src/loop-store.js";
import { WORKFLOWS } from "../src/loop-runtime.js";

test("persists workflow state and rejects invalid edges", async () => {
  const directory = await mkdtemp(join(tmpdir(), "offerloop-store-"));
  const path = join(directory, "runtime.json");
  const store = new LoopStore(path, { clock: () => new Date("2026-08-10T13:30:00Z") });
  await store.load();
  await store.createWorkflow({
    instance_id: "opp_1",
    workflow: WORKFLOWS.OPPORTUNITY,
    initial_node: "discovered",
    source: { record_id: "rec_1" },
    idempotency_key: "source_1",
  });
  await store.transition("opp_1", "awaiting_confirmation");
  await assert.rejects(() => store.transition("opp_1", "completed"), /not allowed/);
  const reloaded = new LoopStore(path);
  const state = await reloaded.load();
  assert.equal(state.workflows.opp_1.current_node, "awaiting_confirmation");
});
