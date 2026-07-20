import { FeishuProgressRepository } from "./feishu-client.js";
import { handleSyncRequest } from "./handler.js";
import { retryOperation } from "./retry.js";


const TOKEN_URL =
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const REQUIRED_ENV = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "PROGRESS_BASE_TOKEN",
  "PROGRESS_TABLE_ID",
  "WEBHOOK_SECRET",
];


function requireDeploymentEnv(env) {
  for (const name of REQUIRED_ENV) {
    if (!String(env[name] ?? "").trim()) {
      throw new Error(`missing required environment variable: ${name}`);
    }
  }
}


function createAccessTokenProvider({ env, fetchImpl, retryOptions }) {
  let cachedToken = "";
  let expiresAt = 0;
  return async () => {
    if (cachedToken && Date.now() < expiresAt) {
      return cachedToken;
    }
    const payload = await retryOperation(async () => {
      const response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          app_id: env.FEISHU_APP_ID,
          app_secret: env.FEISHU_APP_SECRET,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.code !== 0 || !result.tenant_access_token) {
        throw new Error(
          `Feishu token request failed: ${result.code ?? response.status} ${result.msg ?? ""}`.trim(),
        );
      }
      return result;
    }, retryOptions);
    cachedToken = payload.tenant_access_token;
    const safeLifetimeSeconds = Math.max(Number(payload.expire ?? 7200) - 300, 60);
    expiresAt = Date.now() + safeLifetimeSeconds * 1000;
    return cachedToken;
  };
}


export function createSyncService({
  env,
  fetchImpl = globalThis.fetch,
  retryOptions,
}) {
  requireDeploymentEnv(env);
  const accessTokenProvider = createAccessTokenProvider({
    env,
    fetchImpl,
    retryOptions,
  });
  const repository = new FeishuProgressRepository({
    baseToken: env.PROGRESS_BASE_TOKEN,
    tableId: env.PROGRESS_TABLE_ID,
    accessTokenProvider,
    fetchImpl,
    retryOptions,
  });

  return async (request) => {
    const body = typeof request.body === "string"
      ? JSON.parse(request.body)
      : request.body;
    return handleSyncRequest(
      { ...request, body },
      { webhookSecret: env.WEBHOOK_SECRET, repository },
    );
  };
}
