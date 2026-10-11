// M96.F02.I02 GET /api/auth/me 四方比对 —— CurrentUserSession 契约面。
//
// M00.F01 当前用户会话：{user, tenants, currentTenantId?}。
// 单对象（非分页），带 Bearer 打；登录前置走 http.ts login()（各自登录，token 不跨后端复用）。
import { beforeAll, describe, expect, it } from "vitest";

import { compareAll, formatDivergences } from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { withLiveExecSuite } from "../src/live-floor.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH = "/api/auth/me";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)(`M96.F02.I02 GET ${PATH} 四方比对 / M00.F01.I01`, () => {
  let probes: Awaited<ReturnType<typeof probeAll>>;

  // 180s（REQ-2026-023 五目标后从 60s 上调）：beforeAll = 5 目标 × (login + GET me)，
  // login 走服务端完整 saas 链（4-8s 常态，拥塞 10-18s+）。60s 击穿时 vitest 2.x
  // 把内层 it() 标 skip → fnReporter 记 inert → L5 skip=0 硬门红
  // （2026-10-11 gate 实证 12 条 inert 之三）。详见 auth.test.ts login 套件注释。
  beforeAll(async (ctx) => {
    probes = await withLiveExecSuite(ctx.name, () => probeAll(targets, PATH));
  }, 180_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(
      bad,
      `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`,
    ).toEqual([]);
  });

  it("必填字段齐全（CurrentUserSession required: user/tenants）", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      expect(body.user, `${p.target} 少了 user`).toBeDefined();
      expect(
        Array.isArray(body.tenants),
        `${p.target} 的 tenants 不是数组`,
      ).toBe(true);
    }
  });

  it("normalize 后所有目标全等", () => {
    const divergences = compareAll(probes, targets);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});
