// M96.F02 — /api/contracts 列表 + 详情 + CRUD 写端点 四方比对（Phase 1+2）。
//
// SSOT: contracts.tsp M02.F01.I01 (list) + M02.F01.I02 (create) + M02.F01.I03 (detail) +
//       M02.F01.I04 (update) + M02.F01.I05 (delete)。
//
// 共库 V015 seed 提供 contract 行；三后端共库 → ID 直比不 drop。
// 写端点共库约束：code 必须全局唯一 → 走 uniqueName("ct") 唯一化，registerCleanup DELETE 兜底。
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compareAll, compareBodies, formatDivergences, type Probe } from "../src/compare.js";
import { probeAll, probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { clearCleanups, registerCleanup, runCleanups } from "../src/teardown.js";

const PATH_LIST = "/api/contracts";
const DEAD_ID = "00000000-0000-0000-0000-00000000dead";
// SSOT 覆盖解析器只认字面字符串常量 —— 不能用模板字面拼接（见 scripts/check_ssot_coverage.mjs constMap 收集规则）。
const PATH_DETAIL = "/api/contracts/00000000-0000-0000-0000-00000000dead";

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

  it("Page<Contract> envelope 必填（page/pageSize/total/items）", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      for (const key of ["page", "pageSize", "total", "items"]) {
        expect(body[key], `${p.target} list 缺 ${key}`).toBeDefined();
      }
      expect(Array.isArray(body.items), `${p.target} items 应是数组`).toBe(true);
    }
  });

  it("分页 defaults 全等（page=0, pageSize=20）", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      expect(body.page, `${p.target} 默认 page 应为 0`).toBe(0);
      expect(body.pageSize, `${p.target} 默认 pageSize 应为 20`).toBe(20);
    }
  });

  it("normalize 后骨架全等（items/total 漂移，drop）", () => {
    const drop = ["items", "total"];
    const divergences = compareBodies(probes, targets, drop);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

// 详情走 DEAD_ID 验 404 envelope —— 不依赖具体 contract 存在。
// （DEAD_ID / PATH_DETAIL 在文件首部声明以被 SSOT 覆盖解析器扫描。）

describe.skipIf(!live)(`M96.F02.I03 GET ${PATH_DETAIL} 四方比对 / M01.F04.I02`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAll(targets, PATH_DETAIL);
  }, 60_000);

  it("不存在 id → 4 后端全 404（契约面是错误码，不是 200+空对象）", () => {
    for (const p of probes) {
      expect(p.status, `${p.target} 404 期望 404 实得 ${p.status}`).toBe(404);
    }
  });

  it("404 envelope shape 全等（前端 catch 分支依赖）", () => {
    // 各家 ErrorResponse 命名不同（aspnetcore: ProblemDetails；
    // springboot: {code,message,path}；nextjs: {error,message}），drop 后骨架必一致
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

describe.runIf(!live)("四方比对未运行（提示，不覆盖任何功能 ID）", () => {
  it("打印启用方式", () => {
    expect(targets.length).toBeLessThan(2);
  });
});

// ────────── Phase 2: 写端点 ──────────

interface ContractCtx {
  /** M96.F02.I02 各 target 创的 contract id（每家自己持有，给 I04/I05 用）。 */
  ids: Map<string, string>;
}

const ctx: ContractCtx = { ids: new Map() };

describe.skipIf(!live)(`M96.F02.I02 POST ${PATH_LIST} 四方比对 / M00.F01.I01`, () => {
  beforeAll(() => {
    clearCleanups();
    ctx.ids.clear();
  }, 30_000);

  for (const target of targets) {
    it(`${target.name} 创 contract 返回 200/201 + 字段齐全`, async () => {
      const code = uniqueName("ct");
      const r = await probeRequest(target, {
        method: "POST",
        path: PATH_LIST,
        body: { code, name: `contract-test ${code}` },
      });
      expect([200, 201], `${target.name} POST 期望 200/201 实得 ${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`).toContain(r.status);
      const body = r.body as Record<string, unknown>;
      for (const key of ["id", "code", "name"]) {
        expect(body[key], `${target.name} POST 响应缺 ${key}`).toBeDefined();
      }
      const id = String(body.id);
      ctx.ids.set(target.name, id);
      // 兜底 cleanup：I05 删除失败时这一行还在，下次跑撞 UNIQUE(code)。
      registerCleanup(`delete-contract:${target.name}`, async () => {
        const tr = await probeRequest(target, { method: "DELETE", path: `${PATH_LIST}/${id}` });
        if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
          console.warn(`[teardown] delete contract ${target.name} status=${tr.status}`);
        }
      });
    }, 30_000);
  }

  it("normalize 后成功响应字段一致（除唯一值/时间戳）", async () => {
    const probes = [];
    for (const t of targets) {
      const code = uniqueName("ct-shape");
      const r = await probeRequest(t, {
        method: "POST",
        path: PATH_LIST,
        body: { code, name: `shape ${code}` },
      });
      expect([200, 201]).toContain(r.status);
      // shape 探针创建的行也要清 —— 不注册 cleanup 会污染共库（total 计数漂移）
      const shapeId = String((r.body as Record<string, unknown>).id);
      registerCleanup(`delete-shape-contract:${t.name}:${shapeId.slice(-8)}`, async () => {
        const tr = await probeRequest(t, { method: "DELETE", path: `${PATH_LIST}/${shapeId}` });
        if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
          console.warn(`[teardown] shape delete ${t.name} status=${tr.status}`);
        }
      });
      probes.push(r);
    }
    const drop = ["id", "code", "name"];
    const divergences = compareBodies(probes, targets, drop);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  }, 60_000);
});

describe.skipIf(!live)(`M96.F02.I04 PUT /api/contracts/{id} 四方比对 / M01.F04.I01`, () => {
  for (const target of targets) {
    it(`${target.name} 改 name → 200`, async () => {
      const id = ctx.ids.get(target.name);
      if (!id) throw new Error(`${target.name} I02 未创建 contract，跳过 I04`);
      const r = await probeRequest(target, {
        method: "PUT",
        path: `${PATH_LIST}/${id}`,
        body: { name: `renamed-${uniqueName("ct")}` },
      });
      expect([200], `${target.name} PUT 期望 200 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)(`M96.F02.I05 DELETE /api/contracts/{id} 四方比对 / M01.F05.I02`, () => {
  it("I02 的 contract 删除 → 200/204 + 重复删 → 404（幂等）", async () => {
    for (const target of targets) {
      const id = ctx.ids.get(target.name);
      if (!id) throw new Error(`${target.name} I02 未创建 contract，跳过 I05`);
      const first = await probeRequest(target, { method: "DELETE", path: `${PATH_LIST}/${id}` });
      expect([200, 204], `${target.name} DELETE 期望 200/204 实得 ${first.status}`).toContain(first.status);
      const second = await probeRequest(target, { method: "DELETE", path: `${PATH_LIST}/${id}` });
      expect([404, 204], `${target.name} 重复删期望 404/204 实得 ${second.status}`).toContain(second.status);
      ctx.ids.delete(target.name); // 已删，teardown 不再兜底这行
    }
  }, 60_000);

  afterAll(async () => {
    await runCleanups();
    for (const [tname, id] of ctx.ids) {
      const t = (await import("../src/targets.js")).TARGETS[tname];
      if (!t) continue;
      const r = await probeRequest(t, { method: "DELETE", path: `${PATH_LIST}/${id}` });
      if (r.status !== 200 && r.status !== 204 && r.status !== 404) {
        console.warn(`[teardown] final delete contract ${tname} status=${r.status}`);
      }
    }
  }, 60_000);
});