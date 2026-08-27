import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  cardActions,
  DAILY_CHECKIN_TIME,
  deriveReschedule,
  emptyDailyCard,
  groupDailyCheckinEvents,
  validateCardOwner,
  parseCardAction,
  populatedDailyCard,
  MAX_RECORDS_PER_CARD,
  paginateDailyGroups,
} from "../src/daily-checkin.js";

test("daily check-in is fixed at 22:10 and has an empty-state card", () => {
  assert.equal(DAILY_CHECKIN_TIME, "22:10");
  assert.equal(emptyDailyCard().schema, "2.0");
});

test("matches the shared v2 daily-card contract fixture", () => {
  const fixture = JSON.parse(readFileSync(new URL("../../../skills/recruiting-reminder/contracts/daily-checkin-cases.json", import.meta.url), "utf8"));
  const groups = groupDailyCheckinEvents(fixture.records, new Date(fixture.now));
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, items.map((item) => item.record_id)])), fixture.expected_groups);
  for (const [group, ids] of Object.entries(fixture.expected_groups)) for (const id of ids) assert.deepEqual(cardActions(fixture.records.find((item) => item.record_id === id), group), fixture.expected_actions[id]);
});

test("pending groups are exclusive and deadline overdue wins", () => {
  const now = new Date("2026-08-24T22:10:00+08:00");
  const records = [
    { record_id: "today", fields: { "完成状态": "待完成", "事件状态": "有效", "开始时间": "2026-08-24T20:00:00+08:00", "结束时间": "2026-08-24T23:00:00+08:00" } },
    { record_id: "plan", fields: { "完成状态": "待完成", "事件状态": "有效", "结束时间": "2026-08-24T20:00:00+08:00", "截止时间": "2026-08-25T20:00:00+08:00" } },
    { record_id: "deadline", fields: { "完成状态": "待完成", "事件状态": "有效", "结束时间": "2026-08-23T20:00:00+08:00", "截止时间": "2026-08-24T20:00:00+08:00" } },
    { record_id: "draft", fields: { "完成状态": "待完成", "事件状态": "草稿", "开始时间": "2026-08-24T20:00:00+08:00" } },
  ];
  const groups = groupDailyCheckinEvents(records, now);
  assert.deepEqual(groups.today.map((item) => item.record_id), ["today"]);
  assert.deepEqual(groups.plan_overdue.map((item) => item.record_id), ["plan"]);
  assert.deepEqual(groups.deadline_overdue.map((item) => item.record_id), ["deadline"]);
  assert.equal(Object.values(groups).flat().some((item) => item.record_id === "draft"), false);
});

test("fixed overdue events are missed-capable and async events are adjustable", () => {
  assert.deepEqual(cardActions({ "环节": "一面", "进行方式": "同步" }, "plan_overdue"), ["completed", "missed"]);
  assert.deepEqual(cardActions({ "环节": "一面", "进行方式": "同步" }, "today"), ["completed", "missed"]);
  assert.deepEqual(cardActions({ "环节": "测评", "进行方式": "异步" }, "plan_overdue"), ["completed", "not_completed"]);
});

test("async reschedule derives 90 minutes and can create a first calendar event", () => {
  const now = new Date("2026-08-24T12:00:00+08:00");
  const record = { "环节": "笔试", "进行方式": "异步", "已建日程ID": "evt1", "截止时间": "2026-08-25T18:00:00+08:00" };
  const result = deriveReschedule(record, "2026-08-25T15:30:00+08:00", now);
  assert.equal(Date.parse(result.end) - Date.parse(result.start), 90 * 60 * 1000);
  assert.doesNotThrow(() => deriveReschedule({ ...record, "已建日程ID": "" }, "2026-08-25T15:30:00+08:00", now));
  assert.throws(() => deriveReschedule({ ...record, "截止时间": "" }, "2026-08-25T15:30:00+08:00", now), /deadline/);
  assert.throws(() => deriveReschedule(record, "2026-08-25T17:00:00+08:00", now), /deadline/);
});

test("async reschedule preserves an explicit mail duration", () => {
  const record = {
    "环节": "测评", "进行方式": "异步", "已建日程ID": "evt-45",
    "开始时间": "2026-08-24T10:00:00+08:00",
    "结束时间": "2026-08-24T10:45:00+08:00",
    "截止时间": "2026-08-25T18:00:00+08:00",
  };
  assert.deepEqual(deriveReschedule(record, "2026-08-25T15:30:00+08:00", new Date("2026-08-24T12:00:00+08:00")), {
    start: "2026-08-25T07:30:00.000Z",
    end: "2026-08-25T08:15:00.000Z",
  });
  assert.equal(
    Date.parse(deriveReschedule({ ...record, "开始时间": "", "结束时间": "", "预计时长（分钟）": 45 }, "2026-08-25T15:30:00+08:00", new Date("2026-08-24T12:00:00+08:00")).end)
      - Date.parse("2026-08-25T15:30:00+08:00"),
    45 * 60 * 1000,
  );
});

test("only the configured owner may operate", () => {
  assert.doesNotThrow(() => validateCardOwner("ou_owner", "ou_owner"));
  assert.throws(() => validateCardOwner("ou_viewer", "ou_owner"), /owner/);
});

test("Card 2.0 callbacks carry the full record id in behaviors", () => {
  const card = populatedDailyCard({ today: [], plan_overdue: [], deadline_overdue: [], unplanned: [{ record_id: "recFullIdentifier123", fields: { "完成状态": "待完成", "环节": "测评", "进行方式": "异步" } }] });
  const button = card.body.elements[1].columns[1].elements[0];
  assert.equal(button.value, undefined);
  assert.deepEqual(button.behaviors[0].value, { action: "adjust", record_id: "recFullIdentifier123", group: "unplanned" });
  assert.equal(parseCardAction({ operator_id: "ou_owner", action_value: JSON.stringify({ action: "adjust", record_id: "recFullIdentifier123" }) }, "ou_owner").record_id, "recFullIdentifier123");
  assert.throws(() => parseCardAction({ operator_id: "ou_owner", action_value: { action: "delete", record_id: "recFullIdentifier123" } }, "ou_owner"), /unsupported/);
});

test("large histories are paginated and dynamic card text is bounded", () => {
  const records = Array.from({ length: MAX_RECORDS_PER_CARD + 1 }, (_, index) => ({ record_id: `rec${index}`, fields: { "安排名称": `**伪标题**\n${"x".repeat(300)}` } }));
  const groups = { today: records, plan_overdue: [], deadline_overdue: [], unplanned: [] };
  const pages = paginateDailyGroups(groups);
  assert.equal(pages.length, 2);
  assert.throws(() => populatedDailyCard(groups), /pagination/);
  assert.doesNotMatch(JSON.stringify(populatedDailyCard(pages[0])), /\*\*伪标题\*\*/u);
});
