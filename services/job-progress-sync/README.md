# OfferLoop Job Progress Sync

This directory is the platform-neutral reference implementation for copying a
newly submitted enterprise record into the independent `求职进展` Base. The
production Miaoda adapter is distributed from
`skills/offerloop-setup/assets/progress-sync-template`;
`job-collection` performs the same idempotent operation as a repair path.

## Current status

The production path is a Base workflow that reacts when `投递进度` becomes
`已投递` and calls the route-scoped Miaoda OpenAPI endpoint. The workflow sends
the source record ID as the `sourceRecordId` query parameter because Base raw
JSON body references do not reliably render system record metadata.

Production verification may use an explicitly approved, uniquely named
temporary record and must remove both source and progress records afterward.
Stable verification returns HTTP 200 and remains idempotent on replay.

## Runtime settings

Configure these as encrypted environment variables in the selected hosting
platform. Do not put their values in Git, a Feishu document, Base fields, or
request logs.

```text
FEISHU_APP_ID=<value>
FEISHU_APP_SECRET=<value>
PROGRESS_BASE_TOKEN=<value>
PROGRESS_TABLE_ID=<value>
WEBHOOK_SECRET=<value>
```

The Feishu app needs record read/write access to the target progress Base and
must be added as a document collaborator. The HTTP endpoint must use HTTPS.

The Miaoda production adapter additionally reads source Base identifiers from
encrypted environment variables and accepts a minimal body containing only
`sourceRecordId`. It re-reads the source record, verifies that its status is
`已投递`, and obtains the company name itself. Authentication is handled by a
route-scoped Miaoda OpenAPI key stored only in the Base workflow.

## Webhook contract

The caller supplies the shared secret in the `X-OfferLoop-Secret` header and a
JSON body with only the minimum recruitment metadata:

```json
{
  "event": "application.submitted",
  "source_record_id": "rec_example",
  "company": "示例公司",
  "announcement_url": "https://example.com/notice",
  "application_url": "https://example.com/apply",
  "transitioned_at": "2026-07-17T19:00:00+08:00"
}
```

`企业清单 record_id` is a repeatable parent key: one enterprise record may have
multiple progress rows for different jobs. `投递记录 ID` uniquely identifies each
application. A first event creates one default record with a blank `投递岗位`
and `岗位 JD`; later retries update every job row under that parent while preserving
user-edited fields, the first `投递日期`, and any later interview stage. Missing
application IDs are backfilled from the progress record ID. Creation uses a stable Feishu
`client_token`, so retrying the same source record remains idempotent.

## Feishu FaaS adapter

`src/feishu-faas.js` exports `main(event)`. The adapter expects an HTTP event
with `headers` and `body`, then returns `statusCode`, response headers and a JSON
string body. If the tenant's FaaS Public API shape differs, only this adapter
should change; `handler.js` and its tests remain platform-neutral.

## Local verification

Use a Node.js 20 or newer runtime:

```bash
npm test
```

The tests use injected mock HTTP clients. They do not contact Feishu or require
real credentials.
