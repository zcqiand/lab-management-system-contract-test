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
// AbortController —— undici 不吃 HTTP_PROXY 环境变量，等价 curl --noproxy '*'。
// 池项 5.12：单针超时从 5s 提到 10s 封顶，走 src/probe.ts 的 probeOnce（超时双保险
// + 逐次留痕）；预算内轮询本身就是重试，判死（预算耗尽）时输出每次尝试的耗时与原因。
//
// 硬约束：预热失败**只打警告不抛**——环境问题 exit 2 语义归 gate，不归测试；
// 预热只是把「冷启动瞬时超时」从概率事件降为不发生，绝不因预热失败把整轮染色。
// 后端真挂时由既有链路照常暴露：cleanup 抛 UnreachableError / 测试断言红。

import { login, probeGet } from "./http.js";
import { probeOnce, type ProbeAttempt } from "./probe.js";
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
// 封顶语义：预算在**跨步边界**复查（health 就绪后、login 后各查一次 deadline），
// 不中断在途调用——单次 health 探针 10s 超时（5.12：原 5s 提到 10s 封顶），封顶实际
// 可溢出 ≤10s 有界；登录段溢出有界于单次 axios 调用（评审修正：半开后端 TCP 通永不
// 响应时，若不复查 deadline，90s/180s 封顶盖不住 axios 120s budget，单目标最坏 ~7 分钟）。
const POLL_INTERVAL_MS = 1_000;
const HEALTH_PROBE_TIMEOUT_MS = 10_000;

/**
 * 轮询 health 端点至 2xx。ready=false=预算内未就绪（调用方只警告）；
 * attempts 全程逐次留痕（5.12 可诊断性：判死时输出每次尝试的耗时与失败原因）。
 * 轮询本身就是重试（预算内每 1s 一针），故只复用单针原语 probeOnce，不套 probeWithRetry。
 */
async function waitHealthy(
  target: Target,
  deadline: number,
): Promise<{ ready: boolean; attempts: ProbeAttempt[] }> {
  const path = HEALTH_PATHS[target.name] ?? DEFAULT_HEALTH;
  const url = `${target.baseUrl}${path}`;
  const attempts: ProbeAttempt[] = [];
  for (;;) {
    if (Date.now() >= deadline) return { ready: false, attempts };
    const attempt = await probeOnce(url, HEALTH_PROBE_TIMEOUT_MS);
    attempts.push(attempt);
    if (attempt.ok) return { ready: true, attempts };
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
    const { ready, attempts } = await waitHealthy(target, deadline);
    if (!ready) {
      // 判死证据链（5.12）：预算内每次探针的耗时与失败原因逐行落 stderr。
      console.warn(
        `[prewarm] ${target.name} 在预算内未就绪（${target.baseUrl}），共 ${attempts.length} 次探针，跳过其登录预热` +
          `—— 后续测试照常跑，若真挂会由测试/Cleanup 照常暴露`,
      );
      for (const [i, a] of attempts.entries()) {
        console.warn(`  - 探针#${i + 1} ${a.durationMs}ms ${a.reason || "HTTP 2xx"}`);
      }
      continue;
    }
    // 评审修正：deadline 同样盖住登录预热段——health 就绪但预算已被前面的目标耗尽时
    // （或 axios 调用吃掉了大半预算），在此跳过登录预热，健康轮询结论保留。
    if (Date.now() >= deadline) {
      console.warn(
        `[prewarm] ${target.name} health 已就绪但预热预算耗尽，跳过其登录预热（不染色本轮）`,
      );
      continue;
    }
    const t0 = Date.now();
    try {
      const token = await login(target);
      if (Date.now() >= deadline) {
        console.warn(
          `[prewarm] ${target.name} 登录已完成但预算耗尽，跳过 /api/auth/me 探针（不染色本轮）`,
        );
      } else {
        await probeGet(target, "/api/auth/me", token);
      }
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
