// M96.F02 — /api/calculation-methods 列表 + 详情 四方比对（Phase 1: 读端点）。
//
// SSOT: calculation-methods.tsp M06.F05 计算方法（复合主键 object + parameter）。
// 本文件只覆盖 GET list + GET {object}/{parameter}；POST/PUT/DELETE 是 Phase 2。
// 详情走 DEAD_CODE 双段路径 —— 验证 404 envelope shape 全等。
import { beforeAll, describe, expect, it } from "vitest";

import {
  compareAll,
  compareBodies,
  formatDivergences,
  type Probe,
} from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { withLiveExecSuite } from "../src/live-floor.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_LIST = "/api/calculation-methods";
// 双段路径用 UUID sentinel：SSOT 覆盖解析器的 normalize 把 UUID 段归一为 `{*}`，
// 与 SSOT 的 `{inspectionObjectCode}/{inspectionParameterCode}` 模板对齐。
const PATH_DETAIL =
  "/api/calculation-methods/00000000-0000-0000-0000-00000000dead/00000000-0000-0000-0000-00000000dead";

const targets: Target[] = selectedTargets().filter((t) =>
  // R2（REQ-2026-043）：五域 target 定格 [nextjs, rules]——nextjs=迁移参照，rules=canonical
  ["nextjs", "rules"].includes(t.name),
);
const live = targets.length >= 2;

describe.skipIf(!live)(
  `M96.F02.I01 GET ${PATH_LIST} 四方比对 / M01.F05.I01`,
  () => {
    let probes: Probe[];

    beforeAll(async (ctx) => {
      probes = await withLiveExecSuite(ctx.name, () =>
        probeAll(targets, PATH_LIST),
      );
    }, 60_000);

    it("每个目标都返回 200", () => {
      const bad = probes.filter((p) => p.status !== 200);
      expect(
        bad,
        `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`,
      ).toEqual([]);
    });

    it("CalculationMethod[] 数组（不分页，按双复合主键 — 见 query 过滤）", () => {
      // SSOT: listCalculationMethods 返回 CalculationMethod[] | ErrorResponse，
      // 不是 Page<>（无 page/pageSize/total）。
      for (const p of probes) {
        expect(Array.isArray(p.body), `${p.target} list 应是数组`).toBe(true);
      }
    });

    it("normalize 后骨架全等（数组内 items 计数漂移，drop）", () => {
      const divergences = compareBodies(probes, targets, []);
      expect(
        divergences.filter((d) => d.kind === "status"),
        `\n${formatDivergences(divergences)}\n`,
      ).toEqual([]);
    });

    // 表无 id 列——nextjs list 行附加派生 id `cr-<obj>-<param>`（与该仓 POST/single
    // 同形；tech-req tr- 面同批修，2026-11-22）。按 target 收窄到 nextjs，
    // 其余栈对齐挂账另批。
    it("nextjs list 行带派生 id=cr-<obj>-<param>", () => {
      const nx = probes.find((p) => p.target === "nextjs");
      if (!nx) return;
      expect(Array.isArray(nx.body), "nextjs list 应是数组").toBe(true);
      const rows = nx.body as Array<Record<string, string>>;
      expect(rows.length, "种子面应非空").toBeGreaterThan(0);
      for (const r of rows.slice(0, 5)) {
        expect(
          r.id,
          `行 ${r.inspectionParameterCode} 须带派生 id`,
        ).toBe(`cr-${r.inspectionObjectCode}-${r.inspectionParameterCode}`);
      }
    });
  },
);

describe.skipIf(!live)(
  `M96.F02.I02 GET ${PATH_DETAIL} 四方比对 / M00.F01.I01`,
  () => {
    let probes: Probe[];

    beforeAll(async (ctx) => {
      probes = await withLiveExecSuite(ctx.name, () =>
        probeAll(targets, PATH_DETAIL),
      );
    }, 60_000);

    it("不存在双段路径 → 4 后端全 404", () => {
      for (const p of probes) {
        expect(p.status, `${p.target} 期望 404 实得 ${p.status}`).toBe(404);
      }
    });

    it("404 envelope shape 全等", () => {
      const drop = [
        "code",
        "message",
        "error",
        "error_description",
        "details",
        "path",
        "timestamp",
        "traceId",
      ];
      const divergences = compareBodies(probes, targets, drop);
      expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
    });

    it("status 全等", () => {
      const divergences = compareAll(probes, targets);
      expect(
        divergences.filter((d) => d.kind === "status"),
        `\n${formatDivergences(divergences)}\n`,
      ).toEqual([]);
    });
  },
);
