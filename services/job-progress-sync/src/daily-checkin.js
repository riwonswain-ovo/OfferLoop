export const DAILY_CHECKIN_TIMEZONE = "Asia/Shanghai";
export const DAILY_CHECKIN_TIME = "22:10";
export const MAX_RECORDS_PER_CARD = 25;

const FIXED_STAGES = new Set(["群面", "一面", "二面", "三面", "面试", "HR面"]);
const ASYNC_STAGES = new Set(["测评", "笔试"]);

function fields(record) {
  return record?.fields ?? record ?? {};
}

function cardText(value, limit = 160) {
  return String(value ?? "").trim()
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .slice(0, limit)
    .replace(/&/gu, "&#38;")
    .replace(/</gu, "&#60;")
    .replace(/>/gu, "&#62;")
    .replace(/\*/gu, "&#42;")
    .replace(/_/gu, "&#95;")
    .replace(/\[/gu, "&#91;")
    .replace(/\]/gu, "&#93;");
}

function time(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e11 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function dateInShanghai(value) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: DAILY_CHECKIN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function groupDailyCheckinEvents(records, now = new Date()) {
  const groups = { today: [], plan_overdue: [], deadline_overdue: [], unplanned: [] };
  const today = dateInShanghai(now);
  for (const record of records) {
    const item = fields(record);
    if (String(item["完成状态"] ?? "") !== "待完成") continue;
    if (String(item["事件状态"] ?? "").trim() !== "有效") continue;
    const start = time(item["开始时间"]);
    const end = time(item["结束时间"]);
    const deadline = time(item["截止时间"]);
    if (deadline !== null && deadline < now.getTime()) groups.deadline_overdue.push(record);
    else if (start === null && end === null && ASYNC_STAGES.has(String(item["环节"] ?? "")) && item["进行方式"] === "异步") groups.unplanned.push(record);
    else if ((end !== null && end < now.getTime()) || (end === null && start !== null && start < now.getTime())) groups.plan_overdue.push(record);
    else if (start !== null && dateInShanghai(new Date(start)) === today) groups.today.push(record);
  }
  return groups;
}

export function cardActions(record, group) {
  if (group === "unplanned") return ["adjust"];
  if (group === "deadline_overdue") return ["completed", "missed"];
  const item = fields(record);
  const fixed = FIXED_STAGES.has(String(item["环节"] ?? "")) || item["进行方式"] === "同步";
  if (fixed) return ["completed", "missed"];
  return ["completed", "not_completed"];
}

export function paginateDailyGroups(groups, pageSize = MAX_RECORDS_PER_CARD) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error("page_size_must_be_positive");
  const order = ["today", "plan_overdue", "deadline_overdue", "unplanned"];
  const flattened = order.flatMap((group) => (groups[group] ?? []).map((record) => ({ group, record })));
  const pages = [];
  for (let offset = 0; offset < flattened.length; offset += pageSize) {
    const page = { today: [], plan_overdue: [], deadline_overdue: [], unplanned: [] };
    for (const item of flattened.slice(offset, offset + pageSize)) page[item.group].push(item.record);
    pages.push(page);
  }
  return pages;
}

export function validateCardOwner(operatorOpenId, ownerOpenId) {
  if (!ownerOpenId || operatorOpenId !== ownerOpenId) throw new Error("owner_only");
}

