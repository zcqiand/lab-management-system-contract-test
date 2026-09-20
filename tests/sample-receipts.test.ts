// M96.F02 — /api/receipts 列表 + 详情 + 流程历史 四方比对（Phase 1: GET 读端点）。
//
// SSOT: sample-receipts.tsp M03.F01/F02/F09。{id}/task (PUT) + 写 CRUD 是 Phase 2。
// 本文件覆盖：GET list + GET {id} + GET {id}/history。
import { beforeAll, describe, expect, it } from "vitest";

import { compareAll, compareBodies, formatDivergences, type Probe } from "../src/compare.js";
import { login, probeAll, probeGet } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_LIST = "/api/receipts";
const DEAD_ID = "00000000-0000-0000-0000-00000000dead";
// SSOT 覆盖解析器只认字面字符串常量（见 scripts/check_ssot_coverage.mjs constMap 收集）。
const PATH_DETAIL = "/api/receipts/00000000-0000-0000-0000-00000000dead";
const PATH_HISTORY = "/api/receipts/00000000-0000-0000-0000-00000000dead/history";

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

  it("Page<SampleReceipt> envelope 必填", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of ["page", "pageSize", "total", "items"]) {
        expect(body[key], `${p.target} receipts list 缺 ${key}`).toBeDefined();
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

describe.skipIf(!live)(`M96.F02.I03 GET ${PATH_DETAIL} 四方比对 / M01.F04.I02`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAll(targets, PATH_DETAIL);
  }, 60_000);

  it("不存在 id → 4 后端全 404", () => {
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

describe.skipIf(!live)(`M96.F02.I06 GET ${PATH_HISTORY} 四方比对 / M04.F06.I02`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAll(targets, PATH_HISTORY);
  }, 60_000);

  it("不存在 id → 4 后端全 404", () => {
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


// ── 5.57 receipts list filter 三态语义（shared 61093d4 入契约）──────────────
//
// 语义 SSOT = lab-nextjs db-queries.ts:53-58：
//   not_yet   = 停在 flowStatus 环节待提交；无 flowStatus 时 = 无流转记录新单
//   submitted = 已从本环节 submit 至下一环节；无 flowStatus 时 = 有流转记录且记录了提交人
//   不传       = 全部（第三态）
//
// 断言形态 = 各后端自身自洽（同一后端「不传」全集 vs 两态子集 + 谓词回验 + 命中锚），
// 不做跨后端 items/total 直比（items/total 漂移既有 drop 惯例，见上）。
//
// aspnetcore 已随 5.66 尾项落地（regen 至 shared 61093d4+ + SampleReceiptService
// filter 三态实现），重新参与本套件。skipIf(!live)：未设 CONTRACT_TARGETS 时静默跳过（unit 层）。
const FILTER_TARGETS: Target[] = targets;
// SSOT 覆盖解析器只认字面字符串常量；pageSize=500 取全量（分页截断会破坏子集关系）。
const PATH_LIST_FULL = "/api/receipts?pageSize=500";
const PATH_LIST_NOT_YET = "/api/receipts?pageSize=500&filter=not_yet";
const PATH_LIST_SUBMITTED = "/api/receipts?pageSize=500&filter=submitted";

interface ReceiptItem {
  id?: string;
  flowHistory?: unknown[];
  lastSubmittedBy?: string | null;
}

describe.skipIf(!live)(
  `M03.F01.I01 GET ${PATH_LIST} filter 三态语义（5.57，nextjs+springboot+aspnetcore）`,
  () => {
    it("not_yet/submitted 都是全集的真子集且互斥，谓词回验命中", async () => {
      for (const t of FILTER_TARGETS) {
        const token = await login(t);
        const all = (await probeGet(t, PATH_LIST_FULL, token)).body as {
          items?: ReceiptItem[];
        };
        const notYetRes = await probeGet(t, PATH_LIST_NOT_YET, token);
        const submittedRes = await probeGet(t, PATH_LIST_SUBMITTED, token);
        expect(notYetRes.status, `${t.name} filter=not_yet 期望 200`).toBe(200);
        expect(submittedRes.status, `${t.name} filter=submitted 期望 200`).toBe(200);

        const allItems = all.items ?? [];
        const notYet = (notYetRes.body as { items?: ReceiptItem[] }).items ?? [];
        const submitted = (submittedRes.body as { items?: ReceiptItem[] }).items ?? [];

        // 谓词回验：filter 结果每行必须满足对应谓词
        for (const r of notYet) {
          expect(
            (r.flowHistory ?? []).length,
            `${t.name} not_yet 含流转记录行 id=${r.id}`,
          ).toBe(0);
        }
        for (const r of submitted) {
          expect(
            (r.flowHistory ?? []).length,
            `${t.name} submitted 无流转记录行 id=${r.id}`,
          ).toBeGreaterThan(0);
          expect(
            r.lastSubmittedBy,
            `${t.name} submitted 缺 lastSubmittedBy id=${r.id}`,
          ).toBeTruthy();
        }

        // 子集 + 互斥（pageSize=500 已取全量，不受分页截断影响）
        const allIds = new Set(allItems.map((r) => String(r.id)));
        const notYetIds = new Set(notYet.map((r) => String(r.id)));
        const submittedIds = new Set(submitted.map((r) => String(r.id)));
        for (const id of notYetIds) {
          expect(allIds.has(id), `${t.name} not_yet id=${id} 不在全集`).toBe(true);
        }
        for (const id of submittedIds) {
          expect(allIds.has(id), `${t.name} submitted id=${id} 不在全集`).toBe(true);
          expect(notYetIds.has(id), `${t.name} id=${id} 同时命中两态`).toBe(false);
        }

        // 命中锚：全集里满足谓词的行必须出现在对应 filter 结果里（数据存在才触发）
        for (const r of allItems) {
          const id = String(r.id);
          if ((r.flowHistory ?? []).length === 0) {
            expect(notYetIds.has(id), `${t.name} 新单 id=${id} 未被 not_yet 命中`).toBe(true);
          } else if (r.lastSubmittedBy) {
            expect(
              submittedIds.has(id),
              `${t.name} 已提交单 id=${id} 未被 submitted 命中`,
            ).toBe(true);
          }
        }
      }
    }, 180_000);
  },
);
