// M96.F02 — /api/param-interfaces 列表 + 详情 + links 四方比对（Phase 1: GET 读端点）。
//
// SSOT: param-interfaces.tsp M06.F08 参数界面 CRUD + link/unlink。
// 本文件覆盖：GET list + GET {code} + GET links。
// POST/PUT/DELETE/link/unlink 是 Phase 2。
import { beforeAll, describe, expect, it } from "vitest";

import { compareAll, compareBodies, formatDivergences, type Probe } from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_LIST = "/api/param-interfaces";
// SSOT 覆盖解析器只认字面字符串常量 + UUID 段（normalize 把 UUID 段归一为 `{*}`）。
// 详情路径用 UUID sentinel，与 SSOT `{code}` 模板对齐。
const PATH_DETAIL = "/api/param-interfaces/00000000-0000-0000-0000-00000000dead";
const PATH_LINKS = "/api/param-interfaces/links";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)(`M96.F02.I01 GET ${PATH_LIST} 四方比对 / M01.F05.I01`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAll(targets, PATH_LIST);
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("Page<ParamInterface> envelope 必填", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of ["page", "pageSize", "total", "items"]) {
        expect(body[key], `${p.target} list 缺 ${key}`).toBeDefined();
      }
      expect(Array.isArray(body.items), `${p.target} items 应是数组`).toBe(true);
    }
  });

  it("normalize 后骨架全等（items/total 漂移，drop）", () => {
    const drop = ["items", "total"];
    const divergences = compareBodies(probes, targets, drop);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

describe.skipIf(!live)(`M96.F02.I02 GET ${PATH_DETAIL} 四方比对 / M00.F01.I01`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAll(targets, PATH_DETAIL);
  }, 60_000);

  it("不存在 code → 4 后端全 404", () => {
    for (const p of probes) {
      expect(p.status, `${p.target} 期望 404 实得 ${p.status}`).toBe(404);
    }
  });

  it("404 envelope shape 全等", () => {
    const drop = ["code", "message", "error", "error_description", "details", "path", "timestamp", "traceId"];
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
});

describe.skipIf(!live)(`M96.F02.I03 GET ${PATH_LINKS} 四方比对 / M01.F04.I02`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAll(targets, PATH_LINKS);
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("Page<ParamInterfaceLink> envelope 必填", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of ["page", "pageSize", "total", "items"]) {
        expect(body[key], `${p.target} links list 缺 ${key}`).toBeDefined();
      }
      expect(Array.isArray(body.items), `${p.target} items 应是数组`).toBe(true);
    }
  });

  it("normalize 后骨架全等", () => {
    const drop = ["items", "total"];
    const divergences = compareBodies(probes, targets, drop);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

describe.runIf(!live)("四方比对未运行（提示，不覆盖任何功能 ID）", () => {
  it("打印启用方式", () => {
    expect(targets.length).toBeLessThan(2);
  });
});