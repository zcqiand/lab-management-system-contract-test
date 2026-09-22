// M96.F02 — /api/report-names 列表 + 详情 + 3 junction links 四方比对（Phase 1: GET 读端点）。
//
// SSOT: report-names.tsp M06.F07 报告名称 CRUD + 3 junction link/unlink。
// 本文件覆盖：GET list + GET {code} + GET links/object + GET links/standard + GET links/parameter。
// POST/PUT/DELETE/link/unlink 是 Phase 2。
//
// **L2 SSOT 覆盖解析器只扫字面字符串 const 与字面 describe 标题**，
// 不能用 `for...of` 循环生成 describe 标题（源码里 `${link.id}` 是字面 `${`）。
import { beforeAll, describe, expect, it } from "vitest";

import { compareAll, compareBodies, formatDivergences, type Probe } from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { withLiveExecSuite } from "../src/live-floor.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_LIST = "/api/report-names";
// 详情路径用 UUID sentinel：SSOT 覆盖解析器把 UUID 段归一为 `{*}`，与 SSOT `{code}` 对齐。
const PATH_DETAIL = "/api/report-names/00000000-0000-0000-0000-00000000dead";
const PATH_LINK_OBJECT = "/api/report-names/links/object";
const PATH_LINK_STANDARD = "/api/report-names/links/standard";
const PATH_LINK_PARAMETER = "/api/report-names/links/parameter";

const targets: Target[] = selectedTargets();
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
// pageSize 缺省是数据派生（wrapDict/短信封 = total/items.length）：
// aspnetcore memory provider 空仓 ≠ PG total → 跨 provider 恒不等，与 items/total 同列 drop。
const DROP_LIST = ["items", "total", "pageSize"];

describe.skipIf(!live)(`M96.F02.I01 GET ${PATH_LIST} 四方比对 / M01.F05.I01`, () => {
  let probes: Probe[];

  beforeAll(async (ctx) => {
    probes = await withLiveExecSuite(ctx.name, () => probeAll(targets, PATH_LIST));
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("Page<InspectionReportName> envelope 必填", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of ["page", "pageSize", "total", "items"]) {
        expect(body[key], `${p.target} list 缺 ${key}`).toBeDefined();
      }
      expect(Array.isArray(body.items), `${p.target} items 应是数组`).toBe(true);
    }
  });

  it("normalize 后骨架全等（items/total 漂移，drop）", () => {
    const divergences = compareBodies(probes, targets, DROP_LIST);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

describe.skipIf(!live)(`M96.F02.I02 GET ${PATH_DETAIL} 四方比对 / M00.F01.I01`, () => {
  let probes: Probe[];

  beforeAll(async (ctx) => {
    probes = await withLiveExecSuite(ctx.name, () => probeAll(targets, PATH_DETAIL));
  }, 60_000);

  it("不存在 code → 4 后端全 404", () => {
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
});

describe.skipIf(!live)(`M96.F02.I06 GET ${PATH_LINK_OBJECT} 四方比对 / M04.F06.I02`, () => {
  let probes: Probe[];

  beforeAll(async (ctx) => {
    probes = await withLiveExecSuite(ctx.name, () => probeAll(targets, PATH_LINK_OBJECT));
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("Page envelope 必填", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of ["page", "pageSize", "total", "items"]) {
        expect(body[key], `${p.target} object list 缺 ${key}`).toBeDefined();
      }
      expect(Array.isArray(body.items), `${p.target} items 应是数组`).toBe(true);
    }
  });

  it("normalize 后骨架全等", () => {
    const divergences = compareBodies(probes, targets, DROP_LIST);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

describe.skipIf(!live)(`M96.F02.I07 GET ${PATH_LINK_STANDARD} 四方比对 / M04.F06.I03`, () => {
  let probes: Probe[];

  beforeAll(async (ctx) => {
    probes = await withLiveExecSuite(ctx.name, () => probeAll(targets, PATH_LINK_STANDARD));
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("Page envelope 必填", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of ["page", "pageSize", "total", "items"]) {
        expect(body[key], `${p.target} standard list 缺 ${key}`).toBeDefined();
      }
      expect(Array.isArray(body.items), `${p.target} items 应是数组`).toBe(true);
    }
  });

  it("normalize 后骨架全等", () => {
    const divergences = compareBodies(probes, targets, DROP_LIST);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

describe.skipIf(!live)(`M96.F02.I08 GET ${PATH_LINK_PARAMETER} 四方比对 / M04.F06.I04`, () => {
  let probes: Probe[];

  beforeAll(async (ctx) => {
    probes = await withLiveExecSuite(ctx.name, () => probeAll(targets, PATH_LINK_PARAMETER));
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("Page envelope 必填", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of ["page", "pageSize", "total", "items"]) {
        expect(body[key], `${p.target} parameter list 缺 ${key}`).toBeDefined();
      }
      expect(Array.isArray(body.items), `${p.target} items 应是数组`).toBe(true);
    }
  });

  it("normalize 后骨架全等", () => {
    const divergences = compareBodies(probes, targets, DROP_LIST);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

