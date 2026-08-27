import { createHash } from "node:crypto";

import { retryOperation } from "./retry.js";


const OPEN_API_ROOT = "https://open.feishu.cn/open-apis";


function stableClientToken(sourceRecordId) {
  const bytes = Buffer.from(
    createHash("sha256")
      .update(`offerloop-progress:${sourceRecordId}`)
      .digest()
      .subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`
    + `-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


function toFeishuFields(fields) {
  const result = { ...fields };
  if (/^\d{4}-\d{2}-\d{2}$/.test(result["投递日期"] ?? "")) {
    result["投递日期"] = Date.parse(`${result["投递日期"]}T00:00:00+08:00`);
  }
  return result;
}


export class FeishuProgressRepository {
  constructor({
    baseToken,
    tableId,
    accessTokenProvider,
    fetchImpl = globalThis.fetch,
    retryOptions,
  }) {
    this.baseToken = baseToken;
    this.tableId = tableId;
    this.accessTokenProvider = accessTokenProvider;
    this.fetchImpl = fetchImpl;
    this.retryOptions = retryOptions;
  }

  async request(url, options) {
    return retryOperation(async () => {
      const accessToken = await this.accessTokenProvider();
      const response = await this.fetchImpl(url, {
        ...options,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${accessToken}`,
          ...options.headers,
        },
      });
      const payload = await response.json();
      if (!response.ok || payload.code !== 0) {
        const error = new Error(
          `Feishu API request failed: ${payload.code ?? response.status} ${payload.msg ?? ""}`.trim(),
        );
        error.status = response.status;
        error.transient = [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
        throw error;
      }
      return payload.data;
    }, this.retryOptions);
  }

  async findAllByEnterpriseRecordId(sourceRecordId) {
    const items = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({ page_size: "500" });
      if (pageToken) {
        query.set("page_token", pageToken);
      }
      const url =
        `${OPEN_API_ROOT}/bitable/v1/apps/${this.baseToken}`
        + `/tables/${this.tableId}/records/search?${query}`;
      const data = await this.request(url, {
        method: "POST",
        body: JSON.stringify({
          filter: {
            conjunction: "and",
            conditions: [
              {
                field_name: "企业清单 record_id",
                operator: "is",
                value: [sourceRecordId],
              },
            ],
          },
        }),
      });
      items.push(...(data.items ?? []));
      pageToken = data.has_more ? String(data.page_token ?? "") : "";
    } while (pageToken);
    return items;
  }

  async findByRecordId(recordId) {
    const url =
      `${OPEN_API_ROOT}/bitable/v1/apps/${this.baseToken}`
      + `/tables/${this.tableId}/records/${recordId}`;
    try {
      const data = await this.request(url, { method: "GET" });
      return data.record ?? null;
    } catch (error) {
      if (/1254043|record.*not found/i.test(String(error?.message ?? ""))) return null;
      throw error;
    }
  }

  async create(fields) {
    const clientToken = stableClientToken(fields["企业清单 record_id"]);
    const url =
      `${OPEN_API_ROOT}/bitable/v1/apps/${this.baseToken}`
      + `/tables/${this.tableId}/records`
      + `?client_token=${encodeURIComponent(clientToken)}`;
    const data = await this.request(url, {
      method: "POST",
      body: JSON.stringify({ fields: toFeishuFields(fields) }),
    });
    return data.record.record_id;
  }

  async update(recordId, fields) {
    const url =
      `${OPEN_API_ROOT}/bitable/v1/apps/${this.baseToken}`
      + `/tables/${this.tableId}/records/${recordId}`;
    await this.request(url, {
      method: "PUT",
      body: JSON.stringify({ fields: toFeishuFields(fields) }),
    });
  }

  async delete(recordId) {
    const url =
      `${OPEN_API_ROOT}/bitable/v1/apps/${this.baseToken}`
      + `/tables/${this.tableId}/records/${recordId}`;
    await this.request(url, { method: "DELETE" });
  }
}


export class FeishuInterviewEventRepository {
  constructor({
    baseToken,
    tableId,
    accessTokenProvider,
    fetchImpl = globalThis.fetch,
    retryOptions,
  }) {
    this.baseToken = baseToken;
    this.tableId = tableId;
    this.accessTokenProvider = accessTokenProvider;
    this.fetchImpl = fetchImpl;
    this.retryOptions = retryOptions;
  }

  async request(url, options) {
    return retryOperation(async () => {
      const accessToken = await this.accessTokenProvider();
      const response = await this.fetchImpl(url, {
        ...options,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${accessToken}`,
          ...options.headers,
        },
      });
      const payload = await response.json();
      if (!response.ok || payload.code !== 0) {
        const error = new Error(
          `Feishu API request failed: ${payload.code ?? response.status} ${payload.msg ?? ""}`.trim(),
        );
        error.status = response.status;
        error.transient = [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
        throw error;
      }
      return payload.data;
    }, this.retryOptions);
  }

  async findByRecordId(recordId) {
    const url = `${OPEN_API_ROOT}/bitable/v1/apps/${this.baseToken}`
      + `/tables/${this.tableId}/records/${encodeURIComponent(recordId)}`;
    const data = await this.request(url, { method: "GET" });
    return data.record ?? null;
  }

  async listByProgressRecordId(progressRecordId) {
    const query = new URLSearchParams({ page_size: "100" });
    const url = `${OPEN_API_ROOT}/bitable/v1/apps/${this.baseToken}`
      + `/tables/${this.tableId}/records/search?${query}`;
    const data = await this.request(url, { method: "POST", body: JSON.stringify({
      filter: { conjunction: "and", conditions: [{ field_name: "求职记录ID", operator: "contains", value: [String(progressRecordId)] }] },
      field_names: ["环节", "完成状态", "事件状态", "求职记录ID", "开始时间", "截止时间", "结束时间"],
    }) });
    return data.items ?? [];
  }

  async update(recordId, fields) {
    const url =
      `${OPEN_API_ROOT}/bitable/v1/apps/${this.baseToken}`
      + `/tables/${this.tableId}/records/${recordId}`;
    await this.request(url, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

}
