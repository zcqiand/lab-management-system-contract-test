# CHANGELOG — lab-management-system-contract-test

格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
（2026-11-22 首建——同步纪律 2026-11-04 立，本仓此前缺档，历史变更见 git log 与
`.state/session.json`。）

## [Unreleased]

- test(fk-chain): 写端点前置链收口（2026-11-22 live 复验 31 失败 A/C 类 CT 侧欠账）。
  ① 新增 `src/chains.ts` 自建前置链 helper：contract → receipt → sample 三段式
  （receipts-act-history 同款；categoryCode 取 report-names 真值），配
  registerReceiptPairCleanup / deleteReceiptPair（FK RESTRICT 顺序：sample 先于
  receipt 先于 contract，runCleanups FIFO）。② samples-write：五用例弃固定假
  `SEED_RECEIPT=…0001`（lab_dev 无此行 → nextjs FK 23503 裸 500），I03 走
  registerCleanup、I07 两用例（runCleanups 消费后执行）直删前置链。③
  test-records-write I02 弃固定假 sampleId，走 createRealSample 全链。④
  calculation-methods-write：POST body 补 `testingStandardCode: "GB 13788-2024"`
  （V018 三键 PK，nextjs R6-2 对缺省 400；真实种子码，虚构码 23503 → 500）。⑤
  calculation-methods-write I02 POST 前补 per-target 预清 DELETE（三后端共库同一
  固定种子键，dup-check 后端先跑后跑者吃 400 dup——springboot V018 批 live 实证
  换序双向复现，照本文件 DELETE describe 既有写法）。
  验证：CONTRACT_TARGETS=nextjs,aspnetcore,springboot 四写文件 33/33 全绿
  （2026-11-22，后端=nextjs 5201 + aspnetcore/springboot 修复后新代码）；
  L0/L0.5/L2/L3/L4 门全过（gate L5 见挂账）。
  挂账（禁顺手做，待人裁）：gate L5 require_live 与 stack.json trace_env 7 targets
  （nextjs,aspnetcore,springboot,rails,fastapi,go,django）绑定——fnReporter A1.5
  探活要求声明 targets 全活才写 mode=live，本机常态只起 2-3 后端（2026-09-29
  contract-test-run-live.md 人裁）→ gate L5 自 replay 必落 mode=unit → exit 2。
  stack.json 禁改、trace_env 不可被调用方 env 覆盖（load_trace trace_env 优先），
  矛盾上呈人裁：改 trace_env 分档 / 起满 7 后端 / L5 降档。本批验收面=3 健康后端
  （nextjs/aspnetcore/springboot 全 413cb67 新代码）定向 live 全绿。

- test(ct): rules target 注册 + 五域 12 用例重定向 + calc 用例（R2 Task 12，
  REQ-2026-043，2026-11-22）。①五处注册：targets.ts（rules 5214）/prewarm.ts/
  fnReporter.ts HEALTH_PATHS（/healthz）/compare.test.ts 目标清单 7→8。②五域 12
  文件 target 集 `["nextjs","rules"]` 定格（nextjs=迁移参照，rules=canonical）。
  ③tests/calc.test.ts 新建 M06.F10.I01/I02（SSOT 静态解析过；锚回填待 shared I 行
  --approve；calc=rules 单目标，nextjs 无 calc 面）。④technical-requirements-write
  POST 前置幂等 DELETE 净场（R2 Ruling：[nextjs,rules] 共库，nextjs 先建 sentinel
  行 → rules dup 400；两侧 dup 语义一致=400，旧常态 springboot JPA merge upsert
  不触发——用例结构修，非后端缺陷）。⑤task12 trace 面：trace_cmd 12 文件 live 重跑
  mode=live executed_per_describe_min=2 → gate L5 绿；calc 用例 live trace 映射挂账
  （单目标 floor 结构性塌缩，随 nextjs calc 面或豁免裁定另批）。
  验证：CONTRACT_TARGETS=nextjs,rules 五域+calc 13 文件 138/138 全绿；gate exit 0。
  挂账（禁顺手做）：stack.json trace_env 加 `,rules`（hook 拦模型，人改——见上条
  L5 矛盾，本批 live 验收全走调用方 env 显式 CONTRACT_TARGETS=nextjs,rules）。
