// M06.F09 — /api/report-name-interfaces 列表 + 详情 + links list 四方比对（Phase 1: GET 读端点）。
//
// SSOT: report-name-interfaces.tsp M06.F09 报告名称级样品扩展属性界面 CRUD + link/unlink
// （2026-11-10 人裁，参考 param-interfaces 同构；取代 inspection_report_names.ext_fields）。
// 本文件覆盖：GET list + GET {code} + GET /links（GET /links 走 ADR-0034 §3 自然豁免，
// suite L5 EXEMPT_PREFIXES，但四方比对仍要有——写侧见 report-name-interfaces-write.test.ts）。
import { beforeAll, describe, expect, it } from "vitest";

import {
  compareBodies,
  compareAll,
  formatDivergences,
  type Probe,
} from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { withLiveExecSuite } from "../src/live-floor.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_LIST = "/api/report-name-interfaces";
// 详情路径用 UUID sentinel：SSOT 覆盖解析器把 UUID 段归一为 `{*}`，与 SSOT `{code}` 对齐。
const PATH_DETAIL =
  "/api/report-name-interfaces/00000000-0000-0000-0000-00000000dead";
const PATH_LINKS = "/api/report-name-interfaces/links";

const targets: Target[] = selectedTargets().filter((t) =>
  // R2（REQ-2026-043）：五域 target 定格 [nextjs, rules]——nextjs=迁移参照，rules=canonical
  ["nextjs", "rules"].includes(t.name),
);
const live = targets.length >= 2;

const DROP_404 = [
  "code",
  "message",
  "error",
  "error_description",
  "details",
  "path",
  "timestamp",
  "traceId",
];

describe.skipIf(!live)(
  `M06.F09.I01 GET ${PATH_LIST} 四方比对 / M01.F05.I01`,
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

    it("Page<ReportNameInterface> envelope 必填", () => {
      for (const p of probes) {
        const body = p.body as Record<string, unknown>;
        for (const key of ["page", "pageSize", "total", "items"]) {
          expect(body[key], `${p.target} list 缺 ${key}`).toBeDefined();
        }
        expect(Array.isArray(body.items), `${p.target} items 应是数组`).toBe(
          true,
        );
      }
    });

    it("normalize 后骨架全等（items/total/pageSize 数据派生漂移，drop）", () => {
      const drop = ["items", "total", "pageSize"];
      const divergences = compareBodies(probes, targets, drop);
      expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
    });
  },
);

describe.skipIf(!live)(
  `M06.F09.I02 GET ${PATH_DETAIL} 四方比对 / M00.F01.I01`,
  () => {
    let probes: Probe[];

    beforeAll(async (ctx) => {
      probes = await withLiveExecSuite(ctx.name, () =>
        probeAll(targets, PATH_DETAIL),
      );
    }, 60_000);

    it("不存在 code → 各后端全 404", () => {
      for (const p of probes) {
        expect(p.status, `${p.target} 期望 404 实得 ${p.status}`).toBe(404);
      }
    });

    it("404 envelope shape 全等", () => {
      const divergences = compareBodies(probes, targets, DROP_404);
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

// CT 本地锚 M96.F02.I03（SSOT 侧 GET list 走 ADR-0034 §3 自然豁免无 I##，同 param-interfaces 先例）
describe.skipIf(!live)(
  `M96.F02.I03 GET ${PATH_LINKS} 四方比对 / M01.F04.I02`,
  () => {
    let probes: Probe[];

    beforeAll(async (ctx) => {
      probes = await withLiveExecSuite(ctx.name, () =>
        probeAll(targets, PATH_LINKS),
      );
    }, 60_000);

    it("每个目标都返回 200", () => {
      const bad = probes.filter((p) => p.status !== 200);
      expect(
        bad,
        `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`,
      ).toEqual([]);
    });

    it("Page<ReportNameInterfaceLink> envelope 必填", () => {
      for (const p of probes) {
        const body = p.body as Record<string, unknown>;
        for (const key of ["page", "pageSize", "total", "items"]) {
          expect(body[key], `${p.target} links list 缺 ${key}`).toBeDefined();
        }
        expect(Array.isArray(body.items), `${p.target} items 应是数组`).toBe(
          true,
        );
      }
    });

    it("normalize 后骨架全等（links 短信封 pageSize 数据派生，drop）", () => {
      const drop = ["items", "total", "pageSize"];
      const divergences = compareBodies(probes, targets, drop);
      expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
    });
  },
);
