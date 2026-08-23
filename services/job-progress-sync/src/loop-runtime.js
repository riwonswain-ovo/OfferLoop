import { createHash } from "node:crypto";

export const WORKFLOWS = Object.freeze({
  OPPORTUNITY: "opportunity-loop",
  APPLICATION_PROGRESS: "application-progress-loop",
  CAPABILITY_GROWTH: "capability-growth-loop",
});

const OBSERVATION_STATUSES = new Set([
  "candidate",
  "confirmed",
  "dismissed",
  "training",
  "retest",
  "resolved",
]);

export function createAbilityObservation(input, now = new Date()) {
  const required = [
    "source_skill",
    "source_artifact_url",
    "source_run_id",
    "role_direction",
    "competency_tag",
    "observed_behavior",
    "evidence_summary",
    "gap",
    "suggested_training",
  ];
  for (const key of required) {
    if (!String(input[key] ?? "").trim()) throw new Error(`${key} is required`);
  }
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  const status = input.status ?? "candidate";
  if (!OBSERVATION_STATUSES.has(status)) throw new Error("invalid observation status");
  const identity = [input.source_skill, input.source_run_id, input.competency_tag, input.gap].join("|");
  return {
    observation_id: `obs_${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`,
    ...input,
    confidence,
    status,
    created_at: now.toISOString(),
  };
}

export function createTrainingTask(observations, now = new Date()) {
  const active = observations.filter((item) => !["dismissed", "resolved"].includes(item.status));
  if (active.length === 0) throw new Error("at least one unresolved observation is required");
  const role = active[0].role_direction;
  if (active.some((item) => item.role_direction !== role)) {
    throw new Error("a training task cannot mix role directions");
  }
  const ids = active.map((item) => item.observation_id).sort();
  return {
    task_id: `train_${createHash("sha256").update(ids.join("|")).digest("hex").slice(0, 16)}`,
    workflow: WORKFLOWS.CAPABILITY_GROWTH,
    status: "awaiting_user_agent",
    role_direction: role,
    observation_ids: ids,
    target_skill: "competency-lab",
    trigger_reason: active.map((item) => item.gap).join("；"),
    next_step: "打开原生 Agent，自动读取来源复盘并生成专项训练题",
    created_at: now.toISOString(),
  };
}

export function buildAgentDeepLinkPayload(task) {
  if (task.status !== "awaiting_user_agent") throw new Error("task is not ready for Agent");
  return {
    skill: task.target_skill,
    task_id: task.task_id,
    role_direction: task.role_direction,
    observation_ids: task.observation_ids,
    prompt: `请使用 $${task.target_skill} 读取任务 ${task.task_id} 的能力观察并生成专项训练题。`,
  };
}
