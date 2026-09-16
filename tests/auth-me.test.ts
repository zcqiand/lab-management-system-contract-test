// M96.F02.I02 GET /api/auth/me 四方比对 —— CurrentUserSession 契约面。
//
// M00.F01 当前用户会话：{user, tenants, currentTenantId?}。
// 单对象（非分页），带 Bearer 打；登录前置走 http.ts login()（各自登录，token 不跨后端复用）。
import { beforeAll, describe, expect, it } from "vitest";

import { compareAll, formatDivergences } from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH = "/api/auth/me";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)(`M96.F02.I02 GET ${PATH} 四方比对 / M00.F01.I01`, () => {
  let probes: Awaited<ReturnType<typeof probeAll>>;

  beforeAll(async () => {
    probes = await probeAll(targets, PATH);
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("必填字段齐全（CurrentUserSession required: user/tenants）", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      expect(body.user, `${p.target} 少了 user`).toBeDefined();
      expect(Array.isArray(body.tenants), `${p.target} 的 tenants 不是数组`).toBe(true);
    }
  });

  it("normalize 后所有目标全等", () => {
    const divergences = compareAll(probes, targets);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});
