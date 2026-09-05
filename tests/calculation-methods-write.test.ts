// M96.F02 — /api/calculation-methods POST/PUT/DELETE 写端点（Phase 2）。
//
// SSOT: calculation-methods.tsp M06.F05 计算方法（复合主键 object + parameter）。
// 路径含两段 code —— 创后用 registerCleanup DELETE 同路径即可清理。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const SEED_OBJECT = "OBJ-SP01-P1";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  /** target → "objectCode/parameterCode" 复合主键 */
  keys: Map<string, string>;
}
const ctx: Ctx = { keys: new Map() };

describe.skipIf(!live)("M96.F02.I02 POST /api/calculation-methods 四方比对 / M00.F01.I01", () => {
  for (const target of targets) {
    it(`${target.name} 创 calculation-method → 200`, async () => {
      const obj = uniqueName("ct-cm-o");
      const param = uniqueName("ct-cm-p");
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/calculation-methods",
        body: {
          inspectionObjectCode: obj,
          inspectionParameterCode: param,
          formula: "value * 2",
          precision: 2,
        },
      });
      expect([200, 201], `${target.name} POST calc-method 期望 200/201 实得 ${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`).toContain(r.status);
      ctx.keys.set(target.name, `${obj}/${param}`);
      registerCleanup(`delete-cm:${target.name}:${obj.slice(-6)}`, async () => {
        const tr = await probeRequest(target, {
          method: "DELETE",
          path: `/api/calculation-methods/${obj}/${param}`,
        });
        if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
          console.warn(`[teardown] delete calc-method ${target.name} status=${tr.status}`);
        }
      });
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I04 PUT /api/calculation-methods/{object}/{parameter} 四方比对 / M01.F04.I01", () => {
  for (const target of targets) {
    it(`${target.name} 改 formula → 200`, async () => {
      const key = ctx.keys.get(target.name);
      if (!key) throw new Error(`${target.name} calc-method 未创建`);
      const [obj, param] = key.split("/");
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/calculation-methods/${obj}/${param}`,
        body: { formula: `renamed-${uniqueName("ct")}` },
      });
      expect([200], `${target.name} PUT calc-method 期望 200 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I05 DELETE /api/calculation-methods/{object}/{parameter} 四方比对 / M01.F05.I02", () => {
  it("calculation-method 删除 → 200/204", async () => {
    for (const target of targets) {
      const key = ctx.keys.get(target.name);
      if (!key) continue;
      const [obj, param] = key.split("/");
      const r = await probeRequest(target, {
        method: "DELETE",
        path: `/api/calculation-methods/${obj}/${param}`,
      });
      expect([200, 204], `${target.name} DELETE calc-method 期望 200/204 实得 ${r.status}`).toContain(r.status);
      ctx.keys.delete(target.name);
    }
  }, 60_000);

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});