// M96.F02 — /api/catalog/{brands,models,specs,grades} 列表 四方比对（Phase 1: 读端点）。
//
// SSOT: inspection-catalog.tsp M04.F06/F07/F08/F09 4 个码表。每个表都 4 操作 (list/create/update/delete)
// —— 本文件只覆盖 4 个 list GET；create/update/delete 是 Phase 2 写端点。
//
// 4 表同构（page/pageSize/total/items + InspectionBrand/Model/Spec/Grade），用 helper 抽公共断言。
//
// **L2 SSOT 覆盖解析器（check_ssot_coverage.mjs）只扫字面字符串 const 与字面 describe 标题**：
// 不能用 `for...of` 循环生成 describe 标题（源码里 `${table.id}` 是字面 `${`、不会被插值）。
// 4 个表必须手写 4 段。
import { beforeAll, describe, expect, it } from "vitest";

import { compareBodies, formatDivergences, type Probe } from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_BRANDS = "/api/catalog/brands";
const PATH_MODELS = "/api/catalog/models";
const PATH_SPECS = "/api/catalog/specs";
const PATH_GRADES = "/api/catalog/grades";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

function assertPageList(probes: Probe[], label: string) {
  for (const p of probes) {
    const body = p.body as Record<string, unknown>;
    for (const key of ["page", "pageSize", "total", "items"]) {
      expect(body[key], `${p.target} ${label} 缺 ${key}`).toBeDefined();
    }
    expect(Array.isArray(body.items), `${p.target} ${label} items 应是数组`).toBe(true);
  }
}

function assertDefaults(probes: Probe[], label: string) {
  for (const p of probes) {
    const body = p.body as Record<string, unknown>;
    expect(body.page, `${p.target} ${label} 默认 page 应为 0`).toBe(0);
    expect(body.pageSize, `${p.target} ${label} 默认 pageSize 应为 20`).toBe(20);
  }
}

function assertCodeShape(probes: Probe[], label: string) {
  for (const p of probes) {
    const body = p.body as Record<string, unknown> & { items?: Array<Record<string, unknown>> };
    if ((body.items?.length ?? 0) === 0) continue;
    expect(body.items![0]!["code"], `${p.target} ${label} 首行缺 code`).toBeDefined();
  }
}

function assertBodies(probes: Probe[], label: string) {
  const drop = ["items", "total"];
  const divergences = compareBodies(probes, targets, drop);
  expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
}

describe.skipIf(!live)(`M96.F02.I01 GET ${PATH_BRANDS} 四方比对 / M01.F05.I01`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_BRANDS);
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });
  it("Page envelope 必填", () => assertPageList(probes, "brands"));
  it("分页 defaults 全等（page=0, pageSize=20）", () => assertDefaults(probes, "brands"));
  it("seed 首行 shape（code）", () => assertCodeShape(probes, "brands"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes, "brands"));
});

describe.skipIf(!live)(`M96.F02.I05 GET ${PATH_MODELS} 四方比对 / M01.F05.I02`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_MODELS);
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });
  it("Page envelope 必填", () => assertPageList(probes, "models"));
  it("分页 defaults 全等（page=0, pageSize=20）", () => assertDefaults(probes, "models"));
  it("seed 首行 shape（code）", () => assertCodeShape(probes, "models"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes, "models"));
});

describe.skipIf(!live)(`M96.F02.I09 GET ${PATH_SPECS} 四方比对 / M04.F07.I02`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_SPECS);
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });
  it("Page envelope 必填", () => assertPageList(probes, "specs"));
  it("分页 defaults 全等（page=0, pageSize=20）", () => assertDefaults(probes, "specs"));
  it("seed 首行 shape（code）", () => assertCodeShape(probes, "specs"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes, "specs"));
});

describe.skipIf(!live)(`M96.F02.I13 GET ${PATH_GRADES} 四方比对 / M04.F08.I03`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_GRADES);
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });
  it("Page envelope 必填", () => assertPageList(probes, "grades"));
  it("分页 defaults 全等（page=0, pageSize=20）", () => assertDefaults(probes, "grades"));
  it("seed 首行 shape（code）", () => assertCodeShape(probes, "grades"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes, "grades"));
});

describe.runIf(!live)("四方比对未运行（提示，不覆盖任何功能 ID）", () => {
  it("打印启用方式", () => {
    expect(targets.length).toBeLessThan(2);
  });
});