import assert from "node:assert/strict";
import test from "node:test";

import { reconcileInterviewEvents } from "../src/interview-reconcile.js";


test("reconciles the completed JD written test into its linked progress record", async () => {
  const updates = [];
  const result = await reconcileInterviewEvents({
    recordId: "rec_jd_exam",
    eventRepository: {
      async listAll() {
        return [{
          record_id: "rec_jd_exam",
          created_time: "100",
          fields: {
            "公司": "京东",
            "环节": "笔试",
            "完成状态": "已完成",
            "求职记录ID": '["rec_jd_progress"]',
          },
        }];
      },
    },
    progressRepository: {
      async findByRecordId(recordId) {
        assert.equal(recordId, "rec_jd_progress");
        return {
          record_id: recordId,
          fields: {
            "进展状态": "待笔试",
            "最近完成节点": "投递完成",
          },
        };
      },
      async update(recordId, fields) {
        updates.push({ recordId, fields });
      },
    },
  });

  assert.equal(result.action, "updated");
  assert.deepEqual(updates, [{
    recordId: "rec_jd_progress",
    fields: {
      "进展状态": "待反馈",
      "最近完成节点": "笔试完成",
    },
  }]);
});

test("one event can independently reconcile multiple linked applications", async () => {
  const updates = [];
  const records = new Map([
    ["recA", { record_id: "recA", fields: { "进展状态": "待笔试", "最近完成节点": "投递完成" } }],
    ["recB", { record_id: "recB", fields: { "进展状态": "Offer", "最近完成节点": "面试完成" } }],
  ]);
  const result = await reconcileInterviewEvents({
    eventRepository: {
      async listAll() {
        return [{
          record_id: "rec_exam",
          fields: {
            "环节": "笔试",
            "完成状态": "已完成",
            "求职记录ID": '["recA","recB"]',
          },
        }];
      },
    },
    progressRepository: {
      async findByRecordId(recordId) { return records.get(recordId); },
      async update(recordId, fields) { updates.push({ recordId, fields }); },
    },
  });

  assert.equal(result.matched_count, 2);
  assert.equal(result.updated_count, 1);
  assert.equal(updates[0].recordId, "recA");
});

test("reports an unlinked changed event without guessing by company", async () => {
  const result = await reconcileInterviewEvents({
    recordId: "rec_unlinked",
    eventRepository: {
      async listAll() {
        return [{ record_id: "rec_unlinked", fields: { "公司": "京东", "求职记录ID": "" } }];
      },
    },
    progressRepository: {},
  });
  assert.equal(result.action, "unlinked");
  assert.equal(result.updated_count, 0);
});

test("a failed linked record does not block another application", async () => {
  const updates = [];
  const result = await reconcileInterviewEvents({
    eventRepository: {
      async listAll() {
        return [{
          record_id: "rec_exam",
          fields: {
            "环节": "笔试",
            "完成状态": "已完成",
            "求职记录ID": '["recFail","recOkay"]',
          },
        }];
      },
    },
    progressRepository: {
      async findByRecordId(recordId) {
        if (recordId === "recFail") throw new Error("temporary failure");
        return {
          record_id: recordId,
          fields: {
            "进展状态": "待笔试",
            "最近完成节点": "投递完成",
          },
        };
      },
      async update(recordId) { updates.push(recordId); },
    },
  });
  assert.deepEqual(updates, ["recOkay"]);
  assert.deepEqual(result.failed_record_ids, ["recFail"]);
  assert.equal(result.updated_count, 1);
});
