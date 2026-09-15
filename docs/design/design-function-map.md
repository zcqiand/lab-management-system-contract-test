# 设计与功能对齐 — 建筑工程实验室管理系统契约一致性验证仓

> 人填、人评审。机器只检查功能 ID 存在性。
> 回答一个问题：**这个功能子项，落到哪段代码、哪张表、哪个权限码上？**
> 答不上来的行，说明设计没做完，别开工。

## 映射表

| 功能子项 ID | 页面/组件 | 接口 | 数据表 | 权限码 | 设计稿 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| M96.F01.I01 | — | harness: `src/normalize.ts` `ALWAYS_VOLATILE` | — | — | [ADR-0015 §Decision.2 normalize 剔除清单](../../../../docs/adr/0015-contract-test-repo.md) | 已上线 |
| M96.F01.I02 | — | harness: `src/normalize.ts` `normalizeDate` | — | — | ADR-0015 §Decision.2 | 已上线 |
| M96.F01.I03 | — | harness: `src/normalize.ts` `normalize` + `stable`（null ≡ 缺失） | — | — | ADR-0015 §Decision.2 | 已上线 |
| M96.F01.I04 | — | harness: `src/normalize.ts` `stable`（递归 key/数组排序） | — | — | ADR-0015 §Decision.2 | 已上线 |
| M96.F02.I01 | — | harness: `src/compare.ts` `compareStatuses` / `tests/*.test.ts` 各种 GET 列表 + POST 创行族 + auth/login POST | lab_dev PG 共库（三真后端直比；比对基准 probes[0]） | — | ADR-0015 §Decision.2 + [REQ-2026-013 §2 AC-1](../requirements/REQ-2026-013-ssot-full-coverage.md) | 开发中 |
| M96.F02.I02 | — | harness: `src/compare.ts` `compareBodies` + `tests/*.test.ts` 详情族 + summary `/stats` | 同上 | — | ADR-0015 §Decision.2 + REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I03 | — | `tests/auth-read.test.ts:permissions` + `tests/contracts.test.ts:GET {id}` + `tests/inspection-catalog.test.ts:brands` 写族 | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I04 | — | `tests/auth-read.test.ts:menus` + 各种 PUT 更新族 | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I05 | — | `tests/auth-read.test.ts:sso.authorize` + 各种 DELETE 删除族 | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I06 | — | `tests/inspection-catalog-write.test.ts:POST /catalog/models` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I07 | — | `tests/inspection-catalog-write.test.ts:PUT /catalog/models/{code}` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I08 | — | `tests/inspection-catalog-write.test.ts:DELETE /catalog/models/{code}` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I09 | — | `tests/inspection-catalog-write.test.ts:POST /catalog/specs` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I10 | — | `tests/inspection-catalog-write.test.ts:PUT /catalog/specs/{code}` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I11 | — | `tests/inspection-catalog-write.test.ts:DELETE /catalog/specs/{code}` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I12 | — | `tests/inspection-catalog-write.test.ts:POST /catalog/grades` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I13 | — | `tests/inspection-catalog-write.test.ts:PUT /catalog/grades/{code}` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I14 | — | `tests/inspection-catalog-write.test.ts:DELETE /catalog/grades/{code}` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I15 | — | `tests/inspection-dictionary-write.test.ts:POST /inspection/objects` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I16 | — | `tests/inspection-dictionary-write.test.ts:PUT /inspection/objects/{code}` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I17 | — | `tests/inspection-dictionary-write.test.ts:links/specialty-object POST/DELETE` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I18 | — | `tests/inspection-dictionary-write.test.ts:parameters POST/PUT` + `specialty-object GET list` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I19 | — | `tests/inspection-dictionary-write.test.ts:standards POST/PUT` + `links/object-parameter` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I20 | — | `tests/inspection-dictionary-write.test.ts:links/object-standard` + `links/standard-parameter` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I21 | — | `tests/inspection-dictionary-write.test.ts:DELETE` 收口族 + `tests/param-interfaces-write.test.ts:POST/PUT/DELETE` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I22 | — | `tests/param-interfaces-write.test.ts:DELETE + links` + `tests/report-names-write.test.ts:POST` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I24 | — | `tests/report-names-write.test.ts:PUT {code}` + 3 junction links POST | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I25 | — | `tests/report-names-write.test.ts:DELETE {code}` + 3 junction links DELETE | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I27 | — | `tests/calculation-methods-write.test.ts:POST` + `tests/technical-requirements-write.test.ts:POST` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I28 | — | `tests/calculation-methods-write.test.ts:PUT` + `tests/technical-requirements-write.test.ts:PUT` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I30 | — | `tests/calculation-methods-write.test.ts:DELETE` + `tests/technical-requirements-write.test.ts:DELETE` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F02.I31 | — | 收口族：`tests/samples-write.test.ts` + `tests/test-records-write.test.ts` + `tests/sample-receipts-write.test.ts` + `tests/report-flow-write.test.ts` + `tests/auth-write.test.ts` | — | — | REQ-2026-013 §2 AC-1 | 开发中 |
| M96.F03.I01 | — | harness: `src/targets.ts` `TARGETS`（nextjs:5201 / aspnetcore:5204 / springboot:5205） | — | — | [conventions §6](../../../../docs/conventions/multi-repo-family.md) + ADR-0015 | 已上线 |
| M96.F03.I02 | — | harness: `src/targets.ts` `selectedTargets` + `TargetError` | — | — | ADR-0015 §Decision.2 | 已上线 |

---

**变更日志**：

- 2026-09-02 创建（27 个 M96.F02.I## + M96.F01/F03 已上线 6 个，结构对齐 saas-identity-platform-contract-test/docs/design/design-function-map.md）。

## 约定

1. **权限码 = 功能子项 ID。** 前端按钮的权限判断直接写 ID。
2. 一个接口服务多个子项时，多行重复写。不要为表好看而合并 —— 合并后看不清接口还有没有别的调用方。
3. 状态列必须与功能清单一致。不一致以功能清单为准。
4. **2026-09-02 起 I## 不再 1:1 映射端点**——上表「接口」列填的是承载该 I## 测试的入口文件 + 端点概览；具体端点映射见 `docs/functions/function-tree.md` § M96.F02 同名行。