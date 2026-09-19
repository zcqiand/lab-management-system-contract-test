# Schemathesis 契约模糊测试 —— 运行说明与分工

> 什么时候读我：要跑/改 `npm run test:schemathesis`，要加豁免，或想知道
> Schemathesis 和 vitest 套件各守哪块地盘时。背景设计见 suite
> `docs/superpowers/specs/2026-09-17-tsp-ssot-cleanup-design.md` Phase E。

## 1. 怎么跑

```bash
# 与 vitest live 模式同语义：CONTRACT_TARGETS 声明了哪些真后端就打哪些
CONTRACT_TARGETS=nextjs,springboot npm run test:schemathesis

# 未设置 CONTRACT_TARGETS → 打印 skip 退出 0（不算红）
# 列了但目标连不上/登录失败 → 退出非零（「声明即必须可达」铁律）
```

- 目标端口：nextjs :5201 / aspnetcore :5204 / springboot :5205（conventions §6）
- 前置：本机 anaconda Python 3.11 + `schemathesis==4.27.3`（版本钉子见
  `schemathesis/requirements.txt`；`python -m schemathesis.cli --version` 可验证）
- 认证：run.py 先 `POST /api/auth/login`（alice/dev123456 dev 密码登录，恒真链，
  响应字段名是 `token`）拿 Bearer，再 `--header Authorization` 注入
- 每端点用例数默认 25，可用 `SCHEMATHESIS_MAX_EXAMPLES` 调
- JSON 报告落在 `schemathesis-report/<target>.json`（失败复现命令在里面）

## 2. 与 vitest 套件的分工

| | Schemathesis | vitest（tests/） |
|---|---|---|
| 定位 | schema 一致性 / 边界模糊面（大面积属性测试） | 关键功能语义断言 |
| 覆盖 | 契约声明的全部 GET 端点 × 随机参数/边界值 | 精选关键路径 |
| 特有能力 | 未文档化 5xx、状态码/响应 schema 越契约 | **四方 cross-backend normalize 全等比对**（Schemathesis 做不了） |
| 写路径 | Phase 1 只跑 GET（§E2：随机写体污染 lab_dev 共库且无法 teardown） | 按 probe 白名单打写端点并 teardown |

两者互补不互替：Schemathesis 抓「某个后端在某个随机输入下越出契约」，
vitest 抓「三个后端对同一请求的归一化响应必须全等」。任一红了都是契约问题。

## 3. 配置与豁免纪律

配置在 `schemathesis/config.toml`（**不是 yaml**：schemathesis 4.27.3 的
config loader 只认 TOML，.yaml 会被按 TOML 解析直接报错；且根节点没有
include-method，GET-only 过滤由 run.py 的 `--include-method GET` 承担）：

- checks = `not_a_server_error` + `status_code_conformance` +
  `response_schema_conformance`，其余关闭
- stateful phase 显式关闭（会打写端点，违反 Phase 1 只读边界）
- spec 路径 `../lab-management-system-shared/generated/openapi/openapi.yaml`；
  shared 生成器有已知怪癖——枚举值裸 `=` 让 YAML 1.1 解析成 value 标签，
  PyYAML/schemathesis 加载即炸，run.py 会先规格化成带引号的临时副本

**豁免铁律**（写进 config 注释位的同一要求）：

1. 逐端点豁免（`[[operations]]` + include-path/include-method）必须带理由注释
2. 真后端 bug / 契约漂移（未文档化 5xx、响应缺字段）**禁止豁免**——那正是
   SSOT 清理要抓的猎物，报告上去修源头
3. 只有「已文档化/有意的怪癖」（错误信封形状、wrapDict junction 语义等）
   才允许逐端点关检查；禁止无理由整仓降级

## 4. 门禁状态

Phase E1 以 npm script + 本文档落地；**未接 gate**（`.harness/stack.json` 不动，
门禁变更走独立评审，见设计文档 §E3）。live pilot 稳定后再议挂 L4。
