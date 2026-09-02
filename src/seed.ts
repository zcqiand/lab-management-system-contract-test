// lab 种子镜像 —— 契约测试用来构造带参路径，不向任何后端写入。
//
// **唯一真源**：lab-management-system-msw/src/seeds/*.json（msw oracle 的确定性 fixture）
// + lab-management-system-shared/sql/migrations/V015__smoke_seed_dict.sql（真后端共库 seed）。
//
// lab 与 saas 的差异：单租户、字典主键是业务 code（如 SP01）不是 UUID。
// tenantId 用 msw tenants.json 的字面量 TENANT-001（真后端 no-sso noop 同款，ADR-0008）。
//
// **认证形态兼容（2026-09-02 硬约束）**：后端接真 saas OAuth 2.0
// （LAB_SSO_PROFILE=default）时，/api/auth/login 内部走 service account
// 换 saas token，但请求/响应契约面与 no-sso 完全一致——本套件两种形态都能打，
// 且四方比对会强制两种形态的登录响应 shape 不得分叉。
//
// 改 seed → 先改 msw fixtures + shared 迁移，三方一致；漏一处 = 4 后端分叉 = L5 假红。

export const SEED = {
  /** lab-msw DEMO_USER.id；真后端 no-sso noop whoami 同款 USER-A。 */
  userId: "USER-A",
  /** msw tenants[0] + noop SaasMeClient.tenants() 一致。 */
  tenantId: "TENANT-001",
  tenants: {
    city: "TENANT-001",
    district: "TENANT-002",
    thirdParty: "TENANT-003",
  },
  /** 字典 smoke seed（V015）+ msw inspection-specialty.json 共有的 code。 */
  dictionary: {
    specialty: "SP01",
    smokeSpecialty: "SP-SMK-001",
    smokeReportName: "CAT-SMK-001",
  },
} as const;

/** read 端点共用的固定路径参数。 */
export const READ_PARAMS = {
  tenantId: SEED.tenantId,
} as const;
