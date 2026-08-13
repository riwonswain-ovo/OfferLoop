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

export function validateSingleOwnerChat(memberPage, ownerOpenId) {
  const users = Array.isArray(memberPage?.users) ? memberPage.users : [];
  const incomplete = Boolean(memberPage?.has_more)
    || (Array.isArray(memberPage?.truncations) && memberPage.truncations.length > 0)
    || memberPage?.page_complete === false;
  if (incomplete) return { safe: false, reason: "member_list_incomplete" };
  if (users.length !== 1) return { safe: false, reason: "human_member_count_not_one" };
  const soleId = String(users[0]?.member_id ?? users[0]?.open_id ?? users[0]?.id ?? "");
  if (!soleId || soleId !== String(ownerOpenId ?? "")) {
    return { safe: false, reason: "sole_human_is_not_owner" };
  }
  return { safe: true, reason: "single_owner_chat", bot_count: memberPage?.bots?.length ?? 0 };
}

export function actionIdempotencyKey({ messageId, actionId, eventId }) {
  for (const [name, value] of Object.entries({ messageId, actionId, eventId })) {
    if (!String(value ?? "").trim()) throw new Error(`${name} is required`);
  }
  return createHash("sha256")
    .update(`${messageId}|${actionId}|${eventId}`)
    .digest("hex");
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

function actionButton(label, action, eventId, type = "default") {
  return {
    tag: "button",
    text: { tag: "plain_text", content: label },
    type,
    size: "small",
    behaviors: [{ type: "callback", value: { action, event_id: eventId } }],
  };
}

export function buildDailyCheckinCard({ date, overdue = [], today = [], upcoming = [] }) {
  const groups = [
    ["逾期", overdue, "red"],
    ["今天", today, "yellow"],
    ["近期", upcoming, "blue"],
  ];
  const elements = [];
  let remainingSlots = 3;
  for (const [label, items, color] of groups) {
    if (items.length === 0 || remainingSlots === 0) continue;
    const selected = items.slice(0, remainingSlots);
    remainingSlots -= selected.length;
    for (const item of selected) {
      const eventId = String(item.event_id ?? item.record_id ?? "");
      if (!eventId) throw new Error("daily check-in event id is required");
      const title = [item.company, item.position, item.stage].filter(Boolean).join("｜");
      elements.push({
        tag: "column_set",
        flex_mode: "none",
        background_style: `${color}-50`,
        margin: "0px 0px 12px 0px",
        columns: [{
          tag: "column",
          width: "weighted",
          weight: 1,
          padding: "12px",
          vertical_spacing: "4px",
          elements: [
            { tag: "markdown", content: `**<font color='${color}'>${label}</font> · ${title || "待处理安排"}**\n<font color='grey'>${item.time_label ?? "时间待确认"}</font>` },
            {
              tag: "column_set",
              flex_mode: "flow",
              horizontal_spacing: "4px",
              columns: [
                { tag: "column", width: "auto", elements: [actionButton("已完成", "completed", eventId, "primary_filled")] },
                { tag: "column", width: "auto", elements: [actionButton("延期", "postponed", eventId)] },
                { tag: "column", width: "auto", elements: [actionButton("未参加", "not_attended", eventId, "danger")] },
                { tag: "column", width: "auto", elements: [actionButton("无变化", "no_change", eventId)] },
              ],
            },
          ],
        }],
      });
    }
  }
  if (elements.length === 0) {
    elements.push({
      tag: "column_set",
      flex_mode: "none",
      background_style: "green-50",
      columns: [{
        tag: "column",
        width: "weighted",
        weight: 1,
        padding: "12px",
        elements: [{ tag: "markdown", content: "**今天没有待完成的笔试或面试安排。**" }],
      }],
    });
  }
  elements.push({
    tag: "form",
    name: "progress_update_form",
    direction: "vertical",
    vertical_spacing: "8px",
    elements: [
      {
        tag: "input",
        name: "progress_text",
        input_type: "multiline_text",
        rows: 3,
        max_length: 1000,
        label: { tag: "plain_text", content: "还有其他进展？" },
        placeholder: { tag: "plain_text", content: "例如：完成了 A 公司一面，等待二面通知" },
      },
      {
        tag: "button",
        name: "preview_progress",
        form_action_type: "submit",
        text: { tag: "plain_text", content: "生成更新预览" },
        type: "primary_filled",
        width: "fill",
      },
    ],
  });
  return {
    schema: "2.0",
    config: {
      update_multi: true,
      width_mode: "default",
      summary: { content: `OfferLoop ${date} 求职进展确认` },
    },
    header: {
      title: { tag: "plain_text", content: "OfferLoop 求职进展确认" },
      subtitle: { tag: "plain_text", content: `${date} · 每日 21:30` },
      template: "blue",
      icon: { tag: "standard_icon", token: "todo_colorful" },
      text_tag_list: [{ tag: "text_tag", text: { tag: "plain_text", content: "待确认" }, color: "yellow" }],
    },
    body: {
      direction: "vertical",
      padding: "12px 12px 20px 12px",
      vertical_spacing: "12px",
      elements,
    },
  };
}

export function parseCheckinCardAction(event) {
  if (!event?.message_id || !event?.event_id) throw new Error("card callback identifiers are required");
  if (event.form_value) {
    const form = typeof event.form_value === "string" ? JSON.parse(event.form_value) : event.form_value;
    const text = String(form.progress_text ?? "").trim();
    if (!text) return { kind: "no_change", idempotency_key: actionIdempotencyKey({ messageId: event.message_id, actionId: "empty_form", eventId: event.event_id }) };
    return {
      kind: "free_text_preview",
      text,
      requires_confirmation: true,
      idempotency_key: actionIdempotencyKey({ messageId: event.message_id, actionId: "preview_progress", eventId: event.event_id }),
    };
  }
  const value = typeof event.action_value === "string" ? JSON.parse(event.action_value) : event.action_value;
  if (!value?.event_id || !["completed", "postponed", "not_attended", "no_change"].includes(value.action)) {
    throw new Error("unsupported check-in action");
  }
  return {
    kind: "event_action",
    event_id: value.event_id,
    action: value.action,
    requires_confirmation: false,
    idempotency_key: actionIdempotencyKey({ messageId: event.message_id, actionId: value.action, eventId: event.event_id }),
  };
}
