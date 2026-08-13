import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCompletion,
  applyInvitation,
  countPendingEvents,
  deriveCurrentStatus,
  normalizeProgressFields,
} from "../src/progress-model.js";

test("normalizes legacy stages without claiming the pending step is complete", () => {
  assert.deepEqual(
    normalizeProgressFields({ "当前阶段": "笔试" }),
    { "当前阶段": "笔试", "最近完成节点": "投递完成", "下一环节": "笔试", "流程结果": "进行中" },
  );
});

test("invitation updates next stage and completion advances monotonically", () => {
  const invited = applyInvitation({ "最近完成节点": "投递完成", "下一环节": "待反馈" }, "一面");
  assert.equal(invited["最近完成节点"], "投递完成");
  const completed = applyCompletion(invited, "一面", "二面");
  assert.equal(deriveCurrentStatus(completed), "一面完成待二面");
  assert.deepEqual(applyCompletion(completed, "笔试", "一面"), completed);
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
