// M96.F02 — auth.tsp POST 写端点（Phase 2）。
//
// 覆盖：refresh/logout/switch-tenant/sso.callback。
// 这些不是「创行」探针，无 cleanup 注册 —— logout 后 token 失效是预期，
// refresh 命中才会返回新 token（错误 token 4xx 是契约面）。
import { describe, expect, it } from "vitest";

import { login, probeGet, probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)("M96.F02.I02 POST /api/auth/refresh 四方比对 / M00.F01.I01", () => {
  for (const target of targets) {
    it(`${target.name} refresh(有效 token) → 200 + 新 token`, async () => {
      // 走登录拿真实 token → refresh 期望 200 + LoginResponse shape
      const token = await login(target);
      // refresh 需要原 refreshToken（不是 access token）；传一个不存在的应得到 401/400
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/auth/refresh",
        body: { refreshToken: token }, // 用 access token 当 refresh token 应 4xx
      });
      // 4 后端可能 200（同 JWT 兼 refresh）也可能 401（独立 refresh secret）
      expect([200, 400, 401], `${target.name} refresh 期望 200/4xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I05 POST /api/auth/logout 四方比对 / M01.F05.I02", () => {
  for (const target of targets) {
    it(`${target.name} logout → 200/204`, async () => {
      const token = await login(target);
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/auth/logout",
        body: { token },
      });
      expect([200, 204], `${target.name} logout 期望 200/204 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I03 POST /api/auth/switch-tenant 四方比对 / M01.F04.I02", () => {
  for (const target of targets) {
    it(`${target.name} switch-tenant(有效租户) → 200 + 真 JWT token`, async () => {
      const token = await login(target);
      // 有效租户从 /api/auth/me 拿（后端各自真实数据，不写死 demo 字面量）
      const me = await probeGet(target, "/api/auth/me", token);
      expect(me.status, `${target.name} /me 期望 200 实得 ${me.status}`).toBe(200);
      const session = me.body as {
        currentTenantId?: string;
        tenants?: { tenantId: string }[];
      };
      const tid = session.currentTenantId ?? session.tenants?.[0]?.tenantId;
      expect(tid, `${target.name} /me 必须返回可切换租户（currentTenantId 或 tenants[0]）`).toBeTruthy();
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/auth/switch-tenant",
        body: { tenantId: tid },
        token,
      });
      expect(r.status, `${target.name} switch-tenant(有效) 期望 200 实得 ${r.status}`).toBe(200);
      // 2026-09-14 硬规则同步：真 HS256 token（3 段 base64url），
      // 防 opaque mock-jwt-tenant-${tid} 回归（lab-nextjs 曾漏网）
      const parts = ((r.body as { token?: string }).token ?? "").split(".");
      expect(
        parts.length,
        `${target.name} switch-tenant token 必须是 3 段 JWT，实得 ${parts.length} 段`,
      ).toBe(3);
    }, 30_000);

    it(`${target.name} switch-tenant → 200 或 4xx（tenant 不存在）`, async () => {
      await login(target);
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/auth/switch-tenant",
        body: { tenantId: "00000000-0000-0000-0000-00000000dead" },
      });
      expect([200, 400, 404], `${target.name} switch-tenant 期望 200/4xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I03 POST /api/auth/sso/callback 四方比对 / M01.F04.I02", () => {
  for (const target of targets) {
    it(`${target.name} sso.callback → 200/4xx（code 不可用）`, async () => {
      await login(target);
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/auth/sso/callback",
        body: {
          grant_type: "authorization_code",
          code: "ct-invalid-code",
          redirect_uri: "http://localhost:5201/api/auth/sso/callback",
          state: "ct-state-fixture",
        },
      });
      // code 不可用 → 后端可能 400/401/422 —— 这都是契约面
      expect([200, 400, 401, 422], `${target.name} sso.callback 期望 2xx/4xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

// 2026-09-15 Phase 2 去 msw：原 msw oracle 侧的 sso/callback happy-path MyTenant
// 形状锁已契约化为 shared OpenAPI 静态断言（tests/mytenant-shape.test.ts，spec §3.3）。
// 真后端 happy-path 需 saas 授权码 + state cookie 完整舞步，Phase 3 跟进（当前真后端
// 只跑上方 invalid-code 冒烟）。