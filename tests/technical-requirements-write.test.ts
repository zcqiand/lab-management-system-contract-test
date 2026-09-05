// M96.F02 — /api/technical-requirements POST/PUT/DELETE 写端点（Phase 2）。
//
// SSOT: technical-requirements.tsp M06.F06 三复合主键 (object + parameter + judgment_standard)。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const SEED_OBJECT = "OBJ-SP01-P1";
const SEED_PARAMETER = "PRM-CEMENT-STRENGTH";
const SEED_STANDARD = "GB/T-17671-2021";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  /** target → "object/parameter/standard" 三段主键 */
  keys: Map<string, string>;
}
const ctx: Ctx = { keys: new Map() };

describe.skipIf(!live)("M96.F02.I02 POST /api/technical-requirements 四方比对 / M00.F01.I01", () => {
  for (const target of targets) {
    it(`${target.name} 创 technical-requirement → 200`, async () => {
      const std = uniqueName("ct-tr-s");
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/technical-requirements",
        body: {
          inspectionObjectCode: SEED_OBJECT,
          inspectionParameterCode: SEED_PARAMETER,
          judgmentStandardCode: std,
          requirement: "≥ 42.5 MPa",
        },
      });
      expect([200, 201], `${target.name} POST tr 期望 200/201 实得 ${r.status}`).toContain(r.status);
      ctx.keys.set(target.name, `${SEED_OBJECT}/${SEED_PARAMETER}/${std}`);
      registerCleanup(`delete-tr:${target.name}:${std.slice(-6)}`, async () => {
        const tr = await probeRequest(target, {
          method: "DELETE",
          path: `/api/technical-requirements/${SEED_OBJECT}/${SEED_PARAMETER}/${std}`,
        });
        if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
          console.warn(`[teardown] delete tr ${target.name} status=${tr.status}`);
        }
      });
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I04 PUT /api/technical-requirements/{object}/{parameter}/{standard} 四方比对 / M01.F04.I01", () => {
  for (const target of targets) {
    it(`${target.name} 改 requirement → 200`, async () => {
      const key = ctx.keys.get(target.name);
      if (!key) throw new Error(`${target.name} tr 未创建`);
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/technical-requirements/${key}`,
        body: { requirement: `renamed-${uniqueName("ct")}` },
      });
      expect([200], `${target.name} PUT tr 期望 200 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I05 DELETE /api/technical-requirements/{object}/{parameter}/{standard} 四方比对 / M01.F05.I02", () => {
  it("technical-requirement 删除 → 200/204", async () => {
    for (const target of targets) {
      const key = ctx.keys.get(target.name);
      if (!key) continue;
      const r = await probeRequest(target, { method: "DELETE", path: `/api/technical-requirements/${key}` });
      expect([200, 204], `${target.name} DELETE tr 期望 200/204 实得 ${r.status}`).toContain(r.status);
      ctx.keys.delete(target.name);
    }
  }, 60_000);

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});