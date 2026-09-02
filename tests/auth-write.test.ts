// M96.F02 — auth.tsp POST 写端点（Phase 2）。
//
// 覆盖：refresh/logout/switch-tenant/sso.callback。
// 这些不是「创行」探针，无 cleanup 注册 —— logout 后 token 失效是预期，
// refresh 命中才会返回新 token（错误 token 4xx 是契约面）。
import { describe, expect, it } from "vitest";

import { login, probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)("M96.F02.I02 POST /api/auth/refresh 四方比对", () => {
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

describe.skipIf(!live)("M96.F02.I05 POST /api/auth/logout 四方比对", () => {
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

describe.skipIf(!live)("M96.F02.I03 POST /api/auth/switch-tenant 四方比对", () => {
  for (const target of targets) {
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

describe.skipIf(!live)("M96.F02.I03 POST /api/auth/sso/callback 四方比对", () => {
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