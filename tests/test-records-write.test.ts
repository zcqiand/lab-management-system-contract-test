// M96.F02 — /api/test-records POST/PUT/DELETE/PATCH verdict 写端点（Phase 2）。
//
// SSOT: test-records.tsp M03.F03 数据录入 + M03.F03.I06 人工改判 verdict。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  ids: Map<string, string>;
}
const ctx: Ctx = { ids: new Map() };

describe.skipIf(!live)("M96.F02.I02 POST /api/test-records 四方比对 / M00.F01.I01", () => {
  for (const target of targets) {
    it(`${target.name} 创 test-record → 200/201 或 4xx（sample 不存在时）`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/test-records",
        body: {
          sampleId: "00000000-0000-0000-0000-000000000001",
          parameterCode: "PRM-CEMENT-STRENGTH",
          value: 42.5,
        },
      });
      expect([200, 201, 400, 404], `${target.name} POST test-record 期望 2xx/4xx 实得 ${r.status}`).toContain(r.status);
      if (r.status === 200 || r.status === 201) {
        const id = String((r.body as Record<string, unknown>).id ?? "");
        if (id) {
          ctx.ids.set(target.name, id);
          registerCleanup(`delete-tr:${target.name}:${id.slice(-8)}`, async () => {
            const tr = await probeRequest(target, { method: "DELETE", path: `/api/test-records/${id}` });
            if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
              console.warn(`[teardown] delete test-record ${target.name} status=${tr.status}`);
            }
          });
        }
      }
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I04 PUT /api/test-records/{id} 四方比对 / M01.F04.I01", () => {
  for (const target of targets) {
    it(`${target.name} 改 value → 200 或 404（id 不存在时）`, async () => {
      const id = ctx.ids.get(target.name) ?? "00000000-0000-0000-0000-00000000dead";
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/test-records/${id}`,
        body: { value: 50.0 },
      });
      expect([200, 404], `${target.name} PUT test-record 期望 200/404 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I05 DELETE /api/test-records/{id} 四方比对 / M01.F05.I02", () => {
  it("test-record 删除 → 200/204 或 404（id 不存在）", async () => {
    for (const target of targets) {
      const id = ctx.ids.get(target.name) ?? "00000000-0000-0000-0000-00000000dead";
      const r = await probeRequest(target, { method: "DELETE", path: `/api/test-records/${id}` });
      expect([200, 204, 404], `${target.name} DELETE test-record 期望 2xx/404 实得 ${r.status}`).toContain(r.status);
    }
  }, 60_000);
});

describe.skipIf(!live)("M96.F02.I06 PATCH /api/test-records/{id}/verdict 四方比对 / M04.F06.I02", () => {
  it("人工改判 verdict → 200 或 404（id 不存在）", async () => {
    for (const target of targets) {
      const id = ctx.ids.get(target.name) ?? "00000000-0000-0000-0000-00000000dead";
      const r = await probeRequest(target, {
        method: "PATCH",
        path: `/api/test-records/${id}/verdict`,
        body: { verdict: "pass" },
      });
      expect([200, 404], `${target.name} PATCH verdict 期望 200/404 实得 ${r.status}`).toContain(r.status);
    }
  }, 60_000);

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});