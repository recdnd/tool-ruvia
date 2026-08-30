#!/bin/bash
# Ruvia · localhost 薄殼（接 machine/specs/02-localhost.md）
#
# 純靜態單頁（index.html / script.js / style.css ＋ docs、map、menu、icons 子夾）。
# 不設 REC_SERVE_CMD ── 用 rec-serve 的預設 no-store server（[REC-SERVE::NO_STORE]）；
# 這裡不能用 `serve -s`，SPA rewrite 會把子夾的 404 吃成 index.html。

REC_PROJECT="Ruvia"
REC_PORT="6060"
REC_LOCAL_PATH="/"
# REC_BUILD_CMD=""   ← 無 build step
# REC_SERVE_CMD=""   ← 故意留空，見上

REC_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

_d="$REC_PROJECT_DIR"
while [[ "$_d" != "/" && ! -d "$_d/sov/machine/lib" ]]; do _d="$(dirname "$_d")"; done
[[ -d "$_d/sov/machine/lib" ]] || _d="$(cd "$REC_PROJECT_DIR/../../DungeonsRoot" 2>/dev/null && pwd)"
MACHINE_LIB="${MACHINE_LIB:-$_d/sov/machine/lib}"

source "$MACHINE_LIB/rec-serve.sh"
rec_serve "$@"
