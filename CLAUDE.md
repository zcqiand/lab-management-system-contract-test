# CLAUDE.md — 建筑工程实验室管理系统契约一致性验证仓

> 书稿配套仓 + harness 门禁仓双身份。入口，不是手册。L0 门强制上限 60 行。
> 本仓为《（书稿信息待补）》案例（待补）的可运行配套工程，是书稿代码块的 **source of truth**。

## 1. 项目定位

黑盒 HTTP 打 4 个后端（`msw`:5200 / `nextjs`:5201 / `aspnetcore`:5204 / `springboot`:5205，
conventions §6 lab=5200 段，2026-09-02 起与 saas 家族端口错开可并行），验证它们**对前端不可区分**。
保留命名空间 `M96`（lab 家族 infra 段，与 saas-contract-test 同角色同编号）。

**它不是什么**：不是后端的单元测试搬家；不是 E2E（不开浏览器）。
它回答「哪里不一致」，后端自己的测试回答「为什么」。

## 2. 铁律

- **「同输出」= 前端不可区分**。判定 = status 全等 + schema 校验 + `normalize()` 后全等
- **认证形态兼容（硬约束）**：后端两种 SSO 形态都必须能打——`no-sso`（dev 默认，
  admin/dev123456 直登）与真 saas OAuth 2.0（`LAB_SSO_PROFILE=default` + saas 家族在跑）。
  两种形态 `/api/auth/login` 契约面必须一致；测试不得假设 noop 假 token 语义
- **normalize 剔除清单是契约**：增删走 ADR。lab 响应 token 字段名是 `token`（非 accessToken）
- **默认不剔 ID**：3 真后端共用 lab_dev PG。只有比对含 `msw`（内存 fixture）时才传 `ID_KEYS`
- **msw 是 oracle**：打 `:5200` 必须绿。红了先怀疑套件写错，不是后端错
- **声明即必须可达**：`CONTRACT_TARGETS` 列了却连不上 = 红，不是 skip
- **写操作用唯一化前缀 + teardown**：共库写比对会撞唯一约束、不可重跑
- **100% 覆盖 shared SSOT**：端点清单 = `../lab-management-system-shared/tsp/routes/*.tsp` 全集，
  auto-derive（`scripts/check_ssot_coverage.mjs`）；禁止手挑；改端点必先改 SSOT
- **端点增/改/删必须同步本仓断言**（suite CLAUDE.md §2 硬规则）：
  后端仓改 `/api/**` 端点（增/改/删）→ 本仓对应 `tests/<area>.test.ts` 同 commit 增/改/删断言；
  端点删除时**必须**删除指向死路径的断言（绿死比红测更危险：无人调用 = 无人发现契约破裂）
- npm 依赖一律走 registry.npmmirror.com

## 3. 技术栈

TypeScript + vitest + axios + tough-cookie jar（HTTP 层，不受 fetch 屏蔽 HttpOnly 限制）。

门禁命令见 `.harness/stack.json`。**不要改它来让门变松。**

## 4. 验收

- suite 根目录跑 `python scripts/gate.py -p lab-management-system-contract-test`
- 四方比对：`CONTRACT_TARGETS=msw,aspnetcore,springboot,nextjs npx vitest run`
- 端口与起法 → suite `docs/conventions/multi-repo-family.md` §6 + `local-contract-test.md`

## 5. 指向别处

- 功能清单（唯一锚点） → `docs/functions/function-tree.md`；改它走 `/tree-change`
- 决策 → suite `docs/adr/0015-contract-test-repo.md`（normalize 契约）+ `0013-alignment-has-two-directions.md`
- SSO 双形态设计 → lab 后端 ADR-0008（no-sso noop vs 真 saas OAuth）
- 参照实现 → `../saas-identity-platform-contract-test`（本仓由它派生，坑已沉淀）

## 6. 工作循环

1. **改端点**：先改 shared `tsp/routes/*.tsp` → 重生 openapi → 在 `tests/` 写测试
   （或后端仓先改 → 立刻回头补 shared + 本仓，**不能跨 PR**；见 suite CLAUDE.md §2）
2. **删端点**：本仓对应断言同 commit 删除（绿死比红测更危险）
3. 改 `src/` 或 `tests/` → `npx vitest run`
4. gate exit 1 修；exit 2 停下问人
5. `/handoff` 更新 `.state/session.json`
