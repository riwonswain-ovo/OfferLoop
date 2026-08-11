import {
  buildDailyCheckinCard,
  parseCheckinCardAction,
  validateSingleOwnerChat,
} from "./loop-runtime.js";

export const DAILY_CHECKIN_TIMEZONE = "Asia/Shanghai";
export const DAILY_CHECKIN_TIME = "21:30";

export function prepareDailyCheckin({ config, memberPage, events, date }) {
  if (config?.status !== "enabled") {
    return { status: "paused", reason: config?.pause_reason ?? "daily_checkin_not_enabled" };
  }
  if (config.time !== DAILY_CHECKIN_TIME || config.timezone !== DAILY_CHECKIN_TIMEZONE) {
    return { status: "paused", reason: "schedule_contract_mismatch" };
  }
  const safety = validateSingleOwnerChat(memberPage, config.owner_open_id);
  if (!safety.safe) return { status: "paused", reason: safety.reason };
  return {
    status: "ready",
    chat_id: config.chat_id,
    card: buildDailyCheckinCard({ date, ...events }),
  };
}

export async function handleDailyCheckinAction({ event, store, eventRepository }) {
  const action = parseCheckinCardAction(event);
  const claim = await store.claimAction(action.idempotency_key, action);
  if (!claim.claimed) return { status: "duplicate", action: claim.value };
  if (action.kind === "free_text_preview") {
    return {
      status: "preview_required",
      preview: { text: action.text, proposed_changes: [] },
      requires_confirmation: true,
    };
  }
  if (action.kind === "no_change") return { status: "recorded_no_change" };
  if (action.action === "no_change") return { status: "recorded_no_change" };
  const update = {
    completed: { completion_status: "已完成" },
    postponed: { completion_status: "待完成", postpone_requested: true },
    not_attended: { completion_status: "已错过" },
  }[action.action];
  await eventRepository.update(action.event_id, update);
  return { status: "updated", event_id: action.event_id, update };
}
