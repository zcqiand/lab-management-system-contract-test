// M96.F03 目标声明与可达性。
//
// 端口是 conventions §6 的显式字面量，不是 env 兜底（CLAUDE.md 硬规则：禁止 env 默认值兜底）。
// 「打哪些目标」由 CONTRACT_TARGETS 显式声明；**声明了就必须可达**，连不上是红不是跳过。
// 2026-09-15 Phase 2 去 msw：oracle 语义回归 shared OpenAPI 契约（spec §3.3），比对基准 = probes[0]。

export interface Target {
  readonly name: string;
  readonly baseUrl: string;
}

/** conventions §6 端口表（lab 家族，2026-09-02 起与 saas 家族错开）。改这里必须同步改 conventions。 */
export const TARGETS: Readonly<Record<string, Target>> = {
  nextjs: { name: "nextjs", baseUrl: "http://localhost:5201" },
  aspnetcore: { name: "aspnetcore", baseUrl: "http://localhost:5204" },
  springboot: { name: "springboot", baseUrl: "http://localhost:5205" },
};

export class TargetError extends Error {}

/**
 * M96.F03.I02 —— 从 CONTRACT_TARGETS 读要打的目标。
 * 未设置返回空数组（只跑单元测试）；设置了但名字不认识 → 抛错，不静默忽略。
 */
export function selectedTargets(raw = process.env.CONTRACT_TARGETS): Target[] {
  if (!raw || raw.trim() === "") return [];
  const names = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = names.filter((n) => !(n in TARGETS));
  if (unknown.length > 0) {
    throw new TargetError(
      `CONTRACT_TARGETS 里有不认识的目标: ${unknown.join(", ")}。` +
        `可选: ${Object.keys(TARGETS).join(", ")}`,
    );
  }
  return names.map((n) => TARGETS[n]);
}
