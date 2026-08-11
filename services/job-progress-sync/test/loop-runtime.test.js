import assert from "node:assert/strict";
import test from "node:test";

import {
  actionIdempotencyKey,
  buildDailyCheckinCard,
  buildAgentDeepLinkPayload,
  createAbilityObservation,
  createTrainingTask,
  parseCheckinCardAction,
  validateSingleOwnerChat,
} from "../src/loop-runtime.js";

const observationInput = {
  source_skill: "mock-lab",
  source_artifact_url: "https://example.test/mock",
  source_run_id: "mock-lab-1",
  role_direction: "AI 产品经理",
  competency_tag: "评测设计",
  observed_behavior: "只描述准确率，没有定义样本和护栏",
  evidence_summary: "回答缺少样本分层与失败案例",
  gap: "无法完整设计 AI 产品评测",
  confidence: 0.8,
  suggested_training: "设计一套离线与线上评测方案",
};

test("creates a stable candidate observation and queued Agent task", () => {
  const observation = createAbilityObservation(observationInput, new Date("2026-08-10T12:00:00Z"));
  assert.equal(observation.status, "candidate");
  const task = createTrainingTask([observation], new Date("2026-08-10T12:01:00Z"));
  assert.equal(task.status, "awaiting_user_agent");
  assert.equal(buildAgentDeepLinkPayload(task).skill, "competency-lab");
});

test("only a complete single-owner chat is safe", () => {
  assert.equal(validateSingleOwnerChat({ users: [{ open_id: "ou_owner" }], bots: [{}], has_more: false }, "ou_owner").safe, true);
  assert.equal(validateSingleOwnerChat({ users: [{ open_id: "ou_owner" }], has_more: true }, "ou_owner").safe, false);
  assert.equal(validateSingleOwnerChat({ users: [{ open_id: "ou_owner" }, { open_id: "ou_other" }] }, "ou_owner").safe, false);
});

test("card idempotency key is stable", () => {
  const input = { messageId: "om_1", actionId: "done", eventId: "evt_1" };
  assert.equal(actionIdempotencyKey(input), actionIdempotencyKey(input));
});

test("daily check-in card uses Card 2.0 and free text requires preview confirmation", () => {
  const card = buildDailyCheckinCard({
    date: "2026-08-10",
    today: [{ event_id: "evt_1", company: "示例公司", stage: "一面", time_label: "20:00" }],
  });
  assert.equal(card.schema, "2.0");
  assert.equal(card.body.elements.at(-1).tag, "form");
  const parsed = parseCheckinCardAction({
    message_id: "om_1",
    event_id: "callback_1",
    form_value: JSON.stringify({ progress_text: "完成了一面" }),
  });
  assert.equal(parsed.kind, "free_text_preview");
  assert.equal(parsed.requires_confirmation, true);
});
