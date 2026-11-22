// M06.F10 — /api/calc evaluate + records 复现 CT（R2 Task 12 Step 3，REQ-2026-043）。
//
// SSOT: calc.tsp M06.F10 公式求值与记录复现。
// target 定格 [rules]：calc 归 rules canonical（R2 裁定——verdict 归服务），
// nextjs 无 calc 路由（src/app/api 下无 calc 目录）→ 单目标不比对
// （compareAll 单目标 no-op），断言按规则仓行为直接钉死；nextjs calc 面
// 若未来落契约，target 扩容另批。
import { beforeAll, describe, expect, it } from "vitest";

import { probeAllRequest, probeAnonymous } from "../src/http.js";
import { withLiveExecSuite } from "../src/live-floor.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH_EVAL = "/api/calc/evaluate";
// UUID sentinel：normalize 把 UUID 段归一为 `{*}`，与 SSOT /calc/records/{recordId} 对齐
const PATH_RECORD_MISSING =
  "/api/calc/records/00000000-0000-0000-0000-00000000dead";

const targets: Target[] = selectedTargets().filter((t) =>
  // R2（REQ-2026-043）：calc 归 rules canonical；nextjs 无 calc 路由
  ["rules"].includes(t.name),
);
const live = targets.length >= 1;

describe.skipIf(!live)(`M06.F10.I01 POST ${PATH_EVAL} 四方比对`, () => {
  let probe: { target: string; status: number; body: unknown };

  beforeAll(async (ctx) => {
    const probes = await withLiveExecSuite(ctx.name, () =>
      probeAllRequest(targets, {
        method: "POST",
        path: PATH_EVAL,
        body: {
          formula: "avg(R1, R2, R3)",
          contexts: [
            { R1: 33, R2: 34, R3: 35 },
            { R1: 30, R2: 31, R3: 32 },
          ],
          techReq: { comparison: "≥", minValue: 30 },
        },
      }),
    );
    probe = probes[0]!;
  }, 60_000);

  it("rules 返回 200", () => {
    expect(probe.status, `rules 期望 200 实得 ${probe.status}`).toBe(200);
  });

  it("CalcEvaluationResult：strengths/mean/verdict/errors 确定性断言", () => {
    const body = probe.body as {
      strengths: (number | null)[];
      mean: number | null;
      errors: unknown[];
      verdict: string;
    };
    expect(body.strengths).toEqual([34, 31]); // 无效组 null 非 0；这里全有效
    expect(body.mean).toBeCloseTo(32.5, 6); // 有效组全精度均值，引擎不修约
    expect(body.errors).toEqual([]);
    expect(body.verdict).toBe("合格"); // 服务侧 autoVerdict（≥30）
  });
});

describe.skipIf(!live)(
  `M06.F10.I02 GET ${PATH_RECORD_MISSING} 四方比对`,
  () => {
    let probe: { target: string; status: number; body: unknown };
    let anon: { status: number };

    beforeAll(async (ctx) => {
      const probes = await withLiveExecSuite(ctx.name, () =>
        probeAllRequest(targets, { method: "GET", path: PATH_RECORD_MISSING }),
      );
      probe = probes[0]!;
      const a = await probeAnonymous(targets[0]!, PATH_RECORD_MISSING);
      anon = { status: a.status };
    }, 60_000);

    it("不存在记录 → 404（tenant 收口语义）", () => {
      expect(probe.status, `rules 期望 404 实得 ${probe.status}`).toBe(404);
    });

    it("404 带 code 信封（NOT_FOUND）", () => {
      const body = probe.body as { code?: string };
      expect(body.code).toBe("NOT_FOUND");
    });

    it("缺 token → 401（BFF 全域 token 化，ADR-0019）", () => {
      expect(anon.status).toBe(401);
    });
  },
);
