import assert from "node:assert/strict";
import test from "node:test";

import { reconcileInterviewEvents } from "../src/interview-reconcile.js";

function eventRepository(event, linked = [event]) {
  return {
    async findByRecordId(recordId) { return recordId === event.record_id ? event : null; },
    async listByProgressRecordId() { return linked; },
  };
}

test("reconciles only the exact changed event and its linked application", async () => {
  const updates = [];
  const event = { record_id: "rec_exam", fields: { "环节": "笔试", "完成状态": "已完成", "事件状态": "有效", "求职记录ID": '["rec_progress"]' } };
  const result = await reconcileInterviewEvents({ recordId: "rec_exam", eventRepository: eventRepository(event), progressRepository: {
    async findByRecordId() { return { record_id: "rec_progress", fields: { "进展状态": "待笔试", "最近完成节点": "投递完成" } }; },
    async update(recordId, fields) { updates.push({ recordId, fields }); },
  } });
  assert.equal(result.action, "updated");
  assert.deepEqual(updates, [{ recordId: "rec_progress", fields: { "进展状态": "待反馈", "最近完成节点": "笔试完成" } }]);
});

test("one event independently reconciles every explicitly linked application", async () => {
  const updates = [];
  const event = { record_id: "rec_exam", fields: { "环节": "笔试", "完成状态": "已完成", "求职记录ID": '["recA","recB"]' } };
  const records = new Map([["recA", { record_id: "recA", fields: { "进展状态": "待笔试", "最近完成节点": "投递完成" } }], ["recB", { record_id: "recB", fields: { "进展状态": "Offer", "最近完成节点": "面试完成" } }]]);
  const result = await reconcileInterviewEvents({ recordId: "rec_exam", eventRepository: eventRepository(event), progressRepository: { async findByRecordId(id) { return records.get(id); }, async update(id) { updates.push(id); } } });
  assert.equal(result.matched_count, 2);
  assert.deepEqual(updates, ["recA"]);
});

test("unlinked and missing exact events never guess by company", async () => {
  const event = { record_id: "rec_unlinked", fields: { "公司": "京东", "求职记录ID": "" } };
  const unlinked = await reconcileInterviewEvents({ recordId: "rec_unlinked", eventRepository: eventRepository(event), progressRepository: {} });
  const missing = await reconcileInterviewEvents({ recordId: "rec_missing", eventRepository: eventRepository(event), progressRepository: {} });
  assert.equal(unlinked.action, "unlinked");
  assert.equal(missing.action, "missing");
});

test("reports partial failure instead of treating the callback as fully handled", async () => {
  const updates = [];
  const event = { record_id: "rec_exam", fields: { "环节": "笔试", "完成状态": "已完成", "求职记录ID": '["recFail","recOkay"]' } };
  const result = await reconcileInterviewEvents({ recordId: "rec_exam", eventRepository: eventRepository(event), progressRepository: {
    async findByRecordId(id) { if (id === "recFail") throw new Error("temporary failure"); return { record_id: id, fields: { "进展状态": "待笔试", "最近完成节点": "投递完成" } }; },
    async update(id) { updates.push(id); },
  } });
  assert.deepEqual(updates, ["recOkay"]);
  assert.equal(result.action, "partial_failure");
  assert.deepEqual(result.failed_record_ids, ["recFail"]);
});