export function deriveReschedule(record, start, now = new Date()) {
  const item = fields(record);
  if (!ASYNC_STAGES.has(String(item["环节"] ?? "")) || item["进行方式"] !== "异步") {
    throw new Error("fixed_event_not_adjustable");
  }
  const startMs = time(start);
  if (startMs === null) throw new Error("invalid_start");
  if (startMs <= now.getTime()) throw new Error("start_must_be_future");
  const previousStart = time(item["开始时间"]);
  const previousEnd = time(item["结束时间"]);
  const durationMs = previousStart !== null && previousEnd !== null && previousEnd > previousStart
    ? previousEnd - previousStart
    : storedDurationMs(item);
  const endMs = startMs + durationMs;
  const deadline = time(item["截止时间"]);
  if (deadline === null) throw new Error("missing_true_deadline");
  if (endMs > deadline) throw new Error("after_true_deadline");
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

export function emptyDailyCard() {
  return {
    schema: "2.0",
    config: { width_mode: "default", update_multi: true },
    header: { title: { tag: "plain_text", content: "OfferLoop 今日确认" }, template: "green", icon: { tag: "standard_icon", token: "todo_colorful" } },
    body: { padding: "12px 12px 20px 12px", elements: [{ tag: "markdown", content: "**今日没有待完成事件**\n辛苦啦，愿你今晚安心收尾 🌙" }] },
  };
}

export function populatedDailyCard(groups) {
  const count = Object.values(groups).reduce((sum, records) => sum + records.length, 0);
  if (count > MAX_RECORDS_PER_CARD) throw new Error("daily_card_requires_pagination");
  const labels = { today: "今天计划完成", plan_overdue: "计划时间已过", deadline_overdue: "招聘方截止已过", unplanned: "尚未安排计划时间" };
  const elements = [];
  for (const [group, records] of Object.entries(groups)) {
    if (!records.length) continue;
    elements.push({ tag: "markdown", content: `**${labels[group]}（${records.length}）**` });
    for (const record of records) {
      const item = fields(record);
      const recordId = String(record.record_id ?? "");
      const name = cardText(item["安排名称"]) || `${cardText(item["公司"], 100)}－${cardText(item["环节"], 24)}`;
      elements.push({ tag: "column_set", flex_mode: "none", horizontal_spacing: "medium", columns: [{ tag: "column", width: "weighted", weight: 2, elements: [{ tag: "markdown", content: name }] }, { tag: "column", width: "weighted", weight: 1, vertical_spacing: "small", elements: cardActions(record, group).map((action, index) => ({ tag: "button", text: { tag: "plain_text", content: ({ completed: "已完成", not_completed: "暂未完成", missed: "已错过", adjust: "调整日程" })[action] }, type: index === 0 ? "primary_filled" : "default", size: "small", behaviors: [{ type: "callback", value: { action, record_id: recordId, group } }] })) }] });
    }
  }
  return { schema: "2.0", config: { width_mode: "default", update_multi: true }, header: { title: { tag: "plain_text", content: "OfferLoop 今日确认" }, template: "green", icon: { tag: "standard_icon", token: "todo_colorful" } }, body: { padding: "12px 12px 20px 12px", vertical_spacing: "large", elements } };
}

export function parseCardAction(payload, ownerOpenId) {
  const root = payload?.event ?? payload ?? {};
  const operator = String(root?.operator?.open_id ?? root?.operator?.operator_id?.open_id ?? root?.operator_id ?? "");
  validateCardOwner(operator, ownerOpenId);
  const actionBlock = root?.action ?? {};
  let value = actionBlock.value ?? root.action_value ?? {};
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { value = {}; } }
  const actionName = String(actionBlock.name ?? root.action_name ?? "");
  const recordId = String(value.record_id ?? (actionName.startsWith("adjust:") ? actionName.slice(7) : ""));
  if (!/^rec[A-Za-z0-9_-]+$/.test(recordId)) throw new Error("exact_record_id_required");
  let formValue = actionBlock.form_value ?? root.form_value ?? {};
  if (typeof formValue === "string") formValue = JSON.parse(formValue || "{}");
  const action = String(value.action ?? (actionName.startsWith("adjust:") ? "adjust" : ""));
  if (!["completed", "not_completed", "missed", "adjust", "adjust_retry", "adjust_confirmed"].includes(action)) throw new Error("unsupported_card_action");
  return { action, record_id: recordId, form_value: formValue };
}

function storedDurationMs(item) {
  const minutes = Number(item["预计时长（分钟）"] ?? 90);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) throw new Error("invalid_stored_duration");
  return minutes * 60 * 1000;
}
