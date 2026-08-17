import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCompletion,
  applyInvitation,
  countPendingEvents,
  deriveCurrentStatus,
  normalizeProgressFields,
  parseProgressRecordIds,
  projectProgressFromEvents,
  resolveInterviewStages,
} from "../src/progress-model.js";

test("normalizes missing v6 state without consulting retired fields", () => {
  assert.deepEqual(
    normalizeProgressFields({ "当前阶段": "笔试" }),
    {
      "当前阶段": "笔试",
      "最近完成节点": "投递完成",
      "进展状态": "状态待确认",
    },
  );
});

test("invitation updates next stage and completion advances monotonically", () => {
  const invited = applyInvitation({ "进展状态": "待反馈", "最近完成节点": "投递完成" }, "一面");
  assert.equal(invited["最近完成节点"], "投递完成");
  assert.equal(invited["进展状态"], "待一面");
  const completed = applyCompletion(invited, "一面", "二面");
  assert.equal(deriveCurrentStatus(completed), "待二面");
  assert.equal(completed["最近完成节点"], "一面完成");
  assert.deepEqual(applyCompletion(completed, "笔试", "一面"), completed);
});

test("invitations protect terminal statuses and never regress a later pending stage", () => {
  const terminal = { "进展状态": "Offer", "最近完成节点": "面试完成" };
  assert.equal(applyInvitation(terminal, "一面")["进展状态"], "Offer");

  const later = { "进展状态": "待二面", "最近完成节点": "一面完成" };
  assert.equal(applyInvitation(later, "一面")["进展状态"], "待二面");

  const review = { "进展状态": "状态待确认", "最近完成节点": "投递完成" };
  assert.equal(applyInvitation(review, "一面")["进展状态"], "待一面");
});

test("completion never overwrites terminal progress statuses", () => {
  const terminal = {
    "进展状态": "Offer",
    "最近完成节点": "一面完成",
  };
  assert.deepEqual(applyCompletion(terminal, "二面"), terminal);
});

test("parses both JSON arrays and legacy progress record ids", () => {
  assert.deepEqual(parseProgressRecordIds('["recA","recB","recA"]'), ["recA", "recB"]);
  assert.deepEqual(parseProgressRecordIds("recLegacy"), ["recLegacy"]);
  assert.deepEqual(parseProgressRecordIds(""), []);
});

test("infers ordinary interview rounds from distinct invitation order", () => {
  const resolved = resolveInterviewStages([
    { created_time: "100", fields: { "环节": "面试（轮次待确认）" } },
    { created_time: "200", fields: { "环节": "群面" } },
    { created_time: "300", fields: { "环节": "面试（轮次待确认）" } },
    { created_time: "400", fields: { "环节": "HR面" } },
  ]);
  assert.deepEqual(resolved.map((item) => item.stage), ["一面", "群面", "二面", "HR面"]);
});

test("projects a completed written test to completed node and awaiting feedback", () => {
  const result = projectProgressFromEvents(
    { "进展状态": "待笔试", "最近完成节点": "投递完成" },
    [{
      record_id: "rec_exam",
      created_time: "100",
      fields: { "环节": "笔试", "完成状态": "已完成" },
    }],
  );
  assert.equal(result["最近完成节点"], "笔试完成");
  assert.equal(result["进展状态"], "待反馈");
});

test("a later pending interview survives completion of an earlier event", () => {
  const result = projectProgressFromEvents(
    { "进展状态": "待二面", "最近完成节点": "笔试完成" },
    [
      {
        record_id: "rec_first",
        created_time: "100",
        fields: { "环节": "面试（轮次待确认）", "完成状态": "已完成" },
      },
      {
        record_id: "rec_second",
        created_time: "200",
        fields: { "环节": "面试（轮次待确认）", "完成状态": "待完成" },
      },
    ],
  );
  assert.equal(result["最近完成节点"], "一面完成");
  assert.equal(result["进展状态"], "待二面");
});

test("only the latest missed event requires manual status confirmation", () => {
  const laterPending = projectProgressFromEvents(
    { "进展状态": "待二面", "最近完成节点": "投递完成" },
    [
      { created_time: "100", fields: { "环节": "一面", "完成状态": "已错过" } },
      { created_time: "200", fields: { "环节": "二面", "完成状态": "待完成" } },
    ],
  );
  assert.equal(laterPending["进展状态"], "待二面");

  const latestMissed = projectProgressFromEvents(
    { "进展状态": "待一面", "最近完成节点": "投递完成" },
    [{ created_time: "100", fields: { "环节": "一面", "完成状态": "已错过" } }],
  );
  assert.equal(latestMissed["进展状态"], "状态待确认");
});

test("event projection protects explicit terminal results", () => {
  const result = projectProgressFromEvents(
    { "进展状态": "未通过", "最近完成节点": "一面完成" },
    [{ created_time: "200", fields: { "环节": "二面", "完成状态": "待完成" } }],
  );
  assert.equal(result["进展状态"], "未通过");
  assert.equal(result["最近完成节点"], "一面完成");
});

test("pending event counts ignore completed written tests", () => {
  const counts = countPendingEvents([
    { "环节": "笔试", "完成状态": "已完成" },
    { "环节": "笔试", "完成状态": "待完成" },
    { "环节": "一面", "完成状态": "待完成" },
  ]);
  assert.equal(counts.get("笔试"), 1);
  assert.equal(counts.get("一面"), 1);
});
