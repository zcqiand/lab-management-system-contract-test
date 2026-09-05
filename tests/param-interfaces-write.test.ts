// M96.F02 — /api/param-interfaces POST/PUT/DELETE + link/unlink 写端点（Phase 2）。
//
// SSOT: param-interfaces.tsp M06.F08 参数界面 CRUD + link/unlink。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const SEED_PARAMETER = "PRM-CEMENT-STRENGTH";

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
        body: { code, name: `pi ${code}` },
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
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/param-interfaces/links",
        body: { inspectionParameterCode: SEED_PARAMETER, paramInterfaceCode: "PI-FIXTURE" },
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
        body: { inspectionParameterCode: SEED_PARAMETER, paramInterfaceCode: "PI-FIXTURE" },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});