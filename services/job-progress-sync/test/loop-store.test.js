import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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

test("preserves retired ability data without exposing mutation methods", async () => {
  const directory = await mkdtemp(join(tmpdir(), "offerloop-legacy-ability-"));
  const path = join(directory, "runtime.json");
  const legacy = {
    schema_version: 1,
    workflows: {},
    node_runs: [],
    ability_observations: { obs_1: { observation_id: "obs_1", status: "candidate" } },
    tasks: { train_1: { task_id: "train_1", target_skill: "competency-lab" } },
    approvals: {},
    idempotency_keys: {},
  };
  await writeFile(path, `${JSON.stringify(legacy, null, 2)}\n`);
  const store = new LoopStore(path);
  const loaded = await store.load();
  assert.deepEqual(loaded.ability_observations, legacy.ability_observations);
  assert.deepEqual(loaded.tasks, legacy.tasks);
  assert.equal(store.upsertObservation, undefined);
  assert.equal(store.upsertTask, undefined);
  await store.persist();
  const persisted = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(persisted.ability_observations, legacy.ability_observations);
  assert.deepEqual(persisted.tasks, legacy.tasks);
});
