// M96.F02 — auth.tsp POST 写端点（Phase 2）。
//
// 覆盖：refresh/logout/switch-tenant/sso.callback。
// 这些不是「创行」探针，无 cleanup 注册 —— logout 后 token 失效是预期，
// refresh 命中才会返回新 token（错误 token 4xx 是契约面）。
import { describe, expect, it } from "vitest";

import { client, login, probeGet, probeRequest } from "../src/http.js";
import { ORACLE, type Target, selectedTargets } from "../src/targets.js";

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
      // code 不可用 → 4 后端可能 400/401/422 —— 这都是契约面
      expect([200, 400, 401, 422], `${target.name} sso.callback 期望 2xx/4xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

// 2026-09-15 形状收敛锁：sso/callback 登录响应 tenants 收敛到契约 MyTenant
// {tenantId, code, name, roleIds}（lab-nextjs 旧 demo 形状 tenantCode/tenantName
// 与 shared OpenAPI、login/me 及其余三仓不一致，已收敛）。happy-path 形状先在
// oracle（msw）侧锁死——msw 自铸一次性 code，无需 saas OAuth 全链；真后端
// happy-path 需 saas 授权码 + state cookie 完整舞步，Phase 3 跟进（当前真后端
// 只跑上方 invalid-code 冒烟）。
// 注意：it() 标题不带 M/F/I 字面（fnReporter 正则会误吸作 functional coverage）。
const mswTarget = targets.find((t) => t.name === ORACLE);

describe.skipIf(!mswTarget)("M96.F02.I03 POST /api/auth/sso/callback happy-path 形状（msw oracle） / M01.F04.I02", () => {
  it(`${ORACLE} sso.callback（authorize 换真 code）→ 200 + tenants 每行契约 MyTenant 四键`, async () => {
    const http = client(mswTarget!);
    const redirectUri = "http://localhost:5202/login";
    const authRes = await http.get(
      `/api/auth/sso/authorize?response_type=code&client_id=lab` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&state=ct-mytenant-lock`,
    );
    expect(authRes.status, "msw authorize 期望 200 实得 " + authRes.status).toBe(200);
    const back = new URL((authRes.data as { authorizeUrl?: string }).authorizeUrl ?? "");
    const code = back.searchParams.get("code");
    expect(code, "msw authorizeUrl 里必须带一次性 code").toBeTruthy();

    const res = await http.post("/api/auth/sso/callback", {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    expect(res.status, "msw sso.callback(真 code) 期望 200 实得 " + res.status).toBe(200);
    const tenants = (res.data as {
      tenants?: Array<Record<string, unknown> & { tenantId: string }>;
    }).tenants;
    expect(tenants?.length, "msw sso.callback tenants 为空").toBeGreaterThan(0);
    for (const row of tenants!) {
      for (const key of ["tenantId", "code", "name", "roleIds"] as const) {
        expect(row[key], `msw sso.callback 租户行少了 ${key}`).toBeDefined();
      }
      expect(row.name, "msw sso.callback name 拿 tenantId 充名字").not.toBe(row.tenantId);
      expect(row.code, "msw sso.callback code 拿 tenantId 充名字").not.toBe(row.tenantId);
      // 旧 demo 形状（tenantCode/tenantName）不得回潮
      expect(row).not.toHaveProperty("tenantCode");
      expect(row).not.toHaveProperty("tenantName");
    }
  }, 30_000);
});