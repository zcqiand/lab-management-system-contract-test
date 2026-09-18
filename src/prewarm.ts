// Task 4.2（2026-09-18 遗留整改）：live 冷启动预热钩子。
//
// 症状：live 模式 vitest testTimeout=30s（vitest.config.ts），栈刚起时首个请求链
// （nextjs dev 首访路由按需编译 + springboot 冷 JIT 首登录 + 共库 PG 连接池首建）
// 能把单测拖过 30s → 「Test timed out in 30000ms」瞬时假红。axios 侧 120s budget
// 吸收不了这个——死的是 vitest 层的 30s，不是 HTTP 层。
//
// 解法：globalSetup 在任何测试跑之前，对每个 CONTRACT_TARGETS 声明目标做预热——
//   1. 轮询各后端 health 端点至就绪（防「healthcheck 刚过、vitest 起来时又抖」）
//   2. 真登录一次（warm springboot JIT 登录链 / nextjs login route 编译）
//   3. 带 token 打一发 GET /api/auth/me（warm 鉴权中间件 + 首个数据路由编译）
//
// 预算：单目标封顶 90s、所有目标合计封顶 180s（3min）。探活用 node fetch +
// AbortSignal.timeout —— undici 不吃 HTTP_PROXY 环境变量，等价 curl --noproxy '*'。
//
// 硬约束：预热失败**只打警告不抛**——环境问题 exit 2 语义归 gate，不归测试；
// 预热只是把「冷启动瞬时超时」从概率事件降为不发生，绝不因预热失败把整轮染色。
// 后端真挂时由既有链路照常暴露：cleanup 抛 UnreachableError / 测试断言红。

import { login, probeGet } from "./http.js";
import type { Target } from "./targets.js";

/** 与 tests/fnReporter.ts HEALTH_PATHS 同源镜像（后端自定 health 路径，contract-test 改不了）。 */
const HEALTH_PATHS: Record<string, string> = {
  aspnetcore: "/health",
  springboot: "/actuator/health",
  nextjs: "/api/health",
};
const DEFAULT_HEALTH = "/health";

const PER_TARGET_CAP_MS = 90_000;
const TOTAL_CAP_MS = 180_000;
const POLL_INTERVAL_MS = 1_000;
const HEALTH_PROBE_TIMEOUT_MS = 5_000;

async function getJson(url: string, timeoutMs: number): Promise<number> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  return res.status;
}

/** 轮询 health 端点至 2xx。返回 true=就绪；false=预算内未就绪（调用方只警告）。 */
async function waitHealthy(target: Target, deadline: number): Promise<boolean> {
  const path = HEALTH_PATHS[target.name] ?? DEFAULT_HEALTH;
  const url = `${target.baseUrl}${path}`;
  for (;;) {
    const now = Date.now();
    if (now >= deadline) return false;
    try {
      const status = await getJson(url, HEALTH_PROBE_TIMEOUT_MS);
      if (status >= 200 && status < 300) return true;
    } catch {
      // 连接拒绝 / 超时 = 还没起好，继续轮询到预算耗尽
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/**
 * 对声明目标逐一预热。任何一步失败 → console.warn 并继续下一个目标，绝不 throw。
 * 顺序串行（与 fileParallelism: false 的串行测试一致），总预算 TOTAL_CAP_MS 兜底。
 */
export async function prewarmTargets(targets: readonly Target[]): Promise<void> {
  if (targets.length === 0) return;
  const totalDeadline = Date.now() + TOTAL_CAP_MS;
  console.log(
    `[prewarm] 开始预热 ${targets.length} 个目标（单目标 ≤90s，合计 ≤180s）: ` +
      targets.map((t) => t.name).join(", "),
  );
  for (const target of targets) {
    if (Date.now() >= totalDeadline) {
      console.warn(
        `[prewarm] 总预算 ${TOTAL_CAP_MS / 1000}s 耗尽，跳过剩余目标预热（不染色本轮）` +
          `—— 未预热: ${targets.slice(targets.indexOf(target)).map((t) => t.name).join(", ")}`,
      );
      return;
    }
    const deadline = Math.min(Date.now() + PER_TARGET_CAP_MS, totalDeadline);
    const healthy = await waitHealthy(target, deadline);
    if (!healthy) {
      console.warn(
        `[prewarm] ${target.name} 在预算内未就绪（${target.baseUrl}），跳过其登录预热` +
          `—— 后续测试照常跑，若真挂会由测试/Cleanup 照常暴露`,
      );
      continue;
    }
    const t0 = Date.now();
    try {
      const token = await login(target);
      await probeGet(target, "/api/auth/me", token);
      console.log(`[prewarm] ${target.name} 预热完成（health ✓ + 登录链 + /api/auth/me，${Date.now() - t0}ms）`);
    } catch (cause) {
      console.warn(
        `[prewarm] ${target.name} 登录预热失败（不染色本轮）: ` +
          (cause instanceof Error ? cause.message.split("\n")[0] : String(cause)),
      );
    }
  }
  console.log("[prewarm] 预热阶段结束");
}
