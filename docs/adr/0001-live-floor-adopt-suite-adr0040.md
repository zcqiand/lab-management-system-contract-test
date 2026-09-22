# ADR-0001: live 执行面下限机制采信 suite ADR-0040（执行侧记录）

- 状态：已批准（随 ADR-0040 T-3 实现批落地，2026-09-22）
- 关联：REQ-2026-014（本仓 docs/requirements/）；suite 仓 docs/adr/0040-gate-live-executed-floor-degraded-signal.md（裁决本体：信号来源 A 产数 + gate 消费、WARNING 全档 + full 档红、AC-1 锚「探活全过但执行面塌缩」）

## 决策

本仓不另立裁决：live_floor 三值（declared/effective/executed_per_describe_min）由本仓 fnReporter v8 按 suite ADR-0040 产出，门行为（L5 消费）在 suite 仓。本篇是 lab-ct 本地 ADR 目录的首篇存档，记录采信关系与实现映射：

- 探针层 side channel：src/live-floor.ts + src/http.ts 出口登记 + tests/globalSetup.ts 清残留
- fnReporter v8：tests/fnReporter.ts computeLiveFloor，trace 顶层 live_floor，schema 只增不改
