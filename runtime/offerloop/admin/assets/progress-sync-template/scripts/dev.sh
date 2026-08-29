#!/usr/bin/env bash
# `npm run dev` 入口；按 SANDBOX_ID 是否非空判断运行环境：
#   - SANDBOX_ID 非空（沙箱平台注入应用所属沙箱 ID）→ 直接跑 dev.js
#       （保活 / restart loop / 文件日志 —— 沙箱生产形态）。脚本同步由平台 pod 启动阶段做过，
#       dev 入口不再额外 `npm run upgrade`。
#   - 否则（本地）→ 走 miaoda app sync 兜底 + 跑 dev-local.js：纯 stdout、崩了就崩、Agent 友好。
# 显式想跑本地路径可用 `npm run dev:local`（绕过 SANDBOX_ID 判断）。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -n "${SANDBOX_ID:-}" ]; then
  exec node "$SCRIPT_DIR/dev.js" "$@"
fi

if [ ! -f "$SCRIPT_DIR/dev-local.js" ]; then
  echo "[dev] scripts/dev-local.js 缺失；先跑 \`npx -y @lark-apaas/miaoda-cli@latest app sync\` 同步平台脚本" >&2
  exit 1
fi

# 本地启动前先跑一次 miaoda app sync：同步 platform-controlled 内容 + 升 @lark-apaas/* 到
# latest + 迁移老 npm scripts。沙箱不走这里（SANDBOX_ID 分支已经 exec return）。
npx -y @lark-apaas/miaoda-cli@latest app sync || echo "[dev] miaoda app sync 失败，按现状继续" >&2

exec node "$SCRIPT_DIR/dev-local.js" "$@"
