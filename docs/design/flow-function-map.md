# 流程与功能对齐 — 建筑工程实验室管理系统契约一致性验证仓

> 人填、人评审。机器只检查引用的功能 ID 是否存在。
> 评审时把流程图投出来，逐行念「这一步靠哪些功能完成」。念不出来的行，
> 要么流程是空的，要么功能是缺的。这就是对齐的全部意义。

## 说明

本仓是验证层（黑盒 HTTP 打 4 个后端，验「前端不可区分」），不承载任何业务流。
contract-test 的全部 `M96.F02.I##` 都属于「harness 自闭环」——没有业务流程承载，
「同时打 4 端」直写在 `tests/*.test.ts`，无需画流程图。

依据：suite `docs/adr/0015-contract-test-repo.md` + `0013-alignment-has-two-directions.md`。

## FLOW-01 主流程

无。contract-test 不承载任何业务流。

## FLOW-02 异常流程

无。

---

## 孤儿功能

不在任何流程里但合法的功能。**没解释的孤儿 = 没人要的功能。**

| 功能 ID | 为什么合法 |
|---|---|
| M96.F01.I01 | normalize 契约的 VOLATILE 档（token/refreshToken 默认剔除）。harness 私有常量 `ALWAYS_VOLATILE` 提供，无流程视角——它是「同输出」判定的输入，不是任何业务流程的步骤。 |
| M96.F01.I02 | normalize 契约的 FORMAT 档（日期归一）。harness 私有函数 `normalizeDate` 提供；前端读到的字段形态由 OpenAPI 串联，不经业务流。 |
| M96.F01.I03 | normalize 契约的 FORMAT 档（缺失 ≡ 显式 null）。harness `normalize` + `stable` 实现；Spring `NON_ABSENT` 与 ASP.NET 默认输出的方言差在同一处吃掉。 |
| M96.F01.I04 | normalize 契约的 FORMAT 档（递归 key/数组排序）。harness `stable` 实现；字段顺序契约在 OpenAPI 层定，不入流程。 |
| M96.F02.I01 | 四方比对组 01（auth/login POST + 各种 GET 列表 + POST 创行族 + junction link POST）。覆盖 SSOT 端点：POST `/auth/login`、GET `/contracts`、`/summary`、`/auth/permissions`、GET 列表（catalog/dictionary/param-interfaces/report-names/calculation-methods/technical-requirements/samples/test-records/receipts）、POST 创行族、junction link POST × 7。读操作无业务流程；写操作为「创一行+立刻清理」流程视角无法承载。harness 自闭环。 |
| M96.F02.I02 | 四方比对组 02（auth/me GET + 创/详情族 + summary stats）。GET `/auth/me` + POST 创行 + GET 详情（contracts/{id} / catalog/{code} / dictionary/{code} / param-interfaces/{code} / report-names/{code} / samples/{id} / test-records/{id} / receipts/{id}/history 等）+ summary `/stats`。harness 自闭环。 |
| M96.F02.I03 | 四方比对组 03（permissions GET + 详情族 + catalog brands 写族）。harness 自闭环。 |
| M96.F02.I04 | 四方比对组 04（menus GET + 更新族）。harness 自闭环。 |
| M96.F02.I05 | 四方比对组 05（sso.authorize GET + 删除族）。harness 自闭环。 |
| M96.F02.I06 | 四方比对组 06（catalog models POST 创）。harness 自闭环。 |
| M96.F02.I07 | 四方比对组 07（catalog models PUT 改）。harness 自闭环。 |
| M96.F02.I08 | 四方比对组 08（catalog models DELETE 删）。harness 自闭环。 |
| M96.F02.I09 | 四方比对组 09（catalog specs POST 创）。harness 自闭环。 |
| M96.F02.I10 | 四方比对组 10（catalog specs PUT 改）。harness 自闭环。 |
| M96.F02.I11 | 四方比对组 11（catalog specs DELETE 删）。harness 自闭环。 |
| M96.F02.I12 | 四方比对组 12（catalog grades POST 创）。harness 自闭环。 |
| M96.F02.I13 | 四方比对组 13（catalog grades PUT 改）。harness 自闭环。 |
| M96.F02.I14 | 四方比对组 14（catalog grades DELETE 删）。harness 自闭环。 |
| M96.F02.I15 | 四方比对组 15（dictionary objects POST 创）。harness 自闭环。 |
| M96.F02.I16 | 四方比对组 16（dictionary objects PUT 改）。harness 自闭环。 |
| M96.F02.I17 | 四方比对组 17（specialty-object link/unlink）。upsert 幂等。harness 自闭环。 |
| M96.F02.I18 | 四方比对组 18（dictionary parameters POST/PUT + specialty-object GET list）。harness 自闭环。 |
| M96.F02.I19 | 四方比对组 19（dictionary standards POST/PUT + object-parameter link）。harness 自闭环。 |
| M96.F02.I20 | 四方比对组 20（object-standard link + standard-parameter link）。harness 自闭环。 |
| M96.F02.I21 | 四方比对组 21（dictionary CRUD 收口 + 参数界面）。harness 自闭环。 |
| M96.F02.I22 | 四方比对组 22（param-interfaces 收口 + report-names POST 创）。harness 自闭环。 |
| M96.F02.I24 | 四方比对组 24（report-names PUT + 3 junction links POST）。harness 自闭环。 |
| M96.F02.I25 | 四方比对组 25（report-names DELETE + 3 junction links DELETE）。harness 自闭环。 |
| M96.F02.I27 | 四方比对组 27（calculation-methods POST + technical-requirements POST）。harness 自闭环。 |
| M96.F02.I28 | 四方比对组 28（calculation-methods PUT + technical-requirements PUT）。harness 自闭环。 |
| M96.F02.I30 | 四方比对组 30（calculation-methods DELETE + technical-requirements DELETE）。harness 自闭环。 |
| M96.F02.I31 | 四方比对组 31（收口族：samples/test-records/receipts/flow/auth POSTs）。harness 自闭环。 |
| M96.F03.I01 | harness 目标端口声明（`src/targets.ts` `TARGETS`）。跨切元能力，端口是 conventions §6 显式字面量；套件既不消费也无业务流程「声明端口」一步。 |
| M96.F03.I02 | harness「声明即必须可达」不变量（`src/targets.ts` `selectedTargets` + `TargetError`）。跨切不变量的执行点，不挂流程。 |

---

**变更日志**：

- 2026-09-02 创建（27 个 M96.F02.I## 全部入孤儿清单，结构对齐 saas-identity-platform-contract-test/docs/design/flow-function-map.md）。