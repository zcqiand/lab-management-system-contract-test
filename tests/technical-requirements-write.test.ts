// M96.F02 — /api/technical-requirements POST/PUT/DELETE 写端点（Phase 2）。
//
// SSOT: technical-requirements.tsp M06.F06 三复合主键 (object + parameter + judgment_standard)。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

// 2026-09-16 T11：三元组换 lab_dev 真实种子码且未占用（旧 PRM-CEMENT-STRENGTH /
// GB/T-17671-2021 是 msw 时代虚构码，springboot 真 FK 23503 → 500；
// judgmentStandardCode 也不能 uniqueName 虚构——必须真实存在）。
// (OBJ-SP01-P11, IP-0002, GB 13788-2024) 实测 lab_dev 0 行——create→cleanup delete 净零。
const SEED_OBJECT = "OBJ-SP01-P11";
const SEED_PARAMETER = "IP-0002";
const SEED_STANDARD = "GB 13788-2024";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  /** target → "object/parameter/standard" 三段主键 */
  keys: Map<string, string>;
}
const ctx: Ctx = { keys: new Map() };

describe.skipIf(!live)(
  "M96.F02.I02 POST /api/technical-requirements 四方比对 / M00.F01.I01",
  () => {
    for (const target of targets) {
      it(`${target.name} 创 technical-requirement → 200`, async () => {
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/technical-requirements",
          body: {
            inspectionObjectCode: SEED_OBJECT,
            inspectionParameterCode: SEED_PARAMETER,
            judgmentStandardCode: SEED_STANDARD,
            requirement: "≥ 42.5 MPa",
          },
        });
        expect(
          [200, 201],
          `${target.name} POST tr 期望 200/201 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.keys.set(
          target.name,
          `${SEED_OBJECT}/${SEED_PARAMETER}/${SEED_STANDARD}`,
        );
        registerCleanup(`delete-tr:${target.name}`, async () => {
          const tr = await probeRequest(target, {
            method: "DELETE",
            path: `/api/technical-requirements/${SEED_OBJECT}/${SEED_PARAMETER}/${SEED_STANDARD}`,
          });
          if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
            console.warn(
              `[teardown] delete tr ${target.name} status=${tr.status}`,
            );
          }
        });
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I04 PUT /api/technical-requirements/{object}/{parameter}/{standard} 四方比对 / M01.F04.I01",
  () => {
    for (const target of targets) {
      it(`${target.name} 改 requirement → 200`, async () => {
        const key = ctx.keys.get(target.name);
        if (!key) throw new Error(`${target.name} tr 未创建`);
        const r = await probeRequest(target, {
          method: "PUT",
          path: `/api/technical-requirements/${key}`,
          body: { requirement: `renamed-${uniqueName("ct")}` },
        });
        expect(
          [200],
          `${target.name} PUT tr 期望 200 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I05 DELETE /api/technical-requirements/{object}/{parameter}/{standard} 四方比对 / M01.F05.I02",
  () => {
    it("technical-requirement 删除 → 200/204", async () => {
      for (const target of targets) {
        const key = ctx.keys.get(target.name);
        if (!key) continue;
        // 三后端共库 + 固定种子三键（FK 只认真实码，无法 per-target unique）：
        // 前一个目标的 DELETE 会删掉共享行 → 每个目标删前先预清+重建（5.54 live 实证：
        // aspnetcore create 修复后 springboot 撞 404）。
        await probeRequest(target, {
          method: "DELETE",
          path: `/api/technical-requirements/${key}`,
        });
        const c = await probeRequest(target, {
          method: "POST",
          path: "/api/technical-requirements",
          body: {
            inspectionObjectCode: SEED_OBJECT,
            inspectionParameterCode: SEED_PARAMETER,
            judgmentStandardCode: SEED_STANDARD,
            requirement: "≥ 42.5 MPa",
          },
        });
        expect(
          [200, 201],
          `${target.name} DELETE 前重建 tr 期望 2xx 实得 ${c.status}`,
        ).toContain(c.status);
        const r = await probeRequest(target, {
          method: "DELETE",
          path: `/api/technical-requirements/${key}`,
        });
        expect(
          [200, 204],
          `${target.name} DELETE tr 期望 200/204 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.keys.delete(target.name);
      }
    }, 180_000);

    afterAll(async () => {
      await runCleanups();
    }, 60_000);
  },
);
