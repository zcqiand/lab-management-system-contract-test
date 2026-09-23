// Task 4.2 评审补充：prewarmTargets 降级分支故障注入单测（unit 层，不依赖 live 栈）。
//
// 三个场景（评审清单第 2 条）：
//   a. health 预算内未就绪（fetch 恒拒）→ warn「未就绪」含目标名，不尝试登录
//   b. login 抛错                        → warn「登录预热失败」含目标名，probeGet 不调用
//   c. 登录挂起耗尽单目标预算            → 跳过 /api/auth/me 探针，warn「预算耗尽」
// 共同断言：prewarmTargets 一律 resolve 不 throw（预热失败不硬红，环境问题 exit 2
// 语义归 gate 不归测试）。
//
// 手法：vi.mock src/http.js（login/probeGet 可控）+ vi.stubGlobal fetch（health 可控）
// + vi.useFakeTimers（90s/180s 封顶秒级快进，Date.now 同步被 fake）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TARGETS } from "../src/targets.js";

const { login, probeGet } = vi.hoisted(() => ({
  login: vi.fn(),
  probeGet: vi.fn(),
}));

vi.mock("../src/http.js", () => ({ login, probeGet }));

import { prewarmTargets } from "../src/prewarm.js";

/** 把 console.warn 输出拼成单串，便于断言目标名/关键词。 */
function warnedText(): string {
  return (console.warn as ReturnType<typeof vi.fn>).mock.calls
    .map((c) => c.map(String).join(" "))
    .join("\n");
}

describe("prewarmTargets 降级分支（故障注入，unit 层）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a. health 预算内未就绪 → resolve 不 throw、不登录、warn 含目标名", async () => {
    login.mockResolvedValue("tok");
    probeGet.mockResolvedValue({ target: "nextjs", status: 200, body: {} });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const p = prewarmTargets([TARGETS.nextjs]);
    for (let i = 0; i < 95 && p instanceof Promise; i++) {
      // 单目标 90s 预算，1s 轮询粒度，95s 快进必耗尽
      await vi.advanceTimersByTimeAsync(1000);
    }
    await expect(p).resolves.toBeUndefined();
    expect(login).not.toHaveBeenCalled();
    expect(probeGet).not.toHaveBeenCalled();
    const warned = warnedText();
    expect(warned).toContain("nextjs");
    expect(warned).toContain("未就绪");
  });

  it("b. login 抛错 → resolve 不 throw、probeGet 不再调用、warn 含目标名", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200 })),
    );
    login.mockRejectedValue(new Error("登录链炸了"));
    await expect(prewarmTargets([TARGETS.aspnetcore])).resolves.toBeUndefined();
    expect(probeGet).not.toHaveBeenCalled();
    const warned = warnedText();
    expect(warned).toContain("aspnetcore");
    expect(warned).toContain("登录预热失败");
  });

  it("c. 登录挂起耗尽预算 → 跳过 /api/auth/me、resolve 不 throw、warn 含目标名", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200 })),
    );
    let resolveLogin!: (t: string) => void;
    login.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    const p = prewarmTargets([TARGETS.springboot]);
    // login 挂起期间快进 95s，越过单目标 90s deadline → 登录后边界复查命中
    for (let i = 0; i < 95; i++) await vi.advanceTimersByTimeAsync(1000);
    resolveLogin("tok");
    await expect(p).resolves.toBeUndefined();
    expect(probeGet).not.toHaveBeenCalled();
    const warned = warnedText();
    expect(warned).toContain("springboot");
    expect(warned).toContain("预算耗尽");
  });
});
