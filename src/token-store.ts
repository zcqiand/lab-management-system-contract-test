// 跨文件进程 disk token 缓存（REQ-2026-023 live r4 后整改，2026-10-11）。
//
// 症状：vitest 每个测试文件是独立进程，http.ts 的 tokenCache（Map）不跨进程，
// 全量 live 一轮 = 37 文件 × 5 目标 = ~185 条登录链，其中 ~180 条纯属重复；
// 每条登录链 = 4 次出站 saas ≈ 8-24 条 PG 查询 × 跨境链路 RTT（dev 机 PG 走
// Tailscale ~216ms/条，拥塞期丢包重传再 +1-10s），单链 10-30s+——既是整轮耗时
// 的大头（~30-55min/84min），也是 502 SAAS_UNAVAILABLE / testTimeout 散红的
// 暴露面。
//
// 语义：globalSetup 开场 resetDiskTokens()（弃上轮残留）→ prewarm 登录链产出
// 的 token 经 login() 落盘 → 各文件进程 login() 先查盘。按 target name 分键，
// 「token 不跨后端复用」约束不违。新鲜度 30min 封顶（lab JWT TTL 3600s，全轮
// 串行 ≤90min 内可能越线，故不放宽到 TTL）——过期 miss 走正常登录；probeRequest
// 的 401 force 重登自愈是第二层兜底（后端重启/换签名钥场景）。
// store 读写失败一律静默（try/catch 吞）——store 是优化不是依赖，故障永不染色。
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface StoredEntry {
  token: string;
  issuedAt: number;
}

/** 单文件放 tmpdir：本机单 CT live run 纪律下无并发写竞争；每 run 开场清盘。 */
export function storePath(): string {
  return join(tmpdir(), "lab-ct-live-tokens.json");
}

const MAX_AGE_MS = 30 * 60_000;

function readAll(): Record<string, StoredEntry> {
  try {
    return JSON.parse(readFileSync(storePath(), "utf8")) as Record<
      string,
      StoredEntry
    >;
  } catch {
    return {};
  }
}

/** 未写入/过期/文件损坏 → null（不 throw）。 */
export function loadDiskToken(name: string): string | null {
  const entry = readAll()[name];
  if (!entry?.token) return null;
  if (Date.now() - entry.issuedAt > MAX_AGE_MS) return null;
  return entry.token;
}

/** 合并写单键（force 重登覆盖旧值）。失败静默。 */
export function saveDiskToken(name: string, token: string): void {
  try {
    writeFileSync(
      storePath(),
      JSON.stringify({ ...readAll(), [name]: { token, issuedAt: Date.now() } }),
    );
  } catch {
    // store 故障永不染色本轮
  }
}

/** 每 run 开场弃上轮残留（globalSetup 调）。失败静默。 */
export function resetDiskTokens(): void {
  try {
    rmSync(storePath());
  } catch {
    // 不存在/占用都无所谓
  }
}
