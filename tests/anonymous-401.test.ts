// M96.F02.I06 — 匿名探针：未经 login、不带 Bearer 头，三后端统一 401。
//
// 配合 lab-nextjs BFF 全域 token 化（2026-09-23 Phase 2-3）的同 commit 同步断言：
// - 7 个过滤域（contracts / receipts / samples / test-records / summary / catalog 4 表 /
//   technical-requirements）走 tenantId 严格过滤 → 缺 token 必须 401
// - 5 个全局域（inspection_* dict 4 表 / report-names / calculation-methods /
//   param-interfaces / junction links）只加 401 门、不做租户过滤 → 缺 token 也 401
//
// 实现要点（probeAnonymous）：裸打同 BASE、不调 login()、不触发 probeRequest 的
// 401 自愈（http.ts:196-204）—— 否则「预期 401」用例被自愈重登成 200，吃掉断言。
//
// 跨后端比对式探针天然验证三端一致：nextjs / aspnetcore / springboot 对同一路径都
// 返回 401=契约一致；任一端返回 200/302 即报 divergence。
import { beforeAll, describe, expect, it } from "vitest";

import { probeAnonymous } from "../src/http.js";
import { withLiveExecSuite } from "../src/live-floor.js";
import { type Target, selectedTargets } from "../src/targets.js";

const FILTERED_PATHS = [
  "/api/contracts",
  "/api/receipts",
  "/api/samples",
  "/api/test-records",
  "/api/summary",
  "/api/catalog/brands",
  "/api/catalog/models",
  "/api/catalog/specs",
  "/api/catalog/grades",
  "/api/technical-requirements",
] as const;

const GLOBAL_PATHS = [
  "/api/inspection/specialties",
  "/api/inspection/objects",
  "/api/inspection/parameters",
  "/api/inspection/standards",
  "/api/report-names",
  "/api/calculation-methods",
  "/api/param-interfaces",
  "/api/inspection/links/specialty-object",
] as const;

const ALL_PATHS = [...FILTERED_PATHS, ...GLOBAL_PATHS];

interface Tagged {
  readonly path: string;
  readonly target: string;
  readonly status: number;
}

const targets: Target[] = selectedTargets();
// live 阈值 ≥1：单目标 nextjs 也跑第一个 it（18 路径 × 1 目标 = 18 探针全 401）；
// 三后端一致性（第二个 it）需 ≥2 目标才 run。
const live = targets.length >= 1;
const multiTarget = targets.length >= 2;

describe.skipIf(!live)(
  "M96.F02.I06 匿名探针：filter+global 域 18 路径 × 三目标统一 401 / lab-nextjs BFF 全域 token 化 P2-3",
  () => {
    let tagged: Tagged[];

    beforeAll(async (ctx) => {
      tagged = [];
      await withLiveExecSuite(ctx.name, async () => {
        for (const path of ALL_PATHS) {
          for (const t of targets) {
            const res = await probeAnonymous(t, path);
            tagged.push({ path, target: t.name, status: res.status });
          }
        }
      });
    }, 120_000);

    it("每个匿名探针都返回 401（无 login + 无 Authorization）", () => {
      const bad = tagged.filter((t) => t.status !== 401);
      expect(
        bad,
        `非 401: ${bad.map((t) => `${t.target}:${t.path}=${t.status}`).join(", ")}`,
      ).toEqual([]);
    });

    it.runIf(multiTarget)(
      "三后端对同一路径一致 401（nextjs/aspnetcore/springboot 同形）",
      () => {
        const byPath = new Map<string, Set<number>>();
        for (const t of tagged) {
          const set = byPath.get(t.path) ?? new Set<number>();
          set.add(t.status);
          byPath.set(t.path, set);
        }
        const mismatches: string[] = [];
        for (const [path, statuses] of byPath) {
          if (statuses.size > 1) {
            mismatches.push(
              `${path}: statuses=${[...statuses].sort().join(",")}`,
            );
          }
        }
        expect(
          mismatches,
          `三端 401 形状分歧：\n${mismatches.join("\n")}`,
        ).toEqual([]);
      },
    );
  },
);
