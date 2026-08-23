import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentDeepLinkPayload,
  createAbilityObservation,
  createTrainingTask,
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
