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

const targets: Target[] = selectedTargets().filter((t) =>
  // R2（REQ-2026-043）：五域 target 定格 [nextjs, rules]——nextjs=迁移参照，rules=canonical
  ["nextjs", "rules"].includes(t.name),
);
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
        // 双目标共享 PG 净场（R2 Ruling 2026-11-22）：[nextjs,rules] 定格后两后端
        // 同库，前目标 POST 的 sentinel 行会让后目标 dup 400（nextjs/rules dup
        // 语义一致=400「技术要求已存在」；旧常态 springboot 打头 JPA save=merge
        // upsert 不触发）——POST 前幂等 DELETE 净场，与文件既定净零意图一致。
        await probeRequest(target, {
          method: "DELETE",
          path: `/api/technical-requirements/${SEED_OBJECT}/${SEED_PARAMETER}/${SEED_STANDARD}`,
        });
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/technical-requirements",
          body: {
            inspectionObjectCode: SEED_OBJECT,
            inspectionParameterCode: SEED_PARAMETER,
            judgmentStandardCode: SEED_STANDARD,
            comparison: "≥",
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
            comparison: "≥",
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

// V020（账 11 收链 2026-11-18）：变体列 brand/model/spec/grade/sieve 已 NOT NULL
// DEFAULT ''（'' 哨兵=不限维度）进 8 列 PK。本块只断言**普适面**：
// ① 同 3 键不同 brand=自成行（变体 POST 2xx，不与 '' 行 dup、不 23502）；
// ② list 过滤下该变体行恰 1 条。
// 【两语义分叉挂账人裁，本块禁断言】2026-11-18 live 实锤（契约对两_face 均沉默）：
// · POST 同 8 键 dup：nextjs=400「已存在」（route 头明写）vs 六后端=merge 覆盖 200
//   （spring JPA save=merge 先例）——本块改 per-target unique brand 避开二次 POST。
// · 三键 GET/PUT/DELETE 作用域：nextjs=族级（patch/删全变体族）vs 六后端=精确命中
//   '' 行——「现库变体行全 ''」时两语义重合，变体行存在后分叉可见。
// brand 无 FK 强制（契约「不强制，code 可空引用」），per-target unique 合法；
// 变体行残留由 nextjs 族级 DELETE 在 teardown 尽力清（不断言；无 nextjs 目标的
// run 残留累积，dev 库可容忍，挂账随 fork 裁定收口）。
const VARIANT_LIST_PATH =
  `/api/technical-requirements?inspectionObjectCode=${SEED_OBJECT}` +
  `&inspectionParameterCode=${SEED_PARAMETER}` +
  `&judgmentStandardCode=${encodeURIComponent(SEED_STANDARD)}`;

describe.skipIf(!live)(
  "M96.F02.I02 POST /api/technical-requirements 变体行写面（V020 8 列 PK）/ M00.F01.I01",
  () => {
    it("同 3 键不同 brand 自成行，list 过滤恰 1 条", async () => {
      for (const target of targets) {
        const brand = uniqueName("ctvar");
        const base = {
          inspectionObjectCode: SEED_OBJECT,
          inspectionParameterCode: SEED_PARAMETER,
          judgmentStandardCode: SEED_STANDARD,
          comparison: "≥",
          brand,
        };
        const a = await probeRequest(target, {
          method: "POST",
          path: "/api/technical-requirements",
          body: { ...base, remark: "variant-v1" },
        });
        expect(
          [200, 201],
          `${target.name} 变体行首建期望 2xx 实得 ${a.status}`,
        ).toContain(a.status);
        registerCleanup(`delete-tr-variant:${target.name}`, async () => {
          if (target.name !== "nextjs") return;
          // 尽力清残留（nextjs 族级 DELETE 删全变体族）；分叉未裁，不断言
          await probeRequest(target, {
            method: "DELETE",
            path: `/api/technical-requirements/${SEED_OBJECT}/${SEED_PARAMETER}/${encodeURIComponent(SEED_STANDARD)}`,
          });
        });
        const r = await probeRequest(target, {
          method: "GET",
          path: VARIANT_LIST_PATH,
        });
        expect(
          [200],
          `${target.name} list 期望 200 实得 ${r.status}`,
        ).toContain(r.status);
        const rows = (Array.isArray(r.body) ? r.body : []) as Array<{
          brand?: string;
          remark?: string;
        }>;
        const variantRows = rows.filter((x) => x.brand === brand);
        expect(
          variantRows.length === 1 && variantRows[0].remark === "variant-v1",
          `${target.name} 变体行期望恰 1 条且 remark=variant-v1，` +
            `实得 ${variantRows.length} 条`,
        ).toBe(true);
      }
    }, 180_000);

    // 本块后于 I05 执行——I05 的 afterAll(runCleanups) 已跑过，本块注册的
    // 清理须自跑一轮（2026-11-18 live 残留 2 行实锤）。
    afterAll(async () => {
      await runCleanups();
    }, 60_000);
  },
);
