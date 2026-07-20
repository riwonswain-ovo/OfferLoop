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
        source_record_url: "https://example.feishu.cn/base/source",
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
        source_record_url: "https://example.feishu.cn/base/source",
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
        source_record_url: "",
        transitioned_at: "not-a-date",
      },
    },
    { webhookSecret: "expected", repository: {} },
  );

  assert.deepEqual(response, {
    status: 400,
    body: {
      ok: false,
      error: "company, source_record_url and transitioned_at are required",
    },
  });
});


test("creates a progress record for the first submitted event", async () => {
  const created = [];
  const repository = {
    async findByEnterpriseRecordId() {
      return null;
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
        source_record_url: "https://example.feishu.cn/base/source?record=rec_source",
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
      "原招聘信息": "https://example.feishu.cn/base/source?record=rec_source",
      "企业清单 record_id": "rec_source",
    },
  ]);
});


test("repeat submission preserves user fields and later interview stage", async () => {
  const updates = [];
  const repository = {
    async findByEnterpriseRecordId() {
      return {
        record_id: "rec_progress",
        fields: {
          "当前阶段": "二面",
          "公司": "旧公司名",
          "投递岗位": "AI 产品经理",
          "投递日期": "2026-07-10",
          "岗位 JD": "负责 AI 产品规划",
          "原招聘信息": "https://old.example/source",
          "企业清单 record_id": "rec_source",
        },
      };
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
        source_record_url: "https://new.example/source",
        transitioned_at: "2026-07-18T19:00:00+08:00",
      },
    },
    { webhookSecret: "expected", repository },
  );

  assert.deepEqual(response, {
    status: 200,
    body: { ok: true, action: "updated", record_id: "rec_progress" },
  });
  assert.equal(updates[0].fields["当前阶段"], "二面");
  assert.equal(updates[0].fields["投递岗位"], "AI 产品经理");
  assert.equal(updates[0].fields["投递日期"], "2026-07-10");
  assert.equal(updates[0].fields["岗位 JD"], "负责 AI 产品规划");
  assert.equal(updates[0].fields["公司"], "新公司名");
  assert.equal(updates[0].fields["原招聘信息"], "https://new.example/source");
});


test("identical retry does not write the progress record again", async () => {
  let updateCount = 0;
  const existingFields = {
    "当前阶段": "已投递",
    "公司": "示例公司",
    "投递岗位": "",
    "投递日期": "2026-07-17",
    "岗位 JD": "",
    "原招聘信息": "https://example.feishu.cn/base/source?record=rec_source",
    "企业清单 record_id": "rec_source",
  };
  const repository = {
    async findByEnterpriseRecordId() {
      return { record_id: "rec_progress", fields: existingFields };
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
        source_record_url: existingFields["原招聘信息"],
        transitioned_at: "2026-07-18T19:00:00+08:00",
      },
    },
    { webhookSecret: "expected", repository },
  );

  assert.deepEqual(response, {
    status: 200,
    body: { ok: true, action: "unchanged", record_id: "rec_progress" },
  });
  assert.equal(updateCount, 0);
});
