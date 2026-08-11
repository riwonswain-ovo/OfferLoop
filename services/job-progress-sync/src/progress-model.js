export const COMPLETED_NODES = Object.freeze([
  "投递完成",
  "笔试完成",
  "群面完成",
  "一面完成",
  "二面完成",
  "三面完成",
  "HR面完成",
  "面试完成",
]);

export const NEXT_STAGES = Object.freeze([
  "待反馈",
  "笔试",
  "面试",
  "群面",
  "一面",
  "二面",
  "三面",
  "HR面",
  "OC",
  "Offer",
  "无",
]);

export const PROCESS_RESULTS = Object.freeze([
  "进行中",
  "OC",
  "Offer",
  "未通过",
  "主动放弃",
  "岗位关闭",
]);

const COMPLETED_RANK = new Map(COMPLETED_NODES.map((value, index) => [value, index]));
const STAGE_TO_COMPLETED = new Map([
  ["笔试", "笔试完成"],
  ["群面", "群面完成"],
  ["一面", "一面完成"],
  ["二面", "二面完成"],
  ["三面", "三面完成"],
  ["HR面", "HR面完成"],
  ["面试", "面试完成"],
]);

const LEGACY_STAGE_MAP = new Map([
  ["已投递", ["投递完成", "待反馈"]],
  ["笔试", ["投递完成", "笔试"]],
  ["群面", ["笔试完成", "群面"]],
  ["一面", ["笔试完成", "一面"]],
  ["二面", ["一面完成", "二面"]],
  ["三面", ["二面完成", "三面"]],
  ["HR面", ["三面完成", "HR面"]],
  ["Offer", ["面试完成", "Offer"]],
  ["已结束", ["投递完成", "无"]],
]);

export function deriveCurrentStatus(progress) {
  const result = String(progress["流程结果"] ?? "进行中");
  if (!["进行中", "OC"].includes(result)) {
    return result;
  }
  const completed = String(progress["最近完成节点"] ?? "投递完成");
  const next = String(progress["下一环节"] ?? "待反馈");
  if (next === "无") return completed;
  return `${completed}待${next}`;
}

export function normalizeProgressFields(fields = {}) {
  const normalized = { ...fields };
  if (!normalized["最近完成节点"] || !normalized["下一环节"]) {
    const [completed, next] = LEGACY_STAGE_MAP.get(String(fields["当前阶段"] ?? ""))
      ?? ["投递完成", "待反馈"];
    normalized["最近完成节点"] ||= completed;
    normalized["下一环节"] ||= next;
  }
  normalized["流程结果"] ||= "进行中";
  return normalized;
}

export function applyInvitation(fields, stage) {
  if (!NEXT_STAGES.includes(stage) || ["Offer", "无"].includes(stage)) {
    throw new Error(`unsupported invitation stage: ${stage}`);
  }
  const normalized = normalizeProgressFields(fields);
  if (!["进行中", "OC"].includes(normalized["流程结果"])) return normalized;
  return { ...normalized, "下一环节": stage };
}

export function applyCompletion(fields, stage, nextStage = "待反馈") {
  if (!NEXT_STAGES.includes(nextStage)) {
    throw new Error(`unsupported next stage: ${nextStage}`);
  }
  const completed = STAGE_TO_COMPLETED.get(stage);
  if (!completed) throw new Error(`unsupported completed stage: ${stage}`);
  const normalized = normalizeProgressFields(fields);
  const currentRank = COMPLETED_RANK.get(normalized["最近完成节点"]) ?? 0;
  const candidateRank = COMPLETED_RANK.get(completed);
  if (candidateRank < currentRank) return normalized;
  return {
    ...normalized,
    "最近完成节点": completed,
    "下一环节": nextStage,
  };
}

export function countPendingEvents(events) {
  const counts = new Map();
  for (const event of events) {
    if (String(event["完成状态"] ?? "") !== "待完成") continue;
    const stage = String(event["环节"] ?? "").trim();
    if (!stage) continue;
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  return counts;
}
