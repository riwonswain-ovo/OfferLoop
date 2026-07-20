import { createSyncService } from "./runtime.js";


let defaultService;


export async function adaptFaasEvent(event, { service }) {
  const response = await service({
    headers: event.headers ?? {},
    body: event.body,
  });
  return {
    statusCode: response.status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(response.body),
  };
}


export async function main(event) {
  defaultService ??= createSyncService({ env: process.env });
  return adaptFaasEvent(event, { service: defaultService });
}
