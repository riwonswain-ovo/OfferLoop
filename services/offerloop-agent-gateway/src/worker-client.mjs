function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/u, '');
}

function createHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
  };
}

async function readResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : `HTTP ${String(response.status)}`;
    throw new Error(message);
  }
  return payload;
}

function createWorkerClient({ apiKey, baseUrl, fetchImpl = fetch }) {
  if (!apiKey) {
    throw new Error('OfferLoop Workbench API key is required');
  }
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const headers = createHeaders(apiKey);

  async function request(path, method, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        body: JSON.stringify(body),
        headers,
        method,
        signal: controller.signal,
      });
      return await readResponse(response);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    poll(body) {
      return request('/openapi/agent-worker/poll', 'POST', body);
    },
    updateRun(runId, body) {
      return request(
        `/openapi/agent-worker/runs/${encodeURIComponent(runId)}`,
        'PATCH',
        body,
      );
    },
  };
}

export { createHeaders, createWorkerClient, normalizeBaseUrl };
