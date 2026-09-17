#!/usr/bin/env python3
"""Schemathesis 契约模糊测试入口（TSP SSOT 清理 Phase E1，2026-09-17）+ ADR-0036 全 method。

用法（package.json 已接）：
    npm run test:schemathesis
    CONTRACT_TARGETS=nextjs,springboot python schemathesis/run.py

语义与现有 vitest 套件对齐（src/targets.ts 的镜像，Python 版）：
  - 未设置 CONTRACT_TARGETS      → 打印 skip 退出 0（mock/单元模式，不算红）
  - 设置了但名字不认识            → 退出非零
  - 列了但目标连不上 / 登录失败   → 退出非零（「声明即必须可达」铁律）

ADR-0036 §5：默认全 method 跑（GET/POST/PUT/PATCH/DELETE）；复杂端点（状态机 /
多步依赖）在 shared 仓 .tsp 里 // fuzz:skip 标注，emit-openapi.ts 注入 openapi.yaml
的 x-fuzz: skip 扩展。run.py 解析 openapi.yaml 找 x-fuzz: skip 端点，生成
schemathesis 4.x 的 --exclude-path + --exclude-method 对（path+method AND 排除）。
schemathesis 4.x CLI 无 --hooks；4.x 的 before_call hook 抛异常 = phase ERROR
不是 skip；唯一官方排除机制是 --exclude-path/--exclude-method。
teardown 由 config.toml [phases.stateful] enabled=true 自动跟踪 response.id 并
cleanup（不是 CLI --stateful=links，4.x stateful testing 默认模式就是 links）。

请求超时 60s：nextjs dev 单次 login 实测 7.5-8s（src/http.ts 同款水位）。
v0.1 起点；v0.2 加 invariant 差集兜底。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

# 与 src/targets.ts 同源（conventions §6 端口表）。残留的 msw 条目不在本相位处理。
TARGETS = {
    "nextjs": "http://localhost:5201",
    "aspnetcore": "http://localhost:5204",
    "springboot": "http://localhost:5205",
}

# 与 src/http.ts SEED_USER 同源（3 真后端 dev 目录共有账号；2026-09-17 实测：
# alice 可登录，admin 是 401——http.ts 注释里的 "admin" 是笔误，代码常量是 alice）。
SEED_USER = {"username": "alice", "password": "dev123456"}

SPEC = REPO.parent / "lab-management-system-shared" / "generated" / "openapi" / "openapi.yaml"
CONFIG = HERE / "config.toml"

LOGIN_TIMEOUT = 60  # 秒；nextjs dev login 实测 7.5-8s，留足余量
REQUEST_TIMEOUT = "60"  # schemathesis 单请求超时（秒）
MAX_EXAMPLES = os.environ.get("SCHEMATHESIS_MAX_EXAMPLES", "25")  # 每端点用例数
# 固定 seed 复现某次跑的用例集（报告 SUMMARY 里会打印本次 seed）：
# SCHEMATHESIS_SEED=<seed> CONTRACT_TARGETS=... python schemathesis/run.py
SEED = os.environ.get("SCHEMATHESIS_SEED")


def die(msg: str, code: int = 1) -> None:
    print(f"[schemathesis] FAIL: {msg}", file=sys.stderr)
    sys.exit(code)


def selected_targets() -> list[str]:
    raw = (os.environ.get("CONTRACT_TARGETS") or "").strip()
    if not raw:
        return []
    names = [n.strip() for n in raw.split(",") if n.strip()]
    unknown = [n for n in names if n not in TARGETS]
    if unknown:
        die(
            f"CONTRACT_TARGETS 里有不认识的目标: {', '.join(unknown)}。"
            f"可选: {', '.join(TARGETS)}",
            code=2,
        )
    return names


def login(base_url: str, name: str) -> str:
    """POST /api/auth/login 引导 Bearer token（no-sso dev 形态，字段名 token）。"""
    body = json.dumps(SEED_USER).encode("utf-8")
    req = urllib.request.Request(
        base_url + "/api/auth/login",
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=LOGIN_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        die(f"{name}: 登录失败 status={exc.code} body={detail}")
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        die(f"目标 {name} 连不上 —— 声明了就必须可达。原因: {exc}")
    token = data.get("token")
    if not token:
        die(f"{name}: 登录 200 但响应里没有 token")
    print(f"[schemathesis] {name}: login ok")
    return token


class TolerantLoader(yaml.SafeLoader):
    """容忍 TypeSpec 产物里的裸 '=' 枚举标量（YAML 1.1 解析成 value 标签，
    PyYAML SafeLoader 与 schemathesis 的加载器都直接炸）。"""


TolerantLoader.add_constructor(
    "tag:yaml.org,2002:value", lambda loader, node: loader.construct_scalar(node)
)


def normalize_spec() -> Path:
    """规格化 spec 到临时文件：容忍加载 → safe_dump（裸 '=' 会被加引号）。

    这是 shared 仓 openapi.yaml 生成器的已知怪癖（RequirementComparison
    枚举值 '=' 未加引号），修生成器属 shared 仓任务，本仓不越界改契约源。
    """
    if not SPEC.is_file():
        die(f"契约 spec 不存在: {SPEC}", code=2)
    spec = yaml.load(SPEC.read_text(encoding="utf-8"), Loader=TolerantLoader)
    out = Path(tempfile.gettempdir()) / "lab-mgmt-openapi-normalized.yaml"
    out.write_text(yaml.safe_dump(spec, allow_unicode=True), encoding="utf-8")
    return out


def fuzz_skip_args() -> list[str]:
    """读 openapi.yaml 的 x-fuzz: skip 扩展，转 schemathesis 4.x 的 --exclude-path +
    --exclude-method CLI 参数对（每个 (path, method) 一对）。

    ADR-0036 §5：复杂端点（状态机/多步依赖）走 shared 仓 .tsp // fuzz:skip 标注
    → emit-openapi.ts 后处理注入 openapi.yaml 的 x-fuzz: "skip" vendor 扩展。
    本函数是唯一读取点：单源 = openapi.yaml，避免与 shared .tsp 双源漂移。

    x-fuzz 出现位置（OpenAPI 3.x 规范都合法）：
      - PathItem 级（emit-openapi.ts 当前实现）→ 该 path 下所有 method 跳过
      - Operation 级（method 子对象）        → 单 method 跳过
    两者同时存在时：path 级优先（整个 path 跳过），operation 级不重复加。

    schemathesis 4.x 的官方排除机制是 --exclude-path + --exclude-method（path+method
    组合 AND 排除）；4.x 的 before_call hook 抛异常 = phase ERROR 不是 skip；
    4.x CLI 无 --hooks / --stateful。
    """
    if not SPEC.is_file():
        return []
    # lab 仓 openapi.yaml 有裸 '=' 枚举标量（RequirementComparison 怪癖），用
    # TolerantLoader（同 normalize_spec）容忍；fuzz:skip 路径不受影响
    spec = yaml.load(SPEC.read_text(encoding="utf-8"), Loader=TolerantLoader)
    args: list[str] = []
    paths = spec.get("paths", {}) if isinstance(spec, dict) else {}
    for path, ops in paths.items():
        if not isinstance(ops, dict):
            continue
        # OpenAPI 3.x PathItem 标准字段：summary/description/parameters + 7 个 HTTP method
        # x-* vendor extension 也可能出现在 PathItem 级（emit-openapi.ts 当前做法）
        standard_path_keys = {
            "summary", "description", "parameters",
            "get", "post", "put", "patch", "delete", "head", "options", "trace",
        }
        # PathItem 级 x-fuzz: skip → 该 path 下所有 standard method 全跳过
        if ops.get("x-fuzz") == "skip":
            for method_key in ops:
                if method_key in standard_path_keys:
                    args.extend(["--exclude-path", path, "--exclude-method", method_key.upper()])
                    print(
                        f"[schemathesis] fuzz:skip → --exclude-path {path} "
                        f"--exclude-method {method_key.upper()} (path-level)",
                        flush=True,
                    )
            continue  # path 级已处理，不再扫 operation 级
        # Operation 级 x-fuzz: skip → 单 method 跳过
        for method, op in ops.items():
            if not isinstance(op, dict):
                continue
            if method not in standard_path_keys:
                continue
            if op.get("x-fuzz") == "skip":
                args.extend(["--exclude-path", path, "--exclude-method", method.upper()])
                print(
                    f"[schemathesis] fuzz:skip → --exclude-path {path} "
                    f"--exclude-method {method.upper()}",
                    flush=True,
                )
    return args


def run_target(name: str, base_url: str, spec: Path) -> int:
    token = login(base_url, name)
    report_dir = REPO / "schemathesis-report"
    report_dir.mkdir(exist_ok=True)
    cmd = [
        sys.executable,
        "-m",
        "schemathesis.cli",
        "--config-file",
        str(CONFIG),  # 注意：--config-file 是顶级选项，必须放在 run 子命令之前
        "run",
        str(spec),
        "--url",
        base_url,
        "--header",
        f"Authorization: Bearer {token}",
        # ADR-0036 §5 范围扩：默认全 method 跑（GET/POST/PUT/PATCH/DELETE）。
        # 复杂端点（状态机/多步依赖）由 fuzz_skip_args() 按 openapi.yaml 的
        # x-fuzz: skip 扩展生成 --exclude-path + --exclude-method 对跳过。
        # stateful teardown 走 config.toml [phases.stateful] enabled=true。
        *fuzz_skip_args(),
        "--request-timeout",
        REQUEST_TIMEOUT,
        "-n",
        MAX_EXAMPLES,
        *(["--seed", SEED] if SEED else []),
        "--report",
        "json",
        "--report-json-path",
        str(report_dir / f"{name}.json"),
    ]
    env = dict(os.environ)
    # 后端全在 localhost；机器若有系统代理（HTTP_PROXY 等）必须放行本地回环。
    no_proxy = env.get("NO_PROXY", "")
    env["NO_PROXY"] = ",".join([p for p in (no_proxy, "localhost", "127.0.0.1") if p])
    print(f"[schemathesis] {name}: {' '.join(cmd[:8])} ...")
    return subprocess.run(cmd, env=env).returncode


def main() -> None:
    targets = selected_targets()
    if not targets:
        print("[schemathesis] CONTRACT_TARGETS 未设置 —— skip（与 vitest mock 模式同语义）")
        return
    spec = normalize_spec()
    failures = [t for t in targets if run_target(t, TARGETS[t], spec) != 0]
    if failures:
        die(f"以下目标 schemathesis 未通过: {', '.join(failures)}")
    print(f"[schemathesis] 全部目标通过: {', '.join(targets)}")


if __name__ == "__main__":
    main()
