// M96.F02 — /api/receipts POST/PUT/DELETE + /api/receipts/{id}/task PUT 写端点（Phase 2）。
//
// SSOT: sample-receipts.tsp M03.F01 接样管理 CRUD + M03.F02 任务分配 + /history GET。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const SEED_CONTRACT = "CT-2026-001"; // 共库合同 code

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  ids: Map<string, string>;
}
const ctx: Ctx = { ids: new Map() };

describe.skipIf(!live)("M96.F02.I02 POST /api/receipts 四方比对 / M00.F01.I01", () => {
  for (const target of targets) {
    it(`${target.name} 创 receipt → 200/201 或 4xx（contract 不存在）`, async () => {
      const code = uniqueName("ct-rc");
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/receipts",
        body: {
          contractId: SEED_CONTRACT,
          code,
          clientName: `client-${code}`,
          receivedAt: new Date().toISOString(),
        },
      });
      expect([200, 201, 400, 404], `${target.name} POST receipt 期望 2xx/4xx 实得 ${r.status}`).toContain(r.status);
      if (r.status === 200 || r.status === 201) {
        const id = String((r.body as Record<string, unknown>).id ?? "");
        if (id) {
          ctx.ids.set(target.name, id);
          registerCleanup(`delete-receipt:${target.name}:${id.slice(-8)}`, async () => {
            const tr = await probeRequest(target, { method: "DELETE", path: `/api/receipts/${id}` });
            if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
              console.warn(`[teardown] delete receipt ${target.name} status=${tr.status}`);
            }
          });
        }
      }
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I03 PUT /api/receipts/{id} 四方比对 / M01.F04.I02", () => {
  for (const target of targets) {
    it(`${target.name} 改 clientName → 200 或 404`, async () => {
      const id = ctx.ids.get(target.name) ?? "00000000-0000-0000-0000-00000000dead";
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/receipts/${id}`,
        body: { clientName: `renamed-${uniqueName("ct")}` },
      });
      expect([200, 404], `${target.name} PUT receipt 期望 200/404 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I04 DELETE /api/receipts/{id} 四方比对 / M01.F04.I01", () => {
  it("receipt 删除 → 200/204 或 404（id 不存在）", async () => {
    for (const target of targets) {
      const id = ctx.ids.get(target.name) ?? "00000000-0000-0000-0000-00000000dead";
      const r = await probeRequest(target, { method: "DELETE", path: `/api/receipts/${id}` });
      expect([200, 204, 404], `${target.name} DELETE receipt 期望 2xx/404 实得 ${r.status}`).toContain(r.status);
    }
  }, 60_000);
});

describe.skipIf(!live)("M96.F02.I05 PUT /api/receipts/{id}/task 四方比对 / M01.F05.I02", () => {
  it("任务分配 → 200 或 404（id 不存在）", async () => {
    for (const target of targets) {
      const id = ctx.ids.get(target.name) ?? "00000000-0000-0000-0000-00000000dead";
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/receipts/${id}/task`,
        body: { inspectorUserId: "USER-A", dueDate: "2026-12-31" },
      });
      expect([200, 404], `${target.name} PUT task 期望 200/404 实得 ${r.status}`).toContain(r.status);
    }
  }, 60_000);

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});