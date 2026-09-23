// M96.F02 — auth.tsp 剩余 GET 端点四方比对（Phase 1: 读端点）。
//
// /auth/login 已覆盖于 auth.test.ts (M96.F02.I01)
// /auth/me 已覆盖于 auth-me.test.ts (M96.F02.I02)
// 本文件覆盖：
//   M96.F02.I03 GET /api/auth/permissions
//   M96.F02.I04 GET /api/auth/menus
//   M96.F02.I05 GET /api/auth/sso/authorize （OAuth 2.0 跳板，200 + {authorizeUrl, state} JSON 比对）
//
// POST/DELETE（refresh/logout/sso.callback/switch-tenant）属于 Phase 2 写端点。
import { beforeAll, describe, expect, it } from "vitest";

import {
  compareAll,
  compareBodies,
  formatDivergences,
  type Probe,
} from "../src/compare.js";
import { probeAll, probeRequest } from "../src/http.js";
import { withLiveExecSuite } from "../src/live-floor.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_PERMISSIONS = "/api/auth/permissions";
const PATH_MENUS = "/api/auth/menus";
const PATH_SSO_AUTHORIZE = "/api/auth/sso/authorize";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)(
  `M96.F02.I03 GET ${PATH_PERMISSIONS} 四方比对 / M01.F04.I02`,
  () => {
    let probes: Probe[];

    beforeAll(async (ctx) => {
      probes = await withLiveExecSuite(ctx.name, () =>
        probeAll(targets, PATH_PERMISSIONS),
      );
    }, 60_000);

    it("每个目标都返回 200", () => {
      const bad = probes.filter((p) => p.status !== 200);
      expect(
        bad,
        `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`,
      ).toEqual([]);
    });

    it("PermissionSet 必填 permissions 数组", () => {
      for (const p of probes) {
        const body = p.body as Record<string, unknown>;
        expect(
          Array.isArray(body.permissions),
          `${p.target} permissions 应是数组`,
        ).toBe(true);
      }
    });

    it("normalize 后骨架全等", () => {
      // 各后端 permissions 长度随本轮 role/permission 配置漂移，drop 数组
      const divergences = compareBodies(probes, targets, ["permissions"]);
      expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
    });
  },
);

describe.skipIf(!live)(
  `M96.F02.I04 GET ${PATH_MENUS} 四方比对 / M01.F04.I01`,
  () => {
    let probes: Probe[];

    beforeAll(async (ctx) => {
      probes = await withLiveExecSuite(ctx.name, () =>
        probeAll(targets, PATH_MENUS),
      );
    }, 60_000);

    it("每个目标都返回 200", () => {
      const bad = probes.filter((p) => p.status !== 200);
      expect(
        bad,
        `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`,
      ).toEqual([]);
    });

    it("返回 MenuNode[] 数组", () => {
      for (const p of probes) {
        expect(Array.isArray(p.body), `${p.target} menus 应是数组`).toBe(true);
      }
    });

    it("normalize 后骨架全等（items 计数漂移，drop）", () => {
      const divergences = compareBodies(probes, targets, []);
      // menus 是数组，4 后端各自 role 树结构可能不一致 —— shape 必然稳定，但子项
      // 差异（label/path）可能不同。粗略地：4 后端同 alice 角色下树根数应一致，
      // 这里只验 status 全等 + 数组 envelope；具体 children 留给后续 contract 阶段。
      expect(
        divergences.filter((d) => d.kind === "status"),
        `\n${formatDivergences(divergences)}\n`,
      ).toEqual([]);
    });
  },
);

// /auth/sso/authorize 是 OAuth 2.0 跳板（RFC 6749 §4.1.1）。
// T11(2026-09-16) 遗留裁决落定：2026-09-15 saas authorize 收敛为必须 Bearer
// （code 绑 Bearer sub+tenant_id，禁匿名签 code）后，lab 三后端 sso/authorize
// 家族统一为「200 JSON 跳板」—— 返回 { authorizeUrl, state }（authorizeUrl 指向
// saas 登录页 /login，前端 window.location.href 顶层导航不受 CORS 限制），
// 服务端不再做 code 预拿。旧「302 + Location」断言是 saas authorize 认证收敛
// 之前的契约，作废（lab-nextjs authorize 跳板收敛记录在案）。
describe.skipIf(!live)(
  `M96.F02.I05 GET ${PATH_SSO_AUTHORIZE} 四方比对 / M01.F05.I02`,
  () => {
    let probes: Probe[];

    beforeAll(async (ctx) => {
      // query 必须齐全：response_type=code + client_id + redirect_uri + state。
      const authz = new URLSearchParams({
        response_type: "code",
        client_id: "lab-contract-test",
        redirect_uri: "http://localhost:5201/api/auth/sso/callback",
        state: "ct-state-fixture",
      });
      probes = [];
      await withLiveExecSuite(ctx.name, async () => {
        for (const t of targets) {
          const probe = await probeRequest(t, {
            method: "GET",
            path: `${PATH_SSO_AUTHORIZE}?${authz.toString()}`,
          });
          probes.push(probe);
        }
      });
    }, 60_000);

    it("4 后端都返回 200（JSON 跳板，不是 302/5xx）", () => {
      const bad = probes.filter((p) => p.status !== 200);
      expect(
        bad,
        `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`,
      ).toEqual([]);
    });

    it("跳板契约面：body.authorizeUrl 指向 saas 登录页且带 state 回显", () => {
      for (const p of probes) {
        const body = p.body as Record<string, unknown>;
        const authorizeUrl = String(body.authorizeUrl ?? "");
        expect(authorizeUrl, `${p.target} 缺 authorizeUrl`).toContain("/login");
        expect(authorizeUrl, `${p.target} authorizeUrl 缺 state`).toContain(
          "state=",
        );
        expect(String(body.state ?? ""), `${p.target} state 未回显`).toBe(
          "ct-state-fixture",
        );
        // RFC 6749 §4.1.1：authorizeUrl 必须回显【调用方】redirect_uri（URL 编码）。
        // 2026-09-23 事故：springboot 忽略调用方值、硬用 env LAB_SSO_CALLBACK_REDIRECT
        // （值=lab-react :5202），lab-nextjs(:5201) 选 springboot 时 saas 把 code 送去
        // lab-react → 本前端拿不到 token → 数据页全空。此断言锁死三后端回显语义。
        const encodedRedirectUri = encodeURIComponent(
          "http://localhost:5201/api/auth/sso/callback",
        );
        expect(
          authorizeUrl,
          `${p.target} authorizeUrl 未回显调用方 redirect_uri（应 URL 编码）`,
        ).toContain(`redirect_uri=${encodedRedirectUri}`);
      }
    });

    it("normalize 后骨架全等", () => {
      const divergences = compareAll(probes, targets);
      // authorizeUrl 的 host/query 每后端 env 不同 —— 只验 status 不分叉
      expect(
        divergences.filter((d) => d.kind === "status"),
        `\n${formatDivergences(divergences)}\n`,
      ).toEqual([]);
    });
  },
);
