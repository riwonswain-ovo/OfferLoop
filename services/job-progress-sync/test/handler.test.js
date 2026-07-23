import test from "node:test";
import assert from "node:assert/strict";

import { handleSyncRequest } from "../src/handler.js";


test("rejects a request with the wrong webhook secret", async () => {
  const response = await handleSyncRequest(
    {
      headers: { "x-offerloop-secret": "wrong" },
      body: {},
    },
    {
      webhookSecret: "expected",
      repository: {},
    },
  );

  assert.deepEqual(response, {
    status: 401,
    body: { ok: false, error: "unauthorized" },
  });
});


test("rejects a submitted event without a source record id", async () => {
  const response = await handleSyncRequest(
    {
      headers: { "x-offerloop-secret": "expected" },
      body: {
        event: "application.submitted",
        company: "示例公司",
        announcement_url: "https://example.com/notice",
        application_url: "https://example.com/apply",
        transitioned_at: "2026-07-17T19:00:00+08:00",
      },
    },
    {
      webhookSecret: "expected",
      repository: {},
    },
  );

  assert.deepEqual(response, {
    status: 400,
    body: { ok: false, error: "source_record_id is required" },
  });
});


test("rejects events other than an application entering submitted status", async () => {
  const response = await handleSyncRequest(
    {
      headers: { "x-offerloop-secret": "expected" },
      body: {
        event: "application.interested",
        source_record_id: "rec_source",
        company: "示例公司",
        announcement_url: "https://example.com/notice",
        application_url: "https://example.com/apply",
        transitioned_at: "2026-07-17T19:00:00+08:00",
      },
    },
    { webhookSecret: "expected", repository: {} },
  );

  assert.deepEqual(response, {
    status: 400,
    body: { ok: false, error: "event must be application.submitted" },
  });
});


test("accepts the webhook secret header regardless of header name casing", async () => {
  const response = await handleSyncRequest(
    {
      headers: { "X-OfferLoop-Secret": "expected" },
      body: { event: "application.submitted" },
    },
    { webhookSecret: "expected", repository: {} },
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "source_record_id is required");
});


test("rejects incomplete submitted event fields before accessing Feishu", async () => {
  const response = await handleSyncRequest(
    {
      headers: { "x-offerloop-secret": "expected" },
      body: {
        event: "application.submitted",
        source_record_id: "rec_source",
        company: "",
        transitioned_at: "not-a-date",
      },
    },
    { webhookSecret: "expected", repository: {} },
  );

  assert.deepEqual(response, {
    status: 400,
    body: {
      ok: false,
      error: "company and transitioned_at are required",
    },
  });
});


test("creates a progress record for the first submitted event", async () => {
  const created = [];
  const repository = {
    async findAllByEnterpriseRecordId() {
      return [];
    },
    async create(fields) {
      created.push(fields);
      return "rec_progress";
    },
  };

  const response = await handleSyncRequest(
    {
      headers: { "x-offerloop-secret": "expected" },
      body: {
        event: "application.submitted",
        source_record_id: "rec_source",
        company: "示例公司",
        announcement_url: "https://example.com/notice",
        application_url: "https://example.com/apply",
        transitioned_at: "2026-07-17T19:00:00+08:00",
      },
    },
    { webhookSecret: "expected", repository },
  );

  assert.deepEqual(response, {
    status: 200,
    body: { ok: true, action: "created", record_id: "rec_progress" },
  });
  assert.deepEqual(created, [
    {
      "当前阶段": "已投递",
      "公司": "示例公司",
      "投递岗位": "",
      "投递日期": "2026-07-17",
      "岗位 JD": "",
      "公告链接": "https://example.com/notice",
      "投递链接": "https://example.com/apply",
      "企业清单 record_id": "rec_source",
      "投递记录 ID": "enterprise:rec_source:default",
    },
  ]);
});


test("repeat submission preserves user fields and later interview stage", async () => {
  const updates = [];
  const repository = {
    async findAllByEnterpriseRecordId() {
      return [{
        record_id: "rec_progress",
        fields: {
          "当前阶段": "二面",
          "公司": "旧公司名",
          "投递岗位": "AI 产品经理",
          "投递日期": "2026-07-10",
          "岗位 JD": "负责 AI 产品规划",
          "原招聘信息": "https://old.example/source",
          "公告链接": "https://old.example/notice",
          "投递链接": "https://old.example/apply",
          "企业清单 record_id": "rec_source",
        },
      }];
    },
    async update(recordId, fields) {
      updates.push({ recordId, fields });
    },
  };

  const response = await handleSyncRequest(
    {
      headers: { "x-offerloop-secret": "expected" },
      body: {
        event: "application.submitted",
        source_record_id: "rec_source",
        company: "新公司名",
        announcement_url: "https://new.example/notice",
        application_url: "https://new.example/apply",
        transitioned_at: "2026-07-18T19:00:00+08:00",
      },
    },
    { webhookSecret: "expected", repository },
  );

  assert.deepEqual(response, {
    status: 200,
    body: {
      ok: true,
      action: "updated",
      record_id: "rec_progress",
      matched_count: 1,
    },
  });
  assert.equal(updates[0].fields["当前阶段"], "二面");
  assert.equal(updates[0].fields["投递岗位"], "AI 产品经理");
  assert.equal(updates[0].fields["投递日期"], "2026-07-10");
  assert.equal(updates[0].fields["岗位 JD"], "负责 AI 产品规划");
  assert.equal(updates[0].fields["公司"], "新公司名");
  assert.equal(updates[0].fields["公告链接"], "https://new.example/notice");
  assert.equal(updates[0].fields["投递链接"], "https://new.example/apply");
  assert.equal(updates[0].fields["投递记录 ID"], "progress:rec_progress");
  assert.equal("原招聘信息" in updates[0].fields, false);
});


test("identical retry does not write the progress record again", async () => {
  let updateCount = 0;
  const existingFields = {
    "当前阶段": "已投递",
    "公司": "示例公司",
    "投递岗位": "",
    "投递日期": "2026-07-17",
    "岗位 JD": "",
    "公告链接": "https://example.com/notice",
    "投递链接": "https://example.com/apply",
    "企业清单 record_id": "rec_source",
  };
  const repository = {
    async findAllByEnterpriseRecordId() {
      return [{
        record_id: "rec_progress",
        fields: { ...existingFields, "投递记录 ID": "progress:rec_progress" },
      }];
    },
    async update() {
      updateCount += 1;
    },
  };

  const response = await handleSyncRequest(
    {
      headers: { "x-offerloop-secret": "expected" },
      body: {
        event: "application.submitted",
        source_record_id: "rec_source",
        company: "示例公司",
        announcement_url: existingFields["公告链接"],
        application_url: existingFields["投递链接"],
        transitioned_at: "2026-07-18T19:00:00+08:00",
      },
    },
    { webhookSecret: "expected", repository },
  );

  assert.deepEqual(response, {
    status: 200,
    body: {
      ok: true,
      action: "unchanged",
      record_id: "rec_progress",
      matched_count: 1,
    },
  });
  assert.equal(updateCount, 0);
});


test("updates every distinct job under the same enterprise record", async () => {
  const updates = [];
  const repository = {
    async findAllByEnterpriseRecordId() {
      return [
        {
          record_id: "rec_job_one",
          fields: {
            "当前阶段": "一面",
            "公司": "旧公司名",
            "投递岗位": "AI 产品经理",
            "投递日期": "2026-07-10",
            "岗位 JD": "岗位一",
            "企业清单 record_id": "rec_source",
          },
        },
        {
          record_id: "rec_job_two",
          fields: {
            "当前阶段": "已投递",
            "公司": "旧公司名",
            "投递岗位": "策略产品经理",
            "投递日期": "2026-07-11",
            "岗位 JD": "岗位二",
            "企业清单 record_id": "rec_source",
            "投递记录 ID": "manual:job-two",
          },
        },
      ];
    },
    async update(recordId, fields) {
      updates.push({ recordId, fields });
    },
  };

  const response = await handleSyncRequest(
    {
      headers: { "x-offerloop-secret": "expected" },
      body: {
        event: "application.submitted",
        source_record_id: "rec_source",
        company: "新公司名",
        announcement_url: "https://new.example/notice",
        application_url: "https://new.example/apply",
        transitioned_at: "2026-07-18T19:00:00+08:00",
      },
    },
    { webhookSecret: "expected", repository },
  );

  assert.equal(response.body.action, "updated");
  assert.equal(response.body.matched_count, 2);
  assert.deepEqual(updates.map(({ recordId }) => recordId), [
    "rec_job_one",
    "rec_job_two",
  ]);
  assert.equal(updates[0].fields["投递岗位"], "AI 产品经理");
  assert.equal(updates[1].fields["投递岗位"], "策略产品经理");
  assert.equal(updates[0].fields["投递记录 ID"], "progress:rec_job_one");
  assert.equal(updates[1].fields["投递记录 ID"], "manual:job-two");
});
