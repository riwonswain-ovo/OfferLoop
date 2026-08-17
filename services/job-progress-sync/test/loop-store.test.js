import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { handleDailyCheckinAction, prepareDailyCheckin } from "../src/daily-checkin.js";
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

test("daily check-in stays paused unless the complete group has one owner", () => {
  const config = {
    status: "enabled",
    time: "21:30",
    timezone: "Asia/Shanghai",
    owner_open_id: "ou_owner",
    chat_id: "oc_chat",
  };
  assert.equal(prepareDailyCheckin({ config, memberPage: { users: [{ member_id: "ou_owner" }], has_more: true }, events: {}, date: "2026-08-10" }).status, "paused");
  assert.equal(prepareDailyCheckin({ config, memberPage: { users: [{ member_id: "ou_owner" }], bots: [{}], has_more: false, truncations: [] }, events: {}, date: "2026-08-10" }).status, "ready");
});

test("card callbacks are idempotent and free text never writes before confirmation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "offerloop-action-"));
  const store = new LoopStore(join(directory, "runtime.json"));
  await store.load();
  const updates = [];
  const repository = { async update(id, fields) { updates.push({ id, fields }); } };
  const event = { message_id: "m1", event_id: "callback1", action_value: { action: "completed", record_id: "recEvent1" } };
  assert.equal((await handleDailyCheckinAction({ event, store, eventRepository: repository })).status, "updated");
  assert.equal((await handleDailyCheckinAction({ event, store, eventRepository: repository })).status, "duplicate");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], { id: "recEvent1", fields: { "完成状态": "已完成" } });
  const preview = await handleDailyCheckinAction({
    event: { message_id: "m2", event_id: "callback2", form_value: { progress_text: "完成了一面" } },
    store,
    eventRepository: repository,
  });
  assert.equal(preview.status, "preview_required");
  assert.equal(updates.length, 1);
});
