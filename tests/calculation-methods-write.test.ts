// M96.F02 — /api/calculation-methods POST/PUT/DELETE 写端点（Phase 2）。
//
// SSOT: calculation-methods.tsp M06.F05 计算方法（复合主键 object + parameter）。
// 路径含两段 code —— 创后用 registerCleanup DELETE 同路径即可清理。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

// 2026-09-16 T11：复合键两端换 lab_dev 真实种子码（原 uniqueName 虚构码在 springboot
// 真 FK 23503 → 500；SSOT CreateCalculationMethodRequest 必填 inspectionObjectCode +
// inspectionParameterCode，且无 precision 字段——已删）。(OBJ-SP01-P1, IP-0002) 实测
// inspection_calculation_methods 0 行——create→cleanup delete 净零。
const SEED_OBJECT = "OBJ-SP01-P1";
const SEED_PARAMETER = "IP-0002";
// V018（2026-11-14 批H）：PK 补 standard 维度，testing_standard_code NOT NULL（PK 成员
// 身份 + FK）——nextjs R6-2 fail-fast 对缺省 400。CT write body 补齐挂账（nextjs
// calculation-methods/route.ts 头注释指向本处）随本批收官：必须真实种子标准码
// （FK 只认 inspection_standards.code，虚构码 23503 → 500）。
const SEED_STANDARD = "GB 13788-2024";

const targets: Target[] = selectedTargets().filter((t) =>
  // R2（REQ-2026-043）：五域 target 定格 [nextjs, rules]——nextjs=迁移参照，rules=canonical
  ["nextjs", "rules"].includes(t.name),
);
const live = targets.length >= 2;

interface Ctx {
  /** target → "objectCode/parameterCode" 复合主键 */
  keys: Map<string, string>;
}
const ctx: Ctx = { keys: new Map() };

describe.skipIf(!live)(
  "M96.F02.I02 POST /api/calculation-methods 四方比对 / M00.F01.I01",
  () => {
    for (const target of targets) {
      it(`${target.name} 创 calculation-method → 200`, async () => {
        // 三后端共库 + 固定种子键（FK 只认真实码，无法 per-target unique）：前一
        // 目标的 POST 占住共享行 → 后跑的 dup-check 后端吃 400 dup（springboot
        // V018 批 live 实证，换序双向复现）。POST 前先预清共享键，照抄本文件
        // DELETE describe 的既有写法。
        await probeRequest(target, {
          method: "DELETE",
          path: `/api/calculation-methods/${SEED_OBJECT}/${SEED_PARAMETER}`,
        });
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/calculation-methods",
          body: {
            inspectionObjectCode: SEED_OBJECT,
            inspectionParameterCode: SEED_PARAMETER,
            testingStandardCode: SEED_STANDARD,
            formula: "value * 2",
          },
        });
        expect(
          [200, 201],
          `${target.name} POST calc-method 期望 200/201 实得 ${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`,
        ).toContain(r.status);
        ctx.keys.set(target.name, `${SEED_OBJECT}/${SEED_PARAMETER}`);
        registerCleanup(`delete-cm:${target.name}`, async () => {
          const tr = await probeRequest(target, {
            method: "DELETE",
            path: `/api/calculation-methods/${SEED_OBJECT}/${SEED_PARAMETER}`,
          });
          if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
            console.warn(
              `[teardown] delete calc-method ${target.name} status=${tr.status}`,
            );
          }
        });
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I04 PUT /api/calculation-methods/{object}/{parameter} 四方比对 / M01.F04.I01",
  () => {
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
        expect(
          [200],
          `${target.name} PUT calc-method 期望 200 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I05 DELETE /api/calculation-methods/{object}/{parameter} 四方比对 / M01.F05.I02",
  () => {
    it("calculation-method 删除 → 200/204", async () => {
      for (const target of targets) {
        // 三后端共库 + 固定种子键（FK 只认真实码，无法 per-target unique）：
        // 前一个目标的 DELETE 会删掉共享行 → 每个目标删前先预清+重建，保证本目标
        // 的 DELETE 独立可达（5.54 live 实证：aspnetcore create 修复后 springboot 撞 404）。
        await probeRequest(target, {
          method: "DELETE",
          path: `/api/calculation-methods/${SEED_OBJECT}/${SEED_PARAMETER}`,
        });
        const c = await probeRequest(target, {
          method: "POST",
          path: "/api/calculation-methods",
          body: {
            inspectionObjectCode: SEED_OBJECT,
            inspectionParameterCode: SEED_PARAMETER,
            testingStandardCode: SEED_STANDARD,
            formula: "value * 2",
          },
        });
        expect(
          [200, 201],
          `${target.name} DELETE 前重建 calc-method 期望 2xx 实得 ${c.status}`,
        ).toContain(c.status);
        const r = await probeRequest(target, {
          method: "DELETE",
          path: `/api/calculation-methods/${SEED_OBJECT}/${SEED_PARAMETER}`,
        });
        expect(
          [200, 204],
          `${target.name} DELETE calc-method 期望 200/204 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.keys.delete(target.name);
      }
    }, 180_000);

    afterAll(async () => {
      await runCleanups();
    }, 60_000);
  },
);
