// M96.F02 三方比对逻辑的单元覆盖 + M96.F03 目标声明。不需要后端在跑。
// 2026-09-15 Phase 2 去 msw：比对基准 = probes[0]（声明序首位）。
import { describe, expect, it } from "vitest";

import { type Probe, compareAll, compareBodies, compareStatuses } from "../src/compare.js";
import { TARGETS, TargetError, selectedTargets } from "../src/targets.js";

const REAL = [TARGETS.nextjs, TARGETS.aspnetcore, TARGETS.springboot];

function probe(target: string, status: number, body: unknown): Probe {
  return { target, status, body };
}

describe("M96.F02.I01 status 全等", () => {
  it("状态码一致时无分歧", () => {
    const probes = [probe("nextjs", 200, []), probe("aspnetcore", 200, [])];
    expect(compareStatuses(probes)).toEqual([]);
  });

  it("状态码分叉时点名是哪个后端", () => {
    // springboot 缺 M08 菜单这类缺口就会长这样：一个 200 一个 404。
    const probes = [probe("nextjs", 200, []), probe("springboot", 404, {})];
    const out = compareStatuses(probes);
    expect(out).toHaveLength(1);
    expect(out[0].target).toBe("springboot");
    expect(out[0].detail).toContain("404");
  });

  it("单个目标不比对", () => {
    expect(compareStatuses([probe("nextjs", 200, [])])).toEqual([]);
  });
});

describe("M96.F02.I02 normalize 后 body 全等", () => {
  it("只有字段顺序/日期格式不同 → 不算分歧", () => {
    const probes = [
      probe("nextjs", 200, [{ status: "active", joinedAt: "2026-08-29T10:00:00Z" }]),
      probe("aspnetcore", 200, [{ joinedAt: "2026-08-29T10:00:00+00:00", status: "active" }]),
    ];
    expect(compareBodies(probes, REAL)).toEqual([]);
  });

  it("字段值真不同 → 报分歧并指出第一处", () => {
    const probes = [
      probe("nextjs", 200, [{ status: "active" }]),
      probe("aspnetcore", 200, [{ status: "suspended" }]),
    ];
    const out = compareBodies(probes, REAL);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("body");
    expect(out[0].detail).toContain("分叉");
  });

  it("ID 参与比对 —— 三后端共库，UUID 本来就该相等", () => {
    const probes = [
      probe("aspnetcore", 200, [{ id: "aaa", status: "active" }]),
      probe("springboot", 200, [{ id: "bbb", status: "active" }]),
    ];
    expect(compareBodies(probes, REAL)).toHaveLength(1);
  });
});

describe("M96.F02 比对基准恒为 probes[0]（Phase 2 去 msw）", () => {
  it("三个 probe 全等 → 零 diff", () => {
    const body = [{ id: "u1", status: "active" }];
    const probes = [
      probe("nextjs", 200, body),
      probe("aspnetcore", 200, body),
      probe("springboot", 200, body),
    ];
    expect(compareAll(probes, REAL)).toEqual([]);
  });

  it("基准是 probes[0]：首元素分叉时，分歧点在其余两后端身上，不点基准自己", () => {
    const ok = { status: "active" };
    const odd = { status: "suspended" };
    const probes = [
      probe("nextjs", 500, odd),
      probe("aspnetcore", 200, ok),
      probe("springboot", 200, ok),
    ];
    const out = compareAll(probes, REAL);
    const targets = out.map((d) => d.target);
    expect(targets).toContain("aspnetcore");
    expect(targets).toContain("springboot");
    expect(targets).not.toContain("nextjs");
  });
});

describe("M96.F03.I01 目标端口声明", () => {
  it("三个目标端口与 conventions §6 一致（lab=5200 段，2026-09-02 端口分段）", () => {
    expect(Object.keys(TARGETS).sort()).toEqual(["aspnetcore", "nextjs", "springboot"]);
    expect(TARGETS.nextjs.baseUrl).toContain(":5201");
    expect(TARGETS.aspnetcore.baseUrl).toContain(":5204");
    expect(TARGETS.springboot.baseUrl).toContain(":5205");
  });
});

describe("M96.F03.I02 声明即必须可达", () => {
  // 「未声明目标时返回空」只在没设 CONTRACT_TARGETS 的单测模式才有意义；
  // live 模式下 CONTRACT_TARGETS 已设，这条断言的前提不成立。skipIf 隔离两条上下文。
  it.skipIf(!!process.env.CONTRACT_TARGETS)("未声明目标时返回空 —— 只跑单元测试", () => {
    expect(selectedTargets("")).toEqual([]);
    expect(selectedTargets(undefined)).toEqual([]);
  });

  it("声明了认识的目标就返回它们（声明序 = 比对序，首位是基准）", () => {
    expect(selectedTargets("nextjs,springboot").map((t) => t.name)).toEqual(["nextjs", "springboot"]);
  });

  it("声明了不认识的名字 → 抛错，不静默忽略", () => {
    // msw 自 Phase 2 起不再是合法目标 —— 用它当「不认识的名字」的反回归哨兵。
    expect(() => selectedTargets("msw,typo")).toThrow(TargetError);
  });
});

describe("M96.F02 compareAll 汇总", () => {
  it("status 与 body 的分歧都收进来", () => {
    const probes = [probe("nextjs", 200, [{ a: 1 }]), probe("springboot", 500, { code: "BOOM" })];
    expect(compareAll(probes, REAL).length).toBeGreaterThanOrEqual(2);
  });
});
