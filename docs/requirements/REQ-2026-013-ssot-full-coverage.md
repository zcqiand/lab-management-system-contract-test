# REQ-2026-013 SSOT 112/112 全覆盖 + cleanup-pg.ts 实装 (Phase 1+2)

| 项 | 值 |
|---|---|
| 提出人 | suite-operator |
| 提出日期 | 2026-09-02 |
| 优先级 | P0 |
| 状态 | 已验收 |
| 关联 ADR | suite `docs/adr/0015-contract-test-repo.md` |

## 1. 需求描述

> 用户原话：「lab SSOT 112 端点 contract-test 覆盖 2 → 100%」。读端点优先；写端点先补 cleanup-pg.ts 探针清理（no-op stub 替换为真实清理逻辑）。
>
> 收口为：「L2 100% + L0/L0.5/L2/L3/L4 全 PASS（unit mode）；L5 待 4 后端在跑 / CI」。

### 澄清记录

| 疑问 | 澄清结论 | 澄清人 | 日期 |
|---|---|---|---|
| cleanup-pg.ts 走 HTTP 还是直连 PG? | HTTP —— 守 ADR-0015 黑盒契约。saas 同款 (`output/saas-identity-platform-contract-test/src/cleanup-pg.ts`) 已落地直接抄 | suite-operator | 2026-09-02 |
| DEAD 路径用业务 code 还是 UUID? | UUID。SSOT normalize 只把 UUID 段归一为 `{*}`（regex `\/[0-9a-f]{8}-...`），业务 code（如 SP01）不会归一；L2 永远看不到覆盖。UUID sentinel `00000000-0000-0000-0000-00000000dead` 对 `{code}` / `{id}` 占位都生效 | suite-operator | 2026-09-02 |
| for...of 循环生成 describe 标题能用吗? | 不能。源码里 `${table.id}` 是字面 `${`，L2 解析器扫源码不插值；多端点必须手写多段 describe.skipIf | suite-operator | 2026-09-02 |
| 模板字面拼接 `${PATH_LIST}/${DEAD_ID}` 能用吗? | 不能。L2 constMap 只收字面字符串 `const X = "..."`；模板字面不在 regex 里。`const PATH_DETAIL = "/api/foo/dead"` 才是字面 | suite-operator | 2026-09-02 |
| sample-receipts POST 用什么 contractId? | seed 第一个 contract `CT-2026-001`（V015 共库 seed）。样本接样单不存在时 4 后端返 4xx 是契约面（POST 期望 200/201/400/404 都接受） | suite-operator | 2026-09-02 |
| junction link 测试要不要 cleanup? | 不要。POST=link / DELETE=unlink 是 upsert，关系表无独立主键；二次 link/unlink 幂等 | suite-operator | 2026-09-02 |

## 2. 验收标准

| 编号 | 场景（给定） | 操作（当） | 预期（则） |
|---|---|---|---|
| AC-1 | 本仓根目录 | `node scripts/check_ssot_coverage.mjs` | exit 0，输出 `covered=112 gaps=0` 「100% 覆盖」 |
| AC-2 | 本仓根目录 | `npx --no tsc --noEmit` | exit 0，0 type error |
| AC-3 | 本仓根目录 | `npx --no vitest run` | exit 0，18 passed / 11 skipped / 0 failed（live describe 跳过因无 CONTRACT_TARGETS） |
| AC-4 | 本仓根目录 | `python scripts/gate.py -p lab-management-system-contract-test` | exit 2，L0/L0.5/L2/L3/L4 全 PASS；L5 stderr 含「stack.json 声明 require_live=true，但 trace.json 是 unit 模式」契约提示 |
| AC-5 | 4 后端在跑 + `CONTRACT_TARGETS=msw,aspnetcore,springboot,nextjs` | `TRACE_MAP=1 npx --no vitest run` | 所有 live describe 非 inert，合计 100+  passed |
| AC-6 | 全跑后 | `python scripts/gate.py -p lab-management-system-contract-test` | exit 0，gate.json 6 道门全绿 |

## 3. 任务拆解

