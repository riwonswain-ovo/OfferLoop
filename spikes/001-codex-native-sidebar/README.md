# 001: Codex native sidebar thread

## Question

Given the signed-in local Codex installation, when an external client creates a
named thread through `codex app-server`, does that thread appear in the Codex
desktop sidebar and remain readable/resumable by its thread ID?

## Approach

1. Start a disposable stdio app-server client.
2. Create a non-ephemeral, read-only thread rooted at the OfferLoop repository.
3. Name it `OfferLoop 原生会话验证`.
4. Run one harmless turn that only returns a fixed confirmation message.
5. Inspect the Codex desktop thread list and read the thread by ID.
6. Continue the same thread once to prove resumption.

## Safety

- Does not change OfferLoop production code or configuration.
- Uses a read-only Codex sandbox.
- Does not access or modify Feishu data.
- Leaves one clearly named test thread so sidebar visibility can be inspected.

## Verdict: VALIDATED

### What worked

- `thread/start` created native thread
  `019fa268-8999-79b1-bef7-d2a43bfc81a6`.
- `thread/name/set` gave it the visible title
  `OfferLoop 原生会话验证`.
- The Codex desktop thread list returned the thread under the OfferLoop
  working directory.
- The first read-only turn completed with `原生会话验证成功`.
- A second message sent to the same thread completed with
  `原生会话续聊成功`, proving that the native thread can be resumed.

### What didn't

- The first version of the probe expected `turn/completed` to repeat the
  thread ID. This Codex build omits that field from the notification, so the
  disposable client kept waiting after the turn had already completed.

### Surprises

- Threads created through `app-server` are listed by the desktop app, while
  threads created through the current `codex exec` worker are persisted and
  resumable but are not returned in the sidebar list.

### Recommendation for the real build

Replace the workbench's per-message `codex exec` child process with one
long-lived app-server client. Create and name a native thread for each
workbench conversation, store that thread ID, use `turn/start` for follow-ups,
stream item deltas to the workbench, and use native interrupt/archive methods
for stop and archive.
