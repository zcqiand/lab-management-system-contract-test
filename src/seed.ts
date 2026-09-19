// lab 种子镜像 —— 契约测试用来构造带参路径，不向任何后端写入。
//
// **唯一真源**：lab-management-system-shared/seeds（DB 快照权威源，Phase 1 迁入；saas 家族同款）
// + lab-management-system-shared/sql/migrations/V015__smoke_seed_dict.sql（真后端共库 seed）。
//
// lab 与 saas 的差异：单租户、字典主键是业务 code（如 SP01）不是 UUID。
// tenantId 用 seed 快照的字面量 TENANT-001（真后端恒真链下 membership 信 saas，
// seed 快照字面量保留供构造带参路径）。
//
// **恒真链（2026-09-20 人裁，no-sso 降级已删）**：/api/auth/login 密码登录内部走
// saas 服务账号换 token/菜单快照；saas 不可达时降级空快照。三方比对会强制
// 登录响应 shape 不得分叉。
//
// 改 seed → 直接改 shared/seeds + shared 迁移，同仓同源；漏一处 = 后端分叉 = L5 假红。

export const SEED = {
  /** seed 用户 id；真后端 whoami 同款 USER-A。 */
  userId: "USER-A",
  /** seed tenants[0] + 真后端 /api/auth/me 租户列表一致。 */
  tenantId: "TENANT-001",
  tenants: {
    city: "TENANT-001",
    district: "TENANT-002",
    thirdParty: "TENANT-003",
  },
  /** 字典 smoke seed（V015）+ seed 快照 inspection_specialties 共有的 code。 */
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
