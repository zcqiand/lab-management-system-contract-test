// M96.F02 — /api/inspection/{specialties,objects,parameters,standards} + 4 个 link 列表 四方比对（Phase 1）。
//
// SSOT: inspection-dictionary.tsp M06.F01/F02/F03/F04 + 4 junction link/unlink。
// 4 个 list 端点 page/pageSize/total/items + 4 个 junction list 端点。
// 本文件只覆盖 GET list；create/update/delete/link/unlink 是 Phase 2 写端点。
//
// **L2 SSOT 覆盖解析器（check_ssot_coverage.mjs）只扫字面字符串 const 与字面 describe 标题**：
// 不能用 `for...of` 循环生成 describe 标题（源码里 `${table.id}` 是字面 `${`、不会被插值）。
// 8 个端点必须手写 8 段。
import { beforeAll, describe, expect, it } from "vitest";

import { compareBodies, formatDivergences, type Probe } from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_SPECIALTIES = "/api/inspection/specialties";
const PATH_OBJECTS = "/api/inspection/objects";
const PATH_PARAMETERS = "/api/inspection/parameters";
const PATH_STANDARDS = "/api/inspection/standards";
const PATH_LINK_SPECIALTY_OBJECT = "/api/inspection/links/specialty-object";
const PATH_LINK_OBJECT_PARAMETER = "/api/inspection/links/object-parameter";
const PATH_LINK_OBJECT_STANDARD = "/api/inspection/links/object-standard";
const PATH_LINK_STANDARD_PARAMETER = "/api/inspection/links/standard-parameter";

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

function assertStatus200(probes: Probe[], label: string) {
  const bad = probes.filter((p) => p.status !== 200);
  expect(bad, `${label} 非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
}

function assertBodies(probes: Probe[]) {
  const drop = ["items", "total"];
  const divergences = compareBodies(probes, targets, drop);
  expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
}

describe.skipIf(!live)(`M96.F02.I01 GET ${PATH_SPECIALTIES} 四方比对 / M01.F05.I01`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_SPECIALTIES);
  }, 60_000);
  it("每个目标都返回 200", () => assertStatus200(probes, "specialties"));
  it("Page envelope 必填", () => assertPageList(probes, "specialties"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes));
});

describe.skipIf(!live)(`M96.F02.I05 GET ${PATH_OBJECTS} 四方比对 / M01.F05.I02`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_OBJECTS);
  }, 60_000);
  it("每个目标都返回 200", () => assertStatus200(probes, "objects"));
  it("Page envelope 必填", () => assertPageList(probes, "objects"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes));
});

describe.skipIf(!live)(`M96.F02.I09 GET ${PATH_PARAMETERS} 四方比对 / M04.F07.I02`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_PARAMETERS);
  }, 60_000);
  it("每个目标都返回 200", () => assertStatus200(probes, "parameters"));
  it("Page envelope 必填", () => assertPageList(probes, "parameters"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes));
});

describe.skipIf(!live)(`M96.F02.I13 GET ${PATH_STANDARDS} 四方比对 / M04.F08.I03`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_STANDARDS);
  }, 60_000);
  it("每个目标都返回 200", () => assertStatus200(probes, "standards"));
  it("Page envelope 必填", () => assertPageList(probes, "standards"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes));
});

describe.skipIf(!live)(`M96.F02.I17 GET ${PATH_LINK_SPECIALTY_OBJECT} 四方比对 / M06.F02.I05`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_LINK_SPECIALTY_OBJECT);
  }, 60_000);
  it("每个目标都返回 200", () => assertStatus200(probes, "specialty-object"));
  it("Page envelope 必填", () => assertPageList(probes, "specialty-object"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes));
});

describe.skipIf(!live)(`M96.F02.I18 GET ${PATH_LINK_OBJECT_PARAMETER} 四方比对 / M06.F03.I02`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_LINK_OBJECT_PARAMETER);
  }, 60_000);
  it("每个目标都返回 200", () => assertStatus200(probes, "object-parameter"));
  it("Page envelope 必填", () => assertPageList(probes, "object-parameter"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes));
});

describe.skipIf(!live)(`M96.F02.I19 GET ${PATH_LINK_OBJECT_STANDARD} 四方比对 / M06.F04.I02`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_LINK_OBJECT_STANDARD);
  }, 60_000);
  it("每个目标都返回 200", () => assertStatus200(probes, "object-standard"));
  it("Page envelope 必填", () => assertPageList(probes, "object-standard"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes));
});

describe.skipIf(!live)(`M96.F02.I20 GET ${PATH_LINK_STANDARD_PARAMETER} 四方比对 / M06.F03.I05`, () => {
  let probes: Probe[];
  beforeAll(async () => {
    probes = await probeAll(targets, PATH_LINK_STANDARD_PARAMETER);
  }, 60_000);
  it("每个目标都返回 200", () => assertStatus200(probes, "standard-parameter"));
  it("Page envelope 必填", () => assertPageList(probes, "standard-parameter"));
  it("normalize 后骨架全等（items/total 漂移，drop）", () => assertBodies(probes));
});

describe.runIf(!live)("四方比对未运行（提示，不覆盖任何功能 ID）", () => {
  it("打印启用方式", () => {
    expect(targets.length).toBeLessThan(2);
  });
});