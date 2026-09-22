// src/live-floor.ts
// live 执行面 side channel（ADR-0040 / REQ-2026-014，spec 2026-09-22 §2/§3）。
// 探针层每打到一个 HTTP 响应（任意 status——status 是被比对对象，4xx/5xx 由断言管）
// append 一行 {suite, target, status} 到 .state/live-exec.jsonl；fnReporter flush 时
// 合并计算 executed_per_describe_min 写进 trace.live_floor，随后删除文件。
//
// vitest 任务树没有 per-target 粒度（比对在 beforeAll/it 内部循环里），且 reporter 在
// 主进程、测试在 worker——磁盘是唯一可达通道。fileParallelism: false 已串行化，无并发写。
import { appendFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { getCurrentSuite } from "vitest";

const LIVE_EXEC_FILE = path.resolve(".state", "live-exec.jsonl");

export interface LiveExecRow {
  suite: string;
  target: string;
  status: number;
}

/** suite 名取不到（globalSetup/prewarm 等非 vitest 运行时上下文）→ null，探针不登记：预热不得虚增执行面。 */
function currentSuiteName(): string | null {
  try {
    return getCurrentSuite()?.name ?? null;
  } catch {
    return null; // 防御：vitest 运行时内部态在极端时序下可能不可用
  }
}

/** 探针出口点调用（probeGet / probeWithToken 成功拿到响应处）。无 suite 上下文则 no-op。 */
export function recordProbe(target: string, status: number): void {
  const suite = currentSuiteName();
  if (!suite) return;
  mkdirSync(path.dirname(LIVE_EXEC_FILE), { recursive: true });
  const row: LiveExecRow = { suite, target, status };
  appendFileSync(LIVE_EXEC_FILE, JSON.stringify(row) + "\n", "utf-8");
}

/** globalSetup 开跑时清残留。live/unit 两模式都要清——unit 留旧文件会让下次 flush 读到陈旧分组。 */
export function resetLiveExecLog(): void {
  rmSync(LIVE_EXEC_FILE, { force: true });
}

/**
 * fnReporter flush 用：合并 jsonl → 按 suite 分组的 distinct target 集合。
 * null = 文件缺失（mode=live 时是 side channel 故障信号；mode=unit 时是常态）。
 * 空 Map = 文件在但零记录（live 模式下即全部 describe 未探到任何目标 = 全塌缩）。
 */
export function readLiveExecGroups(): Map<string, Set<string>> | null {
  let text: string;
  try {
    text = readFileSync(LIVE_EXEC_FILE, "utf-8");
  } catch {
    return null;
  }
  const groups = new Map<string, Set<string>>();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const row = JSON.parse(t) as LiveExecRow;
      if (!groups.has(row.suite)) groups.set(row.suite, new Set());
      groups.get(row.suite)!.add(row.target);
    } catch {
      // 单行损坏跳过——半行写入不得毒化整批
    }
  }
  return groups;
}

/** fnReporter flush 读完即删，防残留污染下次 run。 */
export function deleteLiveExecLog(): void {
  rmSync(LIVE_EXEC_FILE, { force: true });
}
