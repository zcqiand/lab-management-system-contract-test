// M96.F02 — /api/param-interfaces POST/PUT/DELETE + link/unlink 写端点（Phase 2）。
//
// SSOT: param-interfaces.tsp M06.F08 参数界面 CRUD + link/unlink。
// 2026-09-14 live 修正：CreateParamInterfaceRequest 契约必填 componentPath
// （原 body {code,name} 被真后端按 SSOT 400 拒绝，宽松 mock 曾掩盖是假象）；
// link/unlink 探测对换真实种子两端点（原 PRM-CEMENT-STRENGTH/PI-FIXTURE 是
// 幻影值，任何 fixture/库里都不存在，真后端 FK 必拒）。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

// 种子真实存在：inspection-parameter.json 有 IP-0086，inspection-param-interface.json 有 default；
// inspection-param-interface-link.json 无此组合 → 创建/删除均可重跑。
const SEED_PARAMETER = "IP-0086";
const SEED_INTERFACE = "default";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  ids: Map<string, string>;
}
const ctx: Ctx = { ids: new Map() };

describe.skipIf(!live)("M96.F02.I04 POST /api/param-interfaces 四方比对 / M01.F04.I01", () => {
  for (const target of targets) {
    it(`${target.name} 创 param-interface → 200`, async () => {
      const code = uniqueName("ct-pi");
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/param-interfaces",
        body: { code, name: `pi ${code}`, componentPath: "cards/default" },
      });
      expect([200, 201], `${target.name} POST param-interface 期望 200/201 实得 ${r.status}`).toContain(r.status);
      ctx.ids.set(target.name, code);
      registerCleanup(`delete-pi:${target.name}:${code.slice(-8)}`, async () => {
        const tr = await probeRequest(target, { method: "DELETE", path: `/api/param-interfaces/${code}` });
        if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
          console.warn(`[teardown] delete param-interface ${target.name} status=${tr.status}`);
        }
      });
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I05 PUT /api/param-interfaces/{code} 四方比对 / M01.F05.I02", () => {
  for (const target of targets) {
    it(`${target.name} 改 name → 200`, async () => {
      const code = ctx.ids.get(target.name);
      if (!code) throw new Error(`${target.name} param-interface 未创建`);
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/param-interfaces/${code}`,
        body: { name: `renamed-${uniqueName("ct")}` },
      });
      expect([200], `${target.name} PUT param-interface 期望 200 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I06 DELETE /api/param-interfaces/{code} 四方比对 / M04.F06.I02", () => {
  it("param-interface 删除 → 200/204", async () => {
    for (const target of targets) {
      const code = ctx.ids.get(target.name);
      if (!code) continue;
      const r = await probeRequest(target, { method: "DELETE", path: `/api/param-interfaces/${code}` });
      expect([200, 204], `${target.name} DELETE param-interface 期望 200/204 实得 ${r.status}`).toContain(r.status);
      ctx.ids.delete(target.name);
    }
  }, 60_000);
});

describe.skipIf(!live)("M96.F02.I07 POST /api/param-interfaces/links 四方比对 / M04.F06.I03", () => {
  for (const target of targets) {
    it(`${target.name} link(PRM, PI) → 200/204`, async () => {
      // 前置清残留（上次残跑可能留下同三元组）：unlink 幂等 204，状态不看
      await probeRequest(target, {
        method: "DELETE",
        path: "/api/param-interfaces/links",
        body: { inspectionParameterCode: SEED_PARAMETER, paramInterfaceCode: SEED_INTERFACE },
      });
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/param-interfaces/links",
        body: { inspectionParameterCode: SEED_PARAMETER, paramInterfaceCode: SEED_INTERFACE },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I08 DELETE /api/param-interfaces/links 四方比对 / M04.F06.I04", () => {
  for (const target of targets) {
    it(`${target.name} unlink(PRM, PI) → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/param-interfaces/links",
        body: { inspectionParameterCode: SEED_PARAMETER, paramInterfaceCode: SEED_INTERFACE },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
      // 幂等：重复 unlink 未命中同样 204（契约 unlink = void，REQ-2026-001 四方一致）
      const r2 = await probeRequest(target, {
        method: "DELETE",
        path: "/api/param-interfaces/links",
        body: { inspectionParameterCode: SEED_PARAMETER, paramInterfaceCode: SEED_INTERFACE },
      });
      expect([200, 201, 204], `${target.name} 重复 unlink 期望幂等 2xx 实得 ${r2.status}`).toContain(r2.status);
    }, 30_000);
  }

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});