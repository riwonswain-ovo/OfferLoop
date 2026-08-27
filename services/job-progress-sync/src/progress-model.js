export const COMPLETED_NODES = Object.freeze([
  "投递完成",
  "测评完成",
  "笔试完成",
  "群面完成",
  "一面完成",
  "二面完成",
  "三面完成",
  "面试完成",
  "HR面完成",
]);

export const NEXT_STAGES = Object.freeze([
  "待反馈",
  "测评",
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

export const PROGRESS_STATUSES = Object.freeze([
  "待反馈",
  "待测评",
  "待笔试",
  "待面试",
  "待群面",
  "待一面",
  "待二面",
  "待三面",
  "待 HR 面",
  "待 OC",
  "Offer",
  "未通过",
  "主动放弃",
  "岗位关闭",
  "状态待确认",
]);

const COMPLETED_RANK = new Map(COMPLETED_NODES.map((value, index) => [value, index]));
const STAGE_TO_COMPLETED = new Map([
  ["测评", "测评完成"],
  ["笔试", "笔试完成"],
  ["群面", "群面完成"],
  ["一面", "一面完成"],
  ["二面", "二面完成"],
  ["三面", "三面完成"],
  ["HR面", "HR面完成"],
  ["面试", "面试完成"],
]);

const NEXT_TO_PROGRESS_STATUS = new Map([
  ["待反馈", "待反馈"],
  ["测评", "待测评"],
  ["笔试", "待笔试"],
  ["面试", "待面试"],
  ["群面", "待群面"],
  ["一面", "待一面"],
  ["二面", "待二面"],
  ["三面", "待三面"],
  ["HR面", "待 HR 面"],
  ["OC", "待 OC"],
  ["Offer", "Offer"],
]);
const TERMINAL_PROGRESS_STATUSES = new Set([
  "Offer", "未通过", "主动放弃", "岗位关闭",
]);
const PROGRESS_STATUS_RANK = new Map([
  ["待反馈", 0],
  ["待测评", 1],
  ["待笔试", 2],
  ["待群面", 3],
  ["待一面", 4],
  ["待二面", 5],
  ["待三面", 6],
  ["待面试", 7],
  ["待 HR 面", 8],
  ["待 OC", 9],
]);
const NUMBERED_INTERVIEW_STAGES = new Map([
  ["一面", 1],
  ["二面", 2],
  ["三面", 3],
]);
const UNKNOWN_INTERVIEW_STAGES = new Set(["面试", "面试（轮次待确认）"]);

function readText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(readText).filter(Boolean).join("");
  if (value && typeof value === "object") {
    return readText(value.text ?? value.name ?? value.value ?? "");
  }
  return "";
}

function eventFields(event) {
  return event?.fields ?? event ?? {};
}

function eventOrder(event, index) {
  const fields = eventFields(event);
  const created = Number(event?.created_time ?? event?.createdAt ?? 0);
  if (Number.isFinite(created) && created > 0) return [created, index];
  for (const name of ["开始时间", "截止时间", "结束时间"]) {
    const value = Number(fields[name] ?? 0);
    if (Number.isFinite(value) && value > 0) return [value, index];
  }
  return [0, index];
}

function compareOrderedEvents(left, right) {
  return left.order[0] - right.order[0] || left.order[1] - right.order[1];
}

function progressStatusForStage(stage) {
  return NEXT_TO_PROGRESS_STATUS.get(stage) ?? "待面试";
}

function completedNodeForStage(stage) {
  return STAGE_TO_COMPLETED.get(stage) ?? (stage === "面试" ? "面试完成" : "");
}

export function parseProgressRecordIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map(readText).filter(Boolean))];
  const text = readText(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map(readText).filter(Boolean))];
    }
  } catch {
    // Legacy records store a single record id as plain text.
  }
  return [text];
}

export function resolveInterviewStages(events = []) {
  let numberedRound = 0;
  return events
    .map((event, index) => ({ event, order: eventOrder(event, index) }))
    .filter((entry) => readText(eventFields(entry.event)["事件状态"] || "有效") !== "已取消")
    .sort(compareOrderedEvents)
    .map((entry) => {
      const fields = eventFields(entry.event);
      let stage = readText(fields["环节"]);
      const explicitRound = NUMBERED_INTERVIEW_STAGES.get(stage);
      if (explicitRound) {
        numberedRound = Math.max(numberedRound, explicitRound);
      } else if (UNKNOWN_INTERVIEW_STAGES.has(stage)) {
        numberedRound += 1;
        stage = ["一面", "二面", "三面"][numberedRound - 1] ?? "面试";
      }
      return { ...entry, stage, fields };
    });
}

export function projectProgressFromEvents(fields = {}, events = []) {
  const normalized = normalizeProgressFields(fields);
  if (TERMINAL_PROGRESS_STATUSES.has(normalized["进展状态"])) return normalized;

  const resolved = resolveInterviewStages(events).filter(({ stage, fields: item }) => (
    Boolean(completedNodeForStage(stage))
    && readText(item["事件状态"] || "有效") !== "已取消"
    && ["待完成", "已完成"].includes(readText(item["完成状态"]))
  ));
  if (resolved.length === 0) return normalized;

  let completed = normalized["最近完成节点"];
  let completedRank = COMPLETED_RANK.get(completed) ?? 0;
  for (const item of resolved) {
    if (readText(item.fields["完成状态"]) !== "已完成") continue;
    const candidate = completedNodeForStage(item.stage);
    const candidateRank = COMPLETED_RANK.get(candidate) ?? 0;
    if (candidateRank >= completedRank) {
      completed = candidate;
      completedRank = candidateRank;
    }
  }

  const pending = resolved
    .filter((item) => readText(item.fields["完成状态"]) === "待完成")
    .sort((left, right) => {
      const leftRank = PROGRESS_STATUS_RANK.get(progressStatusForStage(left.stage)) ?? -1;
      const rightRank = PROGRESS_STATUS_RANK.get(progressStatusForStage(right.stage)) ?? -1;
      return leftRank - rightRank || compareOrderedEvents(left, right);
    });
  const progressStatus = pending.length > 0
    ? progressStatusForStage(pending.at(-1).stage)
    : "待反馈";
  return {
    ...normalized,
    "进展状态": progressStatus,
    "最近完成节点": completed,
  };
}

export function deriveCurrentStatus(progress) {
  const status = String(progress["进展状态"] ?? "");
  return PROGRESS_STATUSES.includes(status) ? status : "状态待确认";
}

export function normalizeProgressFields(fields = {}) {
  const normalized = { ...fields };
  normalized["进展状态"] = deriveCurrentStatus(normalized);
  normalized["最近完成节点"] ||= "投递完成";
  return normalized;
}

export function applyInvitation(fields, stage) {
  if (!NEXT_STAGES.includes(stage) || ["Offer", "无"].includes(stage)) {
    throw new Error(`unsupported invitation stage: ${stage}`);
  }
  const normalized = normalizeProgressFields(fields);
  if (TERMINAL_PROGRESS_STATUSES.has(normalized["进展状态"])) return normalized;
  const candidate = NEXT_TO_PROGRESS_STATUS.get(stage);
  const currentRank = PROGRESS_STATUS_RANK.get(normalized["进展状态"]) ?? -1;
  const candidateRank = PROGRESS_STATUS_RANK.get(candidate) ?? -1;
  if (candidateRank < currentRank) return normalized;
  return {
    ...normalized,
    "进展状态": candidate,
  };
}

export function applyCompletion(fields, stage, nextStage = "待反馈") {
  if (!NEXT_STAGES.includes(nextStage)) {
    throw new Error(`unsupported next stage: ${nextStage}`);
  }
  const completed = STAGE_TO_COMPLETED.get(stage);
  if (!completed) throw new Error(`unsupported completed stage: ${stage}`);
  const normalized = normalizeProgressFields(fields);
  if (TERMINAL_PROGRESS_STATUSES.has(normalized["进展状态"])) return normalized;
  const currentRank = COMPLETED_RANK.get(normalized["最近完成节点"]) ?? 0;
  const candidateRank = COMPLETED_RANK.get(completed);
  if (candidateRank < currentRank) return normalized;
  const targetStatus = NEXT_TO_PROGRESS_STATUS.get(nextStage) ?? "状态待确认";
  const currentStatusRank = PROGRESS_STATUS_RANK.get(normalized["进展状态"]) ?? -1;
  const completedStageRank = PROGRESS_STATUS_RANK.get(progressStatusForStage(stage)) ?? -1;
  const targetRank = PROGRESS_STATUS_RANK.get(targetStatus) ?? -1;
  const progressStatus = currentStatusRank > Math.max(completedStageRank, targetRank)
    ? normalized["进展状态"]
    : targetStatus;
  return {
    ...normalized,
    "进展状态": progressStatus,
    "最近完成节点": completed,
  };
}

export function countPendingEvents(events) {
  const counts = new Map();
  for (const event of events) {
    if (String(event["完成状态"] ?? "") !== "待完成") continue;
    if (String(event["事件状态"] ?? "有效") === "已取消") continue;
    const stage = String(event["环节"] ?? "").trim();
    if (!stage) continue;
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  return counts;
}
