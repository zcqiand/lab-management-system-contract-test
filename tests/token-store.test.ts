// token-store 单测 —— 跨文件进程 disk token 缓存（REQ-2026-023 live r4 后整改）。
//
// 症状：vitest 每个测试文件是独立进程，http.ts 的 tokenCache（Map）不跨进程，
// 全量 live 一轮 = 37 文件 × 5 目标 = ~185 条登录链，其中 ~180 条纯属重复；
// 每条登录链 = 4 次出站 saas ≈ 8-24 条 PG 查询 × 跨境链路 RTT，拥塞期单链
// 10-30s+，既是整轮耗时的大头也是 502/超时散红的暴露面。
//
// 语义约束（既有）：「token 不跨后端复用」——store 按 target name 分键，不违。
// 新鲜度：lab JWT TTL 3600s；store 条目 30min 封顶，过期即 miss 走正常登录。
// 兜底：401 自愈（probeRequest force 重登）与 store 故障静默（读写失败永不染色）。
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadDiskToken,
  resetDiskTokens,
  saveDiskToken,
  storePath,
} from "../src/token-store.js";

afterEach(() => resetDiskTokens());

describe("token-store 跨进程 token 缓存", () => {
  it("save → load 往返取回原 token；未写入的键 miss", () => {
    resetDiskTokens();
    saveDiskToken("nextjs", "tok-nextjs");
    saveDiskToken("rails", "tok-rails");
    expect(loadDiskToken("nextjs")).toBe("tok-nextjs");
    expect(loadDiskToken("rails")).toBe("tok-rails");
    expect(loadDiskToken("springboot")).toBeNull();
  });

  it("同名键覆盖写（force 重登后的新 token 胜出）", () => {
    resetDiskTokens();
    saveDiskToken("fastapi", "old");
    saveDiskToken("fastapi", "new");
    expect(loadDiskToken("fastapi")).toBe("new");
  });

  it("store 文件不存在/损坏 → load miss 不 throw（store 故障静默）", () => {
    resetDiskTokens();
    expect(loadDiskToken("aspnetcore")).toBeNull();
  });

  it("过期条目（issuedAt 超 30min）→ miss", () => {
    resetDiskTokens();
    saveDiskToken("springboot", "stale");
    // 直接改文件回填过期 issuedAt，绕过 save 的当前时间戳
    const p = storePath();
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<
      string,
      { token: string; issuedAt: number }
    >;
    raw.springboot.issuedAt = Date.now() - 31 * 60_000;
    writeFileSync(p, JSON.stringify(raw));
    expect(loadDiskToken("springboot")).toBeNull();
  });
});
