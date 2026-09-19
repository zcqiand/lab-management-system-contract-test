// 池项 5.12（2026-09-19 用户裁定）：探活重试原语单测 —— 全部注入 fetch + 假定时器，
// 不需要真 live 栈（禁碰令：不得 kill/重启 5100-5210 端口进程）。
//
// 裁定场景（brief red-first 清单）：
//   1. 前 2 次失败第 3 次成功 → 判活（修前：单次失败即死 = 红）
//   2. 全部尝试失败 → 判死，attempts 逐次留痕耗时与原因（可诊断性是裁定的一半）
//   3. 单次超时 10s 封顶：挂起请求被定时器打断，reason 含 timeout
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeOnce, probeWithRetry } from "../src/probe.js";

/** 假定时器下推进直到 promise 落定（退避/超时全是 setTimeout，虚拟化后秒级快进）。 */
async function settle<T>(p: Promise<T>): Promise<T> {
  for (let i = 0; i < 120 && p instanceof Promise; i++) {
    await vi.advanceTimersByTimeAsync(1000);
  }
  return p;
}

describe("probeOnce（单次探针，unit 层）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("2xx → ok=true、reason 空串；非 2xx → ok=false、reason 含状态码", async () => {
    const okRes = await settle(
      probeOnce("http://t/health", 10_000, async () => ({ ok: true, status: 200 }) as Response),
    );
    expect(okRes.ok).toBe(true);
    expect(okRes.reason).toBe("");
    expect(typeof okRes.durationMs).toBe("number");

    const bad = await settle(
      probeOnce("http://t/health", 10_000, async () => ({ ok: false, status: 404 }) as Response),
    );
    expect(bad.ok).toBe(false);
    expect(bad.reason).toContain("404");
  });

  it("挂起 fetch 在 timeoutMs 到点被打断（即便假 fetch 无视 abort signal 也必返回）", async () => {
    const r = await settle(
      probeOnce("http://t/health", 10_000, () => new Promise<Response>(() => {})),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("timeout");
  });
});

describe("probeWithRetry（探活重试原语，unit 层）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("裁定场景 1：前 2 次失败第 3 次成功 → 判活，attempts.length=3", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls <= 2) throw new Error("ECONNRESET");
      return { ok: true, status: 200 } as Response;
    });
    const r = await settle(probeWithRetry({ url: "http://t/health", fetchImpl }));
    expect(r.ok).toBe(true);
    expect(r.attempts).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("裁定场景 2：3 次全败 → 判死，attempts 逐次留痕耗时与原因（可诊断性）", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 }) as Response);
    const r = await settle(probeWithRetry({ url: "http://t/health", fetchImpl }));
    expect(r.ok).toBe(false);
    expect(r.attempts).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const a of r.attempts) {
      expect(typeof a.durationMs).toBe("number");
      expect(a.reason).toContain("503");
    }
    // 汇总 reason 含全部证据与尝试计数
    expect(r.reason).toMatch(/3\/3/);
    expect(r.reason).toContain("503");
  });

  it("单次超时 10s 封顶：挂起请求每轮都被定时器打断 → 每次尝试 reason 含 timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const r = await settle(
      probeWithRetry({ url: "http://t/health", timeoutMs: 10_000, fetchImpl }),
    );
    expect(r.ok).toBe(false);
    expect(r.attempts).toHaveLength(3);
    for (const a of r.attempts) expect(a.reason).toContain("timeout");
  });

  it("退避节奏：第 2/3 次尝试分别在第 1s、第 3s 时刻发出（指数退避）", async () => {
    const stamps: number[] = [];
    const fetchImpl = vi.fn(async () => {
      stamps.push(Date.now());
      return { ok: false, status: 500 } as Response;
    });
    await settle(
      probeWithRetry({ url: "http://t/health", backoffMs: [1_000, 2_000], fetchImpl }),
    );
    expect(stamps).toHaveLength(3);
    expect(stamps[1] - stamps[0]).toBe(1_000);
    expect(stamps[2] - stamps[0]).toBe(3_000);
  });
});
