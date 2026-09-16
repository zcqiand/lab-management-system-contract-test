// M96.F02 — /api/receipts/flow/queue 流程队列 四方比对（Phase 1: 读端点）。
//
// SSOT: report-flow.tsp。M03.F05/F06/F07/F08 共用同一 list 端点，stage 参数区分审核/批准/发放/归档。
// 本文件只覆盖 GET /receipts/flow/queue；POST /receipts/flow 是 Phase 2 写端点（批量流程动作）。
//
// queue 列表过滤后可能为空（无该 stage 的接样单）—— 仍要验证 status 200 + Page envelope shape。
import { beforeAll, describe, expect, it } from "vitest";

import { compareBodies, formatDivergences, type Probe } from "../src/compare.js";
import { probeAll } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_QUEUE = "/api/receipts/flow/queue";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)(`M96.F02.I01 GET ${PATH_QUEUE} 四方比对 / M01.F05.I01`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAll(targets, `${PATH_QUEUE}?stage=Reviewing`);
  }, 60_000);

  it("每个目标都返回 200（即使 items 为空）", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("Page<SampleReceipt> envelope 必填（page/pageSize/total/items）", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of ["page", "pageSize", "total", "items"]) {
        expect(body[key], `${p.target} queue 缺 ${key}`).toBeDefined();
      }
      expect(Array.isArray(body.items), `${p.target} queue items 应是数组`).toBe(true);
    }
  });

  it("normalize 后骨架全等（items/total 漂移，drop）", () => {
    const drop = ["items", "total"];
    const divergences = compareBodies(probes, targets, drop);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

