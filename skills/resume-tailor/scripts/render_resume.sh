#!/usr/bin/env bash
# Adapted from Pluto-Mo/personal-career-os under the MIT License.
# Resume Tailor renderer. See ../THIRD_PARTY_LICENSES.md.
set -euo pipefail

HTML="${1:?用法: render_resume.sh <resume.html> [输出基名]}"
NAME="${2:-resume}"
TIMEOUT="${RESUME_CRAFT_RENDER_TIMEOUT:-30}"

case "$NAME" in
  .|..|*/*|*\\*|*.pdf|*.PDF|*.png|*.PNG)
    echo "错误: 输出基名不能包含路径或扩展名: $NAME" >&2
    exit 2
    ;;
esac

HTML_ABS="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
OUT_DIR="$(dirname "$HTML_ABS")"
PDF="$OUT_DIR/$NAME.pdf"
PNG="$OUT_DIR/$NAME.png"
FILE_URL="file://${HTML_ABS// /%20}"

BROWSER=""
for candidate in \
  google-chrome chromium chromium-browser microsoft-edge msedge \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  if command -v "$candidate" >/dev/null 2>&1 || [ -x "$candidate" ]; then
    BROWSER="$candidate"
    break
  fi
done

if [ -z "$BROWSER" ]; then
  echo "错误: 未找到 Chrome、Chromium 或 Edge，无法生成 PDF。" >&2
  exit 2
fi

PROFILE="$(mktemp -d "${TMPDIR:-/tmp}/resume-tailor-browser.XXXXXX")"
cleanup() {
  rm -rf -- "$PROFILE"
}
trap cleanup EXIT INT TERM

rm -f -- "$PDF" "$PNG"
"$BROWSER" \
  --headless \
  --disable-gpu \
  --hide-scrollbars \
  --disable-background-networking \
  --disable-component-update \
  "--user-data-dir=$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --no-pdf-header-footer \
  "--print-to-pdf=$PDF" \
  "$FILE_URL" >/dev/null 2>&1 &
BROWSER_PID=$!

DEADLINE=$((SECONDS + TIMEOUT))
LAST_SIZE=0
STABLE_CHECKS=0
while kill -0 "$BROWSER_PID" 2>/dev/null; do
  if [ -s "$PDF" ]; then
    CURRENT_SIZE="$(wc -c < "$PDF" | tr -d ' ')"
    if [ "$CURRENT_SIZE" -eq "$LAST_SIZE" ]; then
      STABLE_CHECKS=$((STABLE_CHECKS + 1))
    else
      LAST_SIZE="$CURRENT_SIZE"
      STABLE_CHECKS=0
    fi
    if [ "$STABLE_CHECKS" -ge 5 ]; then
      kill "$BROWSER_PID" 2>/dev/null || true
      wait "$BROWSER_PID" 2>/dev/null || true
      break
    fi
  fi
  if [ "$SECONDS" -ge "$DEADLINE" ]; then
    kill "$BROWSER_PID" 2>/dev/null || true
    wait "$BROWSER_PID" 2>/dev/null || true
    echo "错误: 浏览器渲染超时。" >&2
    exit 3
  fi
  sleep 0.2
done
wait "$BROWSER_PID" 2>/dev/null || true

if [ ! -s "$PDF" ]; then
  echo "错误: PDF 渲染失败。" >&2
  exit 3
fi

PAGES=""
if command -v pdfinfo >/dev/null 2>&1; then
  PAGES="$(pdfinfo "$PDF" 2>/dev/null | awk '/^Pages:/ {print $2; exit}')"
fi
if [ -z "$PAGES" ]; then
  PAGES="$(grep -aoE '/Type ?/Pages?' "$PDF" | grep -c 'Page$')" || true
fi
if [ "$PAGES" != "1" ]; then
  echo "错误: PDF 必须恰好一页，当前检测到 ${PAGES:-未知} 页。" >&2
  exit 4
fi

if command -v pdftoppm >/dev/null 2>&1; then
  pdftoppm -png -r 180 -f 1 -singlefile "$PDF" "$OUT_DIR/$NAME" >/dev/null 2>&1
elif command -v sips >/dev/null 2>&1; then
  sips -s format png "$PDF" --out "$PNG" >/dev/null
else
  echo "错误: 缺少 pdftoppm 或 sips，无法生成视觉检查 PNG。" >&2
  exit 5
fi

if [ ! -s "$PNG" ]; then
  echo "错误: PNG 生成失败。" >&2
  exit 5
fi

echo "PDF: $PDF"
echo "PNG: $PNG"
echo "页数: 1"