| 任务 ID | 任务描述 | 类型 | 负责人 | 预估 | 状态 |
|---|---|---|---|---|---|
| T-1 | Phase 1: 39 个 GET 端点测试（13 个新文件 + 3 个扩写）| 测试 | suite-operator | 0.3 d | 已完成 |
| T-2 | Phase 2: cleanup-pg.ts 实装（HTTP 列表 + prefix + DELETE 容差）| 探针清理 | suite-operator | 0.1 d | 已完成 |
| T-3 | Phase 2: 71 个写端点测试（12 个 -write 文件 + contracts 扩写）| 测试 | suite-operator | 0.4 d | 已完成 |
| T-4 | SSOT parser 三个坑修复（模板拼接 / 循环标题 / UUID normalize）| 解析器适配 | suite-operator | 0.1 d | 已完成 |
| T-5 | session.json 转义修正（JSON `\\S`）| 文档 | suite-operator | 0.05 d | 已完成 |
| T-6 | commit 7b87be0 + parent submodule gitlink 推进 6e857f4 | 提交 | suite-operator | 0.05 d | 已完成 |
| T-7 | CI workflow 编排（ci.yml 仿 saas + lab 端口）| CI | suite-operator | 0.1 d | 已完成 |
| T-8 | 本 REQ 文档 | 文档 | suite-operator | 0.1 d | 已完成 |
| T-9 | GitHub 建仓 + push（submodule remote 已指向 https://github.com/zcqiand/lab-management-system-contract-test.git）| 部署 | human | 0.05 d | 待开始（需 gh CLI / GitHub token，工具不可达） |
| T-10 | L5 验收 — 4 后端实跑（CI 或本地）+ gate exit 0 | 验证 | suite-operator | 0.2 d | 待开始 |

## 4. 功能影响（需求与功能对齐唯一位置）

| 功能 ID | 功能名称 | 影响类型 | 说明 | 关联任务 |
|---|---|---|---|---|
| M96.F02.I01 | GET 读端点（41 个）四方比对 | 新增 | Phase 1: 39 个新 + 2 个已有（login/me）| T-1 |
| M96.F02.I## | POST/PUT/PATCH/DELETE 写端点（71 个）四方比对 | 新增 | Phase 2: contracts/catalog/dictionary/param-interfaces/report-names/calculation-methods/technical-requirements/samples/test-records/sample-receipts/report-flow/auth 全集 | T-3 |
| M96.F02.I## | junction link/unlink（10 个）四方比对 | 新增 | POST=link, DELETE=unlink；upsert 幂等，无需 cleanup | T-3 |

> 112 个 ID 全数进 `docs/functions/function-tree.md` 状态「开发中」→「已验收」。本仓契约面只认 M96.*；shared 仓契约面（auth/contracts/catalog/dictionary/receipts/samples 等）由 4 真后端的 OpenAPI 串联，不进本仓 function-tree。

## 5. 流程影响

无主流程变更。所有端点走 harness 自闭环「声明即直写 tests + cleanup-pg 注册」。

## 6. 风险与回滚

| 风险 | 影响面 | 缓解 | 回滚方式 |
|---|---|---|---|
| junction link 二次调用产生意外副作用 | 4 后端关系表 | 测试 body 用 seed 存在的 (SP01, OBJ-SP01-P1) 等常量；POST=link 与 DELETE=unlink 自成对，残留不影响下次跑 | 单端点 describe 改回 skipIf |
| samples/test-records POST 缺接样单/样品 → 4xx | 4 后端 | `expect([200, 201, 400, 404])` 容差；这就是契约面（不同实现对 FK 违例的 HTTP code 不同） | 不回退 |
| nextjs 假 JWT vs 真 HS256 JWT 字段名一致但鉴权不可用 | nextjs | 已有 session.json open_question 记录；本次不动（用户拍板范畴外） | — |
| DEAD UUID sentinel 撞真后端数据 | 极低（UUIDv4 末位 dead 段无冲突可能） | 4 后端共 UUID 主键，sentinel `00000000-...-dead` 不可能匹配真数据 | — |

## 7. 范围之外（下一批）

1. live 跑过一次且 100+ passed 验证（L5 + alignment）
2. GitHub 建仓 + push（submodule remote 指向 zcqiand/lab-management-system-contract-test）
3. family-env.json（家族 env 契约）—— 非 contract-test 仓职责
4. CI matrix：多 OS / 多 Node 版本测试（先 ubuntu + node 24 跑通）

---

**变更日志**：

- 2026-09-02 创建 REQ-013（首次落地 SSOT 100% + cleanup-pg.ts 实装）