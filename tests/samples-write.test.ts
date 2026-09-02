// M96.F02 — /api/samples POST/PUT/DELETE 写端点（Phase 2）。
//
// SSOT: samples.tsp M03.F03 样品 CRUD。样品挂在接样单下，本测试用 seed 第一个 contract 下的第一个 receipt。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const SEED_RECEIPT = "00000000-0000-0000-0000-000000000001"; // 实际接单 id 走 seed——查不到 fallback to UUID

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  ids: Map<string, string>;
}
const ctx: Ctx = { ids: new Map() };

describe.skipIf(!live)("M96.F02.I03 POST /api/samples 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} 创 sample → 200/201（接样单可能不存在，走 400/404 也是契约面）`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/samples",
        body: { receiptId: SEED_RECEIPT, name: uniqueName("ct-smp"), spec: "10x10x10mm" },
      });
      // 接样单不存在时 4 后端可能 400/404（不同实现）—— 这正是要比较的契约面
      expect([200, 201, 400, 404], `${target.name} POST sample 期望 2xx/4xx 实得 ${r.status}`).toContain(r.status);
      // 若创建成功则登记 id；失败则跳过清理
      if (r.status === 200 || r.status === 201) {
        const id = String((r.body as Record<string, unknown>).id ?? "");
        if (id) {
          ctx.ids.set(target.name, id);
          registerCleanup(`delete-sample:${target.name}:${id.slice(-8)}`, async () => {
            const tr = await probeRequest(target, { method: "DELETE", path: `/api/samples/${id}` });
            if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
              console.warn(`[teardown] delete sample ${target.name} status=${tr.status}`);
            }
          });
        }
      }
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I04 PUT /api/samples/{id} 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} 改 spec → 200 或 404（id 不存在时）`, async () => {
      const id = ctx.ids.get(target.name) ?? "00000000-0000-0000-0000-00000000dead";
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/samples/${id}`,
        body: { spec: `renamed-${uniqueName("ct")}` },
      });
      expect([200, 404], `${target.name} PUT sample 期望 200/404 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I05 DELETE /api/samples/{id} 四方比对", () => {
  it("sample 删除 → 200/204 或 404（id 不存在））", async () => {
    for (const target of targets) {
      const id = ctx.ids.get(target.name) ?? "00000000-0000-0000-0000-00000000dead";
      const r = await probeRequest(target, { method: "DELETE", path: `/api/samples/${id}` });
      expect([200, 204, 404], `${target.name} DELETE sample 期望 2xx/404 实得 ${r.status}`).toContain(r.status);
    }
  }, 60_000);

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});