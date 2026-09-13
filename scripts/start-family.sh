#!/usr/bin/env bash
# scripts/start-family.sh — 本机一键起 lab 家族 4 后端 + live vitest + gate
#
# 用途: 在本机 (Git Bash / macOS / Linux) 模拟 .github/workflows/ci.yml 的核心步骤,
# 跑通 lab 家族 contract-test 完整 live 验证。仿 saas-identity-platform-contract-test
# 同名脚本（2026-09-02 端口分段落地时补齐，见 conventions §6）。
#
# 前提 (CI runner 自动满足, 本机要手动确保):
#   1. 5 sibling 仓已在 ../lab-management-system-{shared,msw,aspnetcore,springboot,nextjs}/
#      (suite 作为 multi-repo-family 用 gitlink 挂载, 本仓库目录下 output/ 自带)
#   2. 共享 PG 可达 (本机走 Tailscale 100.79.128.25:5432, 库 lab_dev;
#      3 真后端 + msw 共库是「前端不可区分」的物理基础)
#   3. dotnet 8 SDK + JDK 21 + Maven + Node 24 已装
#   4. 4 端口 5200/5201/5204/5205 空闲（conventions §6 lab=5200 段）
#
# 与 ci.yml 区别:
#   - 不 git clone (本机 sibling 已在)
#   - 不 docker 起 PG (本机走 Tailscale 远程 PG)
#   - trap cleanup EXIT 自动 kill 4 后端子进程 (含 Ctrl+C)
#   - healthcheck 路径与 ci.yml 同源 (改一处必须同步另一处)
#
# 用法:
#   cd output/lab-management-system-contract-test
#   bash scripts/start-family.sh
#
# 退出码:
#   0 全部通过 (vitest 无契约分叉 + trace shape 断言过 + gate exit 0)
#   1 任一 healthcheck 失败 / trace shape 不符 / gate 非 0
#   2 前置检查失败
#
# 注: live vitest 发现契约分叉是 contract-test 的本职输出, 不算脚本故障 ——
#     exit code 以 trace shape + L5/L0.5 gate 为准 (与 saas 版一致, vitest
#     failed 只打日志不改变 exit code)。

set -euo pipefail

# === 路径定位 ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SUITE_ROOT="$(cd "$CT_ROOT/../.." && pwd)"

# sibling 仓都在 suite 根的 output/ 下, 与 contract-test 平级
SHARED_DIR="$SUITE_ROOT/output/lab-management-system-shared"
MSW_DIR="$SUITE_ROOT/output/lab-management-system-msw"
ASPNETCORE_DIR="$SUITE_ROOT/output/lab-management-system-aspnetcore"
SPRINGBOOT_DIR="$SUITE_ROOT/output/lab-management-system-springboot"
NEXTJS_DIR="$SUITE_ROOT/output/lab-management-system-nextjs"

mkdir -p "$CT_ROOT/.runtime-logs"

# === 1. 前置检查 ===
echo "=== [1/6] 工具链 + sibling 仓 + 端口 ==="
missing_tools=()
for t in node npm dotnet mvn java python curl; do
  if ! command -v "$t" >/dev/null 2>&1; then
    missing_tools+=("$t")
  fi
done
if [ ${#missing_tools[@]} -gt 0 ]; then
  echo "FAIL: 缺工具链: ${missing_tools[*]}" >&2
  exit 2
fi

missing_repos=()
for d in "$SHARED_DIR" "$MSW_DIR" "$ASPNETCORE_DIR" "$SPRINGBOOT_DIR" "$NEXTJS_DIR"; do
  if [ ! -d "$d" ]; then
    missing_repos+=("$d")
  fi
done
if [ ${#missing_repos[@]} -gt 0 ]; then
  echo "FAIL: 缺 sibling 仓: ${missing_repos[*]}" >&2
  echo "  suite 用 gitlink 挂载, 仓应该在 $SUITE_ROOT/output/lab-management-system-*/" >&2
  exit 2
fi
echo "  ✓ 5 sibling 仓齐全 + 7 工具齐"

# 端口 preflight: 上次跑没清的残留进程占着 5200 段端口就 kill。
# 只杀匹配已知后端进程名的进程, 不动用户其他 node 工作。
# Windows 上必须用 taskkill (kill -TERM 在 Git Bash 下杀不掉 native 进程)。
echo "  检查 4 端口 LISTENING 残留进程..."
for p in 5200 5201 5204 5205; do
  pids=$(netstat -ano 2>/dev/null | awk -v port=":$p$" '$2 ~ port"$" && $4 == "LISTENING" {print $5}' | sort -u)
  for pid in $pids; do
    if [ -n "$pid" ] && [ "$pid" != "0" ]; then
      pname=$(powershell -NoProfile -Command "(Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName" 2>/dev/null | tr -d '\r')
      case "$pname" in
        node|java|dotnet|Lab.AspNetCore)
              echo "    端口 :$p 被 $pid ($pname) 占用, taskkill /F"
              taskkill //F //PID "$pid" > /dev/null 2>&1 ;;
        *)    echo "    端口 :$p 被 $pid ($pname) 占用 — 不是已知后端, 不杀, 让用户决定";;
      esac
    fi
  done
done
sleep 1
echo "  ✓ 端口 preflight 完成"

# === 2. gen-shared (读 shared 仓 OpenAPI 生成各后端客户端代码) ===
echo ""
echo "=== [2/6] gen-shared (nextjs + springboot) ==="
# nextjs: npm run gen:shared — 读 ../lab-management-system-shared/generated/openapi/openapi.yaml
# springboot: bash scripts/gen-shared.sh — TypeSpec codegen（OpenAPI → Java client）;
#   DB schema 消费走 scripts/scaffold-entities.sh（DB-First, ADR-0025/0033, Flyway 已退役）
# aspnetcore: NSwag 在 csproj build 时自动跑, 不需要单独 step
# msw: handlers/handlers-array.ts 由 shared emit:handlers 生成, 不需要单独 step
(cd "$NEXTJS_DIR" && npm run gen:shared 2>&1 | tail -3)
(cd "$SPRINGBOOT_DIR" && bash scripts/gen-shared.sh 2>&1 | tail -5)

# === 3. 后台起 4 后端 ===
echo ""
echo "=== [3/6] 后台起 4 后端 (lab=5200 段, conventions §6) ==="
PIDS=()

# lab 家族 JWT 三件套（别复用 saas 的 issuer/audience —— 4 后端 dev token
# 解码器只认自己家族的 claim, 跨家族 token 即 401）。
LAB_JWT_ENV="JWT_SIGNING_KEY=dev-key-32-bytes-minimum-length! JWT_ISSUER=lab-management-system JWT_AUDIENCE=lab-management-system-clients"

# msw: npm start（不是 npm run dev —— tsx watch 热重载时 process.env 丢失,
# JWT_SIGNING_KEY 缺失 signAccessToken 抛 500, saas 版同坑）。
# msw 仓无 .env.local, JWT 三件套 + PORT 显式传。
(cd "$MSW_DIR" && nohup env $LAB_JWT_ENV PORT=5200 npm start >"$CT_ROOT/.runtime-logs/msw.log" 2>&1) & PIDS+=($!)

# aspnetcore: SERVER_PORT shim 接线 + ASPNETCORE_URLS 双保险（dotnet run 默认
# launch profile 会带自己的 ASPNETCORE_URLS, 显式覆盖才稳）。
# DB 共库语义（conventions contract-test-run-live.md）：3 真后端 + msw 都连 lab_dev。
# PG 密码真值从本仓 gitignored .env.production 提取（那里是 lab_prod, 只取密码,
# 库名强制换 lab_dev）；LAB_PG_PASSWORD 显式给值时优先。
LAB_PG_HOST="${LAB_PG_HOST:-100.79.128.25}"
LAB_PG_PASSWORD="${LAB_PG_PASSWORD:-}"
if [ -z "$LAB_PG_PASSWORD" ]; then
  LAB_PG_PASSWORD=$(grep -E '^DATABASE_URL=' "$ASPNETCORE_DIR/.env.production" 2>/dev/null \
    | head -1 | sed -n 's/.*Password=\([^;]*\).*/\1/p')
fi
if [ -z "$LAB_PG_PASSWORD" ]; then
  LAB_PG_PASSWORD=$(grep -E '^DATABASE_PASSWORD=' "$SPRINGBOOT_DIR/.env.production" 2>/dev/null | head -1 | cut -d= -f2-)
fi
: "${LAB_PG_PASSWORD:=changeme}"
ASPNETCORE_PG_URL="Host=${LAB_PG_HOST};Port=5432;Database=lab_dev;Username=postgres;Password=${LAB_PG_PASSWORD}"
(cd "$ASPNETCORE_DIR" && nohup env $LAB_JWT_ENV SERVER_PORT=5204 ASPNETCORE_URLS="http://+:5204" \
  LAB_DATA_PROVIDER=memory LAB_SSO_PROFILE=no-sso \
  DATABASE_URL="$ASPNETCORE_PG_URL" \
  dotnet run --project src/Lab.AspNetCore.csproj >"$CT_ROOT/.runtime-logs/aspnetcore.log" 2>&1) & PIDS+=($!)

# springboot: SERVER_PORT relaxed binding。同上共库 lab_dev（JDBC 四件套）。
(cd "$SPRINGBOOT_DIR" && nohup env $LAB_JWT_ENV SERVER_PORT=5205 \
  DATABASE_URL="jdbc:postgresql://${LAB_PG_HOST}:5432/lab_dev" \
  DATABASE_USER=postgres DATABASE_PASSWORD="$LAB_PG_PASSWORD" DATABASE_NAME=lab_dev \
  mvn -q spring-boot:run >"$CT_ROOT/.runtime-logs/springboot.log" 2>&1) & PIDS+=($!)

# nextjs: dev script 已带 -p 5201（package.json）; .env.local 已有 DATABASE_URL 等。
(cd "$NEXTJS_DIR" && nohup npm run dev >"$CT_ROOT/.runtime-logs/nextjs.log" 2>&1) & PIDS+=($!)

cleanup() {
  echo ""
  echo "=== cleanup: kill ${#PIDS[@]} children + grandchildren ==="
  for p in "${PIDS[@]}"; do kill -TERM "$p" 2>/dev/null || true; done
  pkill -f Lab.AspNetCore     2>/dev/null || true
  pkill -f spring-boot:run    2>/dev/null || true
  pkill -f "next dev"         2>/dev/null || true
  pkill -f "next-server"      2>/dev/null || true
  pkill -f "tsx src/server.ts" 2>/dev/null || true
  sleep 2
}
trap cleanup EXIT INT TERM

# === 4. healthcheck (90s 串行, 与 ci.yml 同) ===
echo ""
echo "=== [4/6] healthcheck 4 后端 (90s 串行) ==="
healthcheck() {
  local name=$1 url=$2
  for i in $(seq 1 90); do
    if curl -sf -o /dev/null --max-time 2 "$url"; then
      echo "  ✓ $name up after ${i}s"
      return 0
    fi
    sleep 1
  done
  echo "  ✗ $name FAIL within 90s at $url" >&2
  echo "  --- $name log tail-30 ---" >&2
  tail -n 30 "$CT_ROOT/.runtime-logs/$name.log" >&2 || true
  return 1
}

healthcheck msw        "http://localhost:5200/healthz"
healthcheck aspnetcore "http://localhost:5204/health"
healthcheck springboot "http://localhost:5205/actuator/health"
healthcheck nextjs     "http://localhost:5201/api/health"

# === 5. live vitest ===
echo ""
echo "=== [5/6] live vitest ==="
echo "  CONTRACT_TARGETS=msw,aspnetcore,springboot,nextjs"
# vitest 失败不中断 — contract-test 的目的是发现契约分叉, vitest failed 是结果不是故障。
# 由 [6/6] trace.json shape + L5 软告警统计覆盖率。
set +e
(
  cd "$CT_ROOT" && \
  CONTRACT_TARGETS="msw,aspnetcore,springboot,nextjs" TRACE_MAP=1 npx --no vitest run
)
VITEST_EXIT=$?
set -e
echo "  vitest exit: $VITEST_EXIT (non-zero = 发现契约分叉, 看 [6/6] trace.json 详情)"

# === 6. trace.json shape + L5 alignment + gate ===
echo ""
echo "=== [6/6] trace.json shape + L5 alignment + gate ==="

# 6a. trace.json shape 断言（lab 家族：112 SSOT 端点全覆盖 + mode=live）
(
  cd "$CT_ROOT" && python - <<'PY'
import json, sys
d = json.load(open(".state/trace.json", encoding="utf-8"))
assert d.get("schema") == 1, f"schema={d.get('schema')!r}"
mode = d.get("mode")
targets = d.get("contract_targets", [])
non_inert = [t for t in d.get("tests", []) if not t.get("inert")]
fns = {fid for t in non_inert for fid in t.get("fns", [])}
if mode != "live":
    print(f"FAIL: trace mode={mode!r} 不是 live（probeLive 是否撞上后端中途崩溃？）")
    sys.exit(1)
if not targets:
    print("FAIL: contract_targets 为空")
    sys.exit(1)
print(f"  ✓ mode={mode!r} targets={targets}")
print(f"  ✓ {len(non_inert)} non-inert tests, {len(fns)} 个 fn ID")
PY
)

# 6b. L5 alignment
(cd "$SUITE_ROOT" && python scripts/checks/_alignment.py -p lab-management-system-contract-test)

# 6c. gate
(cd "$SUITE_ROOT" && python scripts/gate.py -p lab-management-system-contract-test)

echo ""
echo "=== 全部通过。Ctrl+C 或 exit 触发 cleanup。==="
