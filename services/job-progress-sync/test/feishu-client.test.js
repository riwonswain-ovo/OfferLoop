import test from "node:test";
import assert from "node:assert/strict";

import { FeishuProgressRepository } from "../src/feishu-client.js";


test("finds a progress record by the enterprise record id field", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          code: 0,
          data: {
            items: [
              {
                record_id: "rec_progress",
                fields: {
                  "公司": "示例公司",
                  "企业清单 record_id": "rec_source",
                },
              },
            ],
          },
        };
      },
    };
  };
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl,
  });

  const result = await repository.findByEnterpriseRecordId("rec_source");

  assert.equal(result.record_id, "rec_progress");
  assert.equal(
    requests[0].url,
    "https://open.feishu.cn/open-apis/bitable/v1/apps/app_example/tables/tblExample/records/search?page_size=2",
  );
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.Authorization, "Bearer tenant-token");
  assert.deepEqual(JSON.parse(requests[0].options.body).filter, {
    conjunction: "and",
    conditions: [
      {
        field_name: "企业清单 record_id",
        operator: "is",
        value: ["rec_source"],
      },
    ],
  });
});


test("returns null when no matching progress record exists", async () => {
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { code: 0, data: { items: [] } };
      },
    }),
  });

  assert.equal(await repository.findByEnterpriseRecordId("rec_missing"), null);
});


test("rejects duplicate progress records for the same enterprise record id", async () => {
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          code: 0,
          data: {
            items: [
              { record_id: "rec_one", fields: {} },
              { record_id: "rec_two", fields: {} },
            ],
          },
        };
      },
    }),
  });

  await assert.rejects(
    repository.findByEnterpriseRecordId("rec_duplicate"),
    /duplicate progress records/i,
  );
});


test("creates a progress record with a stable client token and Feishu date value", async () => {
  const requests = [];
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { code: 0, data: { record: { record_id: "rec_progress" } } };
        },
      };
    },
  });
  const fields = {
    "当前阶段": "已投递",
    "公司": "示例公司",
    "投递岗位": "",
    "投递日期": "2026-07-17",
    "岗位 JD": "",
    "原招聘信息": "https://example.feishu.cn/base/source",
    "企业清单 record_id": "rec_source",
  };

  const first = await repository.create(fields);
  await repository.create(fields);

  assert.equal(first, "rec_progress");
  const firstUrl = new URL(requests[0].url);
  const secondUrl = new URL(requests[1].url);
  assert.equal(firstUrl.pathname, "/open-apis/bitable/v1/apps/app_example/tables/tblExample/records");
  assert.match(
    firstUrl.searchParams.get("client_token"),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(
    firstUrl.searchParams.get("client_token"),
    secondUrl.searchParams.get("client_token"),
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    fields: {
      ...fields,
      "投递日期": Date.parse("2026-07-17T00:00:00+08:00"),
    },
  });
});


test("updates an existing progress record without changing blank non-date fields", async () => {
  const requests = [];
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { code: 0, data: { record: { record_id: "rec_progress" } } };
        },
      };
    },
  });

  await repository.update("rec_progress", {
    "投递岗位": "",
    "投递日期": "2026-07-18",
  });

  assert.equal(
    requests[0].url,
    "https://open.feishu.cn/open-apis/bitable/v1/apps/app_example/tables/tblExample/records/rec_progress",
  );
  assert.equal(requests[0].options.method, "PUT");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    fields: {
      "投递岗位": "",
      "投递日期": Date.parse("2026-07-18T00:00:00+08:00"),
    },
  });
});


test("retries transient Feishu failures before returning a record", async () => {
  let attempts = 0;
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    retryOptions: { attempts: 3, delayMs: 0 },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("temporary network failure");
      }
      return {
        ok: true,
        async json() {
          return { code: 0, data: { items: [] } };
        },
      };
    },
  });

  assert.equal(await repository.findByEnterpriseRecordId("rec_source"), null);
  assert.equal(attempts, 3);
});
