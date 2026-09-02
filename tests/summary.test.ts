// M96.F02 — /api/summary 仪表盘汇总 四方比对（Phase 1: GET 读端点）。
//
// SSOT：summary.tsp M05.F01 报告汇总 + M05 仪表盘统计。
// 数据从共库 V015 seed 聚合而来 —— 分页参数不存在，是单对象 GET。
// 4 后端数据点计数漂移（其它测试在本轮加写探针），只比 shape。
import { beforeAll, describe, expect, it } from "vitest";

import { compareAll, compareBodies, formatDivergences, type Probe } from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_SUMMARY = "/api/summary";
const PATH_STATS = "/api/summary/stats";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)(`M96.F02.I01 GET ${PATH_SUMMARY} 四方比对`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAll(targets, PATH_SUMMARY);
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("SummaryData 必填字段齐全（summaryName/columns/rows）", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      expect(body.summaryName, `${p.target} 少了 summaryName`).toBeDefined();
      expect(Array.isArray(body.columns), `${p.target} columns 应是数组`).toBe(true);
      expect(Array.isArray(body.rows), `${p.target} rows 应是数组`).toBe(true);
    }
  });

  it("normalize 后骨架全等（rows 计数漂移，drop）", () => {
    // 4 后端计数随本轮写测试并行漂移，不是契约面
    const drop = ["rows", "summaryName"];
    const divergences = compareBodies(probes, targets, drop);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

describe.skipIf(!live)(`M96.F02.I02 GET ${PATH_STATS} 四方比对`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAll(targets, PATH_STATS);
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("DashboardStats 必填字段齐全", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of [
        "contractCount",
        "receiptCount",
        "sampleCount",
        "reportCountByStatus",
        "pendingTaskCount",
      ]) {
        expect(body[key], `${p.target} 少了 ${key}`).toBeDefined();
      }
      const rcs = body.reportCountByStatus as Record<string, unknown>;
      expect(rcs, `${p.target} reportCountByStatus 应是对象`).toBeDefined();
      for (const key of ["draft", "reviewing", "issued"]) {
        expect(rcs[key], `${p.target} reportCountByStatus 少了 ${key}`).toBeDefined();
      }
    }
  });

  it("normalize 后骨架全等（计数随本轮写测试漂移，drop）", () => {
    const drop = ["contractCount", "receiptCount", "sampleCount", "pendingTaskCount", "reportCountByStatus"];
    const divergences = compareBodies(probes, targets, drop);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

// 状态码 + shape + normalize 由前面两个 describe 覆盖。
describe.runIf(!live)("四方比对未运行（提示，不覆盖任何功能 ID）", () => {
  it("打印启用方式", () => {
    expect(targets.length).toBeLessThan(2);
  });
});