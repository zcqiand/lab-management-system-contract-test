// ADR-0018: vitest.globalSetup 进程级一次, 不是 setupFiles（每 worker 跑一次浪费）。
// unit 模式（无 CONTRACT_TARGETS）early-return — 不连后端。
//
// Task 4.2（2026-09-18 遗留整改）: live 模式先预热再清理。
// 栈刚起时首个请求链（nextjs 冷编译 / springboot 冷 JIT 登录）能把单测拖过
// vitest 30s testTimeout —— 瞬时假红。预热（health 轮询 + 真登录 + /api/auth/me）
// 把冷启动成本移到测试窗口外；失败只警告不染色（prewarm.ts 头注释）。
//
// 双层兜底: 本钩子 + afterAll runCleanups。
// - globalSetup 防上次跑残留污染
// - registerCleanup 清本次跑（Ctrl+C 中断时也能清当次行）
import { rmSync } from "node:fs";
import path from "node:path";

import { cleanupAllProbeRows } from "../src/cleanup-pg.js";
import { prewarmTargets } from "../src/prewarm.js";
import { selectedTargets } from "../src/targets.js";

export async function setup(): Promise<void> {
  // ADR-0040：live/unit 两模式都清 live-exec.jsonl 残留——unit 模式留旧文件，
  // 下次 flush 会把陈旧分组当成本 run 执行面（spec §2 生命周期）。
  // 有意不用 src/live-floor.ts 的 resetLiveExecLog()：该模块顶部 import "vitest"
  // （getCurrentSuite），而 vitest 2.x 在 globalSetup 上下文导入 vitest 直接崩
  // （「Vitest failed to access its internal state」，静态与动态 import 均复现，
  // 2026-09-22 实证）。此处按 live-floor.ts 的 LIVE_EXEC_FILE 同款路径内联删除；
  // 两处路径必须同步改（消费侧 resetLiveExecLog 的语义与本行等价）。
  rmSync(path.resolve(".state", "live-exec.jsonl"), { force: true });
  if (!process.env.CONTRACT_TARGETS) return;
  // selectedTargets() 对不认识的目标名抛 TargetError —— 显式声明写错名是配置错误，
  // 不是环境瞬时问题，按「声明了就必须可达」fail-fast，不属预热豁免范围。
  const targets = selectedTargets();
  await prewarmTargets(targets);
  await cleanupAllProbeRows();
}
