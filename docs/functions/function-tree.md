# 功能清单（Function Tree）— 建筑工程实验室管理系统契约一致性验证仓

> **全体系唯一锚点。** 需求、流程、设计、测试都引用这里的 ID。
> 不在这里的 ID 是悬空引用，L5 门会拦。**改功能，先改这份表。**
>
> 本仓使用**保留命名空间 `M96`**（lab 家族 infra 段：M97=shared emit，M98=nextjs 接线，M99=msw）。
> 它不镜像 BASE 业务模块（M00-M06）——声明的是「验证层自己的功能」。
> 与 saas-identity-platform-contract-test 的 M96 同角色同编号（跨仓检查方式是命名空间归属，不是集合比对）。
> 依据：suite `docs/adr/0015-contract-test-repo.md` + `0013-alignment-has-two-directions.md`。

## 编号规则

| 层级 | 名称 | 格式 | 含义 |
|---|---|---|---|
| 一级 | 功能模块 | `M01` | 业务域边界，通常对应一级菜单 |
| 二级 | 功能 | `M01.F01` | 一个完整业务步骤 / 独立闭环流程 / 数据管理页面 |
| 三级 | 功能子项 | `M0x.F0y.I0z` | 技术交付单元 / 权限挂载点。对应一个 API 接口、页面组件、图表区块或权限控制点（后端仓 I 级 = 端点） |

**硬规则**

1. 编号单调递增，永不复用。废弃改状态，不删行。
2. 子项编号必须以父级为前缀。
3. 一个子项 = 一个权限点。权限码即 ID，不另起一套编码。
4. 拆不出子项的功能 → 它其实是子项，往上并。子项超 20 个 → 它其实是模块，往下拆。

**状态**：`规划` | `开发中` | `已上线` | `已废弃`
**子项类型**：`页面` | `标签页` | `查询` | `按钮` | `报表` | `接口`

---

## 模块总览

| 模块 ID | 模块名称 | 说明 | 状态 |
|---|---|---|---|
| M01 | （init_project 占位） | 从未是真实功能；本仓真实模块见 M96 | 已废弃 |
| M96 | 契约一致性验证 | 黑盒 HTTP 打每个后端，验「前端不可区分」 | 开发中 |

---

## M01 （init_project 占位）

| 功能 ID | 功能名称 | 说明 | 状态 |
|---|---|---|---|
| M01.F01 | （init_project 占位） | 从未是真实功能 | 已废弃 |

### M01.F01 （init_project 占位）

| 子项 ID | 名称 | 类型 | 说明 | 状态 |
|---|---|---|---|---|
| M01.F01.I01 | （init_project 占位） | 查询 | 从未是真实功能 | 已废弃 |

---

## M96 契约一致性验证

| 功能 ID | 功能名称 | 说明 | 状态 |
|---|---|---|---|
| M96.F01 | normalize 契约 | 把「同输出」从『逐字节相同』翻译成『前端不可区分』（日期归一化/key 排序/null≡缺失/剔 token；共库不剔 ID，含 msw 才剔） | 已上线 |
| M96.F02 | 四方比对 | 同一请求打 msw/nextjs/aspnetcore/springboot → status 全等 + normalize 后全等；msw 是 oracle | 开发中 |
| M96.F03 | 目标声明与可达性 | CONTRACT_TARGETS 声明了就必须可达，不许静默跳过 | 已上线 |

### M96.F01 normalize 契约

| 子项 ID | 名称 | 类型 | 说明 | 状态 |
|---|---|---|---|---|
| M96.F01.I01 | 剔除非确定性字段 | 接口 | token/refreshToken 总是剔（lab 字段名是 token 非 accessToken）；ID 默认保留（3 真后端共 lab_dev 库），仅比对含 msw 时传 `ID_KEYS` | 已上线 |
| M96.F01.I02 | 日期归一化到 UTC Z | 接口 | Jackson 出 `+00:00`、System.Text.Json 出 `Z`，OpenAPI 层面都合法 | 已上线 |
| M96.F01.I03 | 缺失与显式 null 等价 | 接口 | Spring `NON_ABSENT` 省略 null，ASP.NET 默认输出 null | 已上线 |
| M96.F01.I04 | 递归排序 object key 与数组 | 接口 | 字段顺序与集合顺序不属于契约 | 已上线 |

### M96.F02 四方比对

> **编号约定（2026-09-02 起）**：M96.F02.I## 的 I## 不再 1:1 映射单个端点。
> 同一 I## 由多个端点共用（如 M96.F02.I01 同时被 auth/login POST + contracts GET list + summary GET 等覆盖）；
> trace.json 把这些 test→fn 的反向引用都收进来，L5 alignment 看 test_refs[fid] 集合是否非空（任意一个端点有 trace 命中即 OK）。
> 详见 [REQ-2026-013 §6 风险与回滚](../requirements/REQ-2026-013-ssot-full-coverage.md) 与 suite `docs/adr/0015-contract-test-repo.md`。

| 子项 ID | 名称 | 类型 | 说明 | 状态 |
|---|---|---|---|---|---|
| M96.F02.I01 | 四方比对组 01 — 认证/列表/创建族 | 接口 | 覆盖端点：POST `/auth/login`、GET 各种列表（contracts/summary/permissions/catalog/receipts/samples/test-records）、POST 创行族（contracts/catalog × 4 /dictionary × 4 /param-interfaces/report-names/calculation-methods/technical-requirements/samples/test-records/receipts）、junction link POST × 7（REQ-2026-013） | 开发中 |
| M96.F02.I02 | 四方比对组 02 — 会话/创/详情族 | 接口 | 覆盖端点：GET `/auth/me`、POST 创行（续 I01 集合）、GET 详情（contracts/{id}/catalog/{code}/dictionary/{code}/param-interfaces/{code}/report-names/{code}/samples/{id}/test-records/{id}/receipts/{id}/history 等）、summary `/stats`（REQ-2026-013） | 开发中 |
| M96.F02.I03 | 四方比对组 03 — 权限/详情族 | 接口 | 覆盖端点：GET `/auth/permissions`、GET 详情族（续）、catalog brands 写族（POST/PUT/DELETE）（REQ-2026-013） | 开发中 |
| M96.F02.I04 | 四方比对组 04 — 菜单/更新族 | 接口 | 覆盖端点：GET `/auth/menus`、PUT 更新族（contracts/catalog brands PUT）（REQ-2026-013） | 开发中 |
| M96.F02.I05 | 四方比对组 05 — SSO 跳板/删除族 | 接口 | 覆盖端点：GET `/auth/sso/authorize`、DELETE 删行族（contracts DELETE / catalog brands DELETE / dictionary specialties DELETE）（REQ-2026-013） | 开发中 |
| M96.F02.I06 | 四方比对组 06 — catalog models POST | 接口 | 覆盖端点：POST `/catalog/models` 创（REQ-2026-013） | 开发中 |
| M96.F02.I07 | 四方比对组 07 — catalog models PUT | 接口 | 覆盖端点：PUT `/catalog/models/{code}` 改（REQ-2026-013） | 开发中 |
| M96.F02.I08 | 四方比对组 08 — catalog models DELETE | 接口 | 覆盖端点：DELETE `/catalog/models/{code}` 删（REQ-2026-013） | 开发中 |
| M96.F02.I09 | 四方比对组 09 — catalog specs POST | 接口 | 覆盖端点：POST `/catalog/specs` 创（REQ-2026-013） | 开发中 |
| M96.F02.I10 | 四方比对组 10 — catalog specs PUT | 接口 | 覆盖端点：PUT `/catalog/specs/{code}` 改（REQ-2026-013） | 开发中 |
| M96.F02.I11 | 四方比对组 11 — catalog specs DELETE | 接口 | 覆盖端点：DELETE `/catalog/specs/{code}` 删（REQ-2026-013） | 开发中 |
| M96.F02.I12 | 四方比对组 12 — catalog grades POST | 接口 | 覆盖端点：POST `/catalog/grades` 创（REQ-2026-013） | 开发中 |
| M96.F02.I13 | 四方比对组 13 — catalog grades PUT | 接口 | 覆盖端点：PUT `/catalog/grades/{code}` 改（REQ-2026-013） | 开发中 |
| M96.F02.I14 | 四方比对组 14 — catalog grades DELETE | 接口 | 覆盖端点：DELETE `/catalog/grades/{code}` 删（REQ-2026-013） | 开发中 |
| M96.F02.I15 | 四方比对组 15 — dictionary objects POST | 接口 | 覆盖端点：POST `/inspection/objects` 创（REQ-2026-013） | 开发中 |
| M96.F02.I16 | 四方比对组 16 — dictionary objects PUT | 接口 | 覆盖端点：PUT `/inspection/objects/{code}` 改（REQ-2026-013） | 开发中 |
| M96.F02.I17 | 四方比对组 17 — specialty-object link/unlink | 接口 | 覆盖端点：POST/DELETE `/inspection/links/specialty-object`（upsert，幂等）（REQ-2026-013） | 开发中 |
| M96.F02.I18 | 四方比对组 18 — dictionary parameters POST/PUT | 接口 | 覆盖端点：POST/PUT `/inspection/parameters` + specialty-object GET list（REQ-2026-013） | 开发中 |
| M96.F02.I19 | 四方比对组 19 — dictionary standards + object-parameter link | 接口 | 覆盖端点：POST/PUT `/inspection/standards`、POST/DELETE `/inspection/links/object-parameter`（REQ-2026-013） | 开发中 |
| M96.F02.I20 | 四方比对组 20 — object-standard link + standard-parameter link | 接口 | 覆盖端点：POST/DELETE `/inspection/links/object-standard` + `/standard-parameter`（REQ-2026-013） | 开发中 |
| M96.F02.I21 | 四方比对组 21 — dictionary CRUD 收口 + 参数界面 | 接口 | 覆盖端点：DELETE `/inspection/{objects,parameters,standards}` + POST/PUT/DELETE `/param-interfaces`（REQ-2026-013） | 开发中 |
| M96.F02.I22 | 四方比对组 22 — param-interfaces + report-names POST | 接口 | 覆盖端点：DELETE `/param-interfaces/{code}`、POST/DELETE `/param-interfaces/links`、POST `/report-names`（REQ-2026-013） | 开发中 |
| M96.F02.I24 | 四方比对组 24 — report-names PUT + 3 junction links POST | 接口 | 覆盖端点：PUT `/report-names/{code}` + POST × 3 report-names/links/{object,standard,parameter}（REQ-2026-013） | 开发中 |
| M96.F02.I25 | 四方比对组 25 — report-names DELETE + 3 junction links DELETE | 接口 | 覆盖端点：DELETE `/report-names/{code}` + DELETE × 3 report-names/links/{...}（REQ-2026-013） | 开发中 |
| M96.F02.I27 | 四方比对组 27 — calculation-methods POST + technical-requirements POST | 接口 | 覆盖端点：POST `/calculation-methods`（复合主键）+ POST `/technical-requirements`（三段主键）（REQ-2026-013） | 开发中 |
| M96.F02.I28 | 四方比对组 28 — calculation-methods PUT + technical-requirements PUT | 接口 | 覆盖端点：PUT `/calculation-methods/{object}/{parameter}` + `/technical-requirements/{object}/{parameter}/{standard}`（REQ-2026-013） | 开发中 |
| M96.F02.I30 | 四方比对组 30 — calculation-methods DELETE + technical-requirements DELETE | 接口 | 覆盖端点：DELETE `/calculation-methods/{object}/{parameter}` + `/technical-requirements/{object}/{parameter}/{standard}`（REQ-2026-013） | 开发中 |
| M96.F02.I31 | 四方比对组 31 — 收口族（samples/test-records/receipts/flow/auth POSTs） | 接口 | 覆盖端点：POST/PUT/DELETE `/samples`、`POST/PUT/DELETE/PATCH /test-records`、`POST/PUT/DELETE /receipts`、`POST /receipts/flow`、`POST /auth/refresh` `logout` `switch-tenant` `sso/callback`（REQ-2026-013） | 开发中 |

> **不进入 M96.F02.I## 集合的端点**（CLAUDE.md §2 禁止手挑）：
> 上表 27 个 I## 由 tests/*.test.ts 实际使用的 ID 集合确定（`grep -hE "describe.skipIf.*M96" tests/*.test.ts | grep -oE "M96\.F[0-9]+\.I[0-9]+" | sort -u`）。
> SSOT 112 端点全数被这 27 个组覆盖（check_ssot_coverage.mjs 验证）—— 见 [REQ-2026-013 §1 验收标准](../requirements/REQ-2026-013-ssot-full-coverage.md)。

### M96.F03 目标声明与可达性

| 子项 ID | 名称 | 类型 | 说明 | 状态 |
|---|---|---|---|---|
| M96.F03.I01 | 目标端口声明 | 接口 | msw:5173 / nextjs:3001 / aspnetcore:5001 / springboot:8081（2026-09-02 与 saas 家族错开），显式字面量，非 env 兜底 | 已上线 |
| M96.F03.I02 | 声明即必须可达 | 接口 | `CONTRACT_TARGETS` 列了却连不上 = 红；名字不认识 = 抛错，不静默忽略 | 已上线 |

---

## 维护约定

- 谁改功能，谁改表，同一个 commit。
- `规划` → `开发中`：必须先有需求文档引用它。
- `开发中` → `已上线`：L5 会警告它缺设计映射与测试引用。警告不阻断，由人裁量。
- **2026-09-02 起 I## 不再 1:1 映射端点**：M96.F02.I## 由 tests/*.test.ts 实际使用的 ID 集合确定；trace.json 的 test_refs[fid] 是反向引用（多 test → 1 fn）。
- **不给未真正运行的比对挂功能 ID**：四方比对未启用时，那条提示测试的描述里不写 `M96.*`，
  故 `M96.F02.I01` 在未跑活后端前不会被 trace 记为已覆盖。