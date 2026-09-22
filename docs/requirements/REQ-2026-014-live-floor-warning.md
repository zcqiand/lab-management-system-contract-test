# REQ-2026-014 live 门控断言真实执行目标 <2 时 gate 应给出显式降级信号

| 项 | 值 |
|---|---|
| 提出人 | suite-operator（tracker Task 2.5，`2026-09-18-family-leftovers-remediation`） |
| 提出日期 | 2026-09-20 |
| 优先级 | P1 |
| 状态 | 已实现（ADR-0040 T-3，2026-09-22） |
| 关联 ADR | ADR-0037（gate 分档 unit/full）；ADR-0035（seven-stage act mode）；ADR-0016（contract-test live mode） |

## 1. 需求描述

> tracker Task 2.5 原话（摘自 task brief）：`skipIf(!live)` 结构性洞——live 断言全部被 skip 时 contract-test 照样全绿，「门绿=没测」。实现涉 gate-runner 语义（属 exit 2 类需另批人裁后计划），本 REQ **只圈定问题与验收口径，不锁实现、不做红绿边界裁决**。

### 1.1 现状与既有防线

本仓 live 面目前有四道防线（`tests/fnReporter.ts` 头注 v5–v7、suite `scripts/lib/harness.py` A1 / spec §3.5）：

1. fnReporter v6 在 trace.json 写顶层 `mode` + `contract_targets`，harness 对 `require_live=true` 的仓拒绝 unit 模式 trace（ADR-0016 A1 防御）；
2. fnReporter v7 flush 前 healthz 探活，非全活写 `mode="unit"`（防 beforeAll 抛错被 vitest 标 skip 绕过 A1）；
3. spec §3.5 skip=0 硬门：live 模式下任何 inert 条目 → L5 红；
4. ADR-0037 unit 档直接排除 L5（commit 边界可负担迭代）。

**洞在哪儿**：这四道防线合起来只有「红 / 排除」两态，没有「降级警告」这一中间信号。live 门控断言的**真实执行面**（真正打到真后端比对的目标数）没有任何一处按目标数下限给出机读信号——执行面塌到 <2 时，各防线要么静默（unit 档排除 L5，gate 照绿），要么直接红到 exit 2（require_live 契约错，人被迫停下）。中间态「跑是跑了，但只有 1 个目标真比对上了」与「3 目标全比对」在 gate 输出里不可区分。

### 1.2 触发场景（历史实锤）

| 场景 | 指纹 | 实锤出处 |
|---|---|---|
| 单后端在线（其余未起 / 端口漂移） | CONTRACT_TARGETS 声明 3 目标，实际只有 1 个 healthz 通；比对基准面静默塌缩 | 5.57 批 5205：live 断言对新代码生效需重启，当时若只有单目标在线则 live 面静默为空 |
| CONTRACT_TARGETS 缺 export | dev shell 未 export，trace_cmd 复用 unit trace → require_live 必错；或 L4 以 unit 模式全绿收场 | memory `gate-live-trace-requires-contract-targets-export`（2026-09 在册） |
| 后端跑旧代码（改契约未重启） | healthz 全通、断言打在旧实现上，绿/红与当前 HEAD 无关 | 5.57 批 5205；ADR-0035 act 模式 9/9 收链时依赖「已同步」的口头判断 |
| reporter 收不到 skip 事件（已修，同盲区前科） | `onTaskUpdate` 收不到 `describe.skipIf` 过滤的 inner test → inert 计数假 0 | fnReporter v5（onFinished 重写）；tracker Task 2.4 复盘 |

### 1.3 需求

**live 门控断言真实执行的目标数 < 2 时，gate 层应给出显式信号——下限是 WARNING 级（gate.json 可见、可机读），红/绿边界属设计决策，留给后续 ADR 人裁。** 本 REQ 不锁实现路径，候选二选一（或其组合）：

| 候选 | 机制 | 取舍 |
|---|---|---|
| A：fnReporter trace 扩展 | flush 时把 EFFECTIVE_TARGETS（探活真值）与各 describe 实际执行目标数写进 trace.json 顶层（如 `live_floor: { declared, effective, executed_per_describe_min }`），harness L5 读 trace 出 WARNING 并落 gate.json | 优点：信号在数据源头，saas 同款仓改同一份 fnReporter 模式即可；缺点：动 trace.json schema（现 schema:1），两仓 fnReporter 要同步，且「executed 目标数」在 vitest 任务树里要再爬一层 |
| B：gate.py L5 判定 | harness.load_trace 后按 trace 既有字段（mode / contract_targets / inert 计数）在 suite 侧算执行面下限，不足则 gate.json 该门加 `degraded: true` + WARNING 输出 | 优点：只改 suite 一处，两仓（lab+saas）零改动自动生效；缺点：suite 只见 trace 聚合值，「每个 describe 真打到几个目标」这层信息 trace 里现在没有，判定粒度受限于 schema，可能仍需 A 的字段先行 |

两候选共同的前置事实：现有 trace.json 顶层 `contract_targets` 是**声明值与探活真值的合流**（v7 探活失败会清空），但没有「探活通过的目标里，断言实际跑了几个」的下限表达——这是本需求要补的信息缺口。

### 澄清记录

| 疑问 | 澄清结论 | 澄清人 | 日期 |
|---|---|---|---|
| 下限为什么是 2 不是 1 或全量？ | 与 `describe.skipIf` 的 `targets.length >= 2` 判定一致：比对语义需要基准 + 被测（Phase 2 去 msw 后 oracle = probes[0]），单目标无比对意义。全量（=声明数）下限会与 ADR-0037 unit 档的「按需收窄」冲突 | tracker brief 预置 | 2026-09-20 |
| 红还是绿？ | 不在本 REQ 裁决。候选空间（WARNING-only / WARNING+full 档红 / 一律红）全部留给 ADR；实现涉 gate-runner 语义属 exit 2 类，须人裁后另立计划 | tracker brief 预置 | 2026-09-20 |
| 与 ADR-0037 unit 档冲突吗？ | 不冲突。unit 档本就排除 L5，live 面整体不在场；本需求约束的是 **full 档 / 显式跑 live** 时执行面塌缩的可见性，两档语义正交 | tracker brief 预置 | 2026-09-20 |

## 2. 验收标准（草案级——供后续 ADR/实现批次修订，本 REQ 不锁死）

| 编号 | 场景（给定） | 操作（当） | 预期（则） |
|---|---|---|---|
| AC-1 | 探活全过（mode=live）但 describe 执行面塌缩至 <2（评审 minor① 修正锚点——「仅 1 目标在线」现状已被 v7+require_live 设防，非本需求验收对象） | 单测级故障注入（Task 4.2 先例同型）+ gate 级 fixture | 输出含可机读降级标记（trace.live_floor + gate.json live_floor_degraded）；full 档 rc=1 |
| AC-2 | ≥2 个目标后端在线，CONTRACT_TARGETS 显式声明 | 同上 | 无降级标记；gate 输出与现状语义一致 |
| AC-3 | 现网基线 | 同上 | 现有 412 条 trace（inert 且携带 fns = 0 条）语义不回退：条数、inert 判定、skip=0 硬门行为均不变；本需求只**加**信号，不改任何既有判定 |

## 3. 任务拆解

| 任务 ID | 任务描述 | 类型 | 负责人 | 预估 | 状态 |
|---|---|---|---|---|---|
| T-1 | 本 REQ 立项文档（本文件） | 文档 | suite-operator | 0.05 d | 已完成 |
| T-2 | ADR：裁决候选 A/B、红绿边界、WARNING 是否升级 | 决策 | human | — | 已完成（ADR-0040） |
| T-3 | 实现（候选定后另立计划；涉 gate-runner 属 exit 2 类） | 开发 | — | — | 已完成（本批 commit） |

## 4. 功能影响（需求与功能对齐的唯一位置）

| 功能 ID | 功能名称 | 影响类型 | 说明 | 关联任务 |
|---|---|---|---|---|
| — | 无本仓功能 ID 影响 | — | 本需求影响 suite gate 层（gate.py / harness.py）与 fnReporter 基建，不新增/变更/删除任何 M96.* 契约端点功能 ID；gate-runner 语义属 suite 保留层，被约束仓不为其定义功能 ID | T-2/T-3 |

## 5. 流程影响

gate-runner 判定链可能新增 WARNING 级输出（候选 B）或 trace schema 增量（候选 A）——均属 ADR 裁决范围，本 REQ 阶段无流程变更。

## 6. 影响面与关联

- **影响面**：lab + saas 两 contract-test 仓共 2 处 fnReporter（`output/lab-management-system-contract-test/tests/fnReporter.ts`、`output/saas-identity-platform-contract-test/tests/fnReporter.ts`）+ suite `gate.py` L5 链。saas 仓存在同款洞，本 REQ 只在 lab 仓立项圈定，**不改 saas 仓任何文件**；saas 侧立项/实现随 ADR 后批次跟进。
- **关联**：
  - ADR-0037 unit 档——live 面在 unit 档本就排除，不冲突（见 §1.3 澄清）；
  - ADR-0035 seven-stage act mode——act 收链曾依赖「已同步」口头判断，本信号是其门禁侧补强；
  - ADR-0016 contract-test live mode——A1 防御（require_live）是本需求叠加的既有红/绿层；
  - memory `gate-live-trace-requires-contract-targets-export`——缺 export → unit trace 复用 → require_live 必错，是触发场景之一。

## 7. 风险与回滚

| 风险 | 影响面 | 缓解 | 回滚方式 |
|---|---|---|---|
| WARNING 被常态化忽视，降级标记形同虚设 | 两 contract-test 仓 | 红/绿边界（含 WARNING 是否在 full 档升级为红）留给 ADR，人裁时一并定升级策略 | 不适用（本 REQ 只立项） |
| trace schema 增量破坏旧 reader（harness 兼容性） | suite harness + 两仓 fnReporter | 候选 A 若被选中，schema 字段只增不改，旧 reader 忽略未知键 | 删新增字段 |
| 探活真值与断言执行面之间存在时间窗（probe 通过后后端才死） | 判定精度 | 已知限界：本需求给的是下限信号不是正确性证明；窗口内塌缩由断言本身变红兜底 | — |

## 8. 范围之外

1. 候选选择与红/绿边界裁决（ADR，T-2）
2. saas 仓的立项文档（同款洞，另批跟进）
3. gate-runner 语义的任何代码/配置改动（exit 2 类，人裁后另立计划）

---

**变更日志**：

- 2026-09-20 创建 REQ-2026-014（tracker Task 2.5：圈定 live 执行面 <2 目标的降级信号问题，只写文档不实现）
- 2026-09-22 状态推进至已实现（ADR-0040 T-3：fnReporter v8 live_floor 三值 + suite L5 消费 + full 档红，端到端 live 实证见 tracker Task 2.5 Step 2 勾闭批注）
