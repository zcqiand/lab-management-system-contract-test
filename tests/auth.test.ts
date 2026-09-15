// M96.F02.I01 POST /api/auth/login 四方比对 —— 本仓第一个落地端点（ADR-0015 §7）。
//
// 选它的理由（与 saas I03 同款）：语义只读（登录不碰共库唯一约束）、4 后端都实现、
// 且它是所有后续探针的前置（http.ts login() 走的就是这条路径）。
//
// 认证形态兼容：no-sso（admin 直登）与真 saas OAuth（service account 内部换 token）
// 的响应契约面必须一致 —— 本测试就是那条「两种形态不得分叉」的守卫。
//
// 跑法：CONTRACT_TARGETS=nextjs,aspnetcore,springboot npx vitest run
// 未声明 CONTRACT_TARGETS → 整组跳过（fnReporter 记 inert，不计入 trace）。
// **声明了却连不上 = 红，不是跳过。**
import { beforeAll, describe, expect, it } from "vitest";

import { compareAll, formatDivergences, type Probe } from "../src/compare.js";
import { client, SEED_USER, probeAllRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const PATH = "/api/auth/login";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)(`M96.F02.I01 POST ${PATH} 四方比对 / M01.F05.I01`, () => {
  let probes: Probe[];

  beforeAll(async () => {
    probes = await probeAllRequest(targets, {
      method: "POST",
      path: PATH,
      body: SEED_USER,
    });
  }, 60_000);

  it("每个目标都返回 200", () => {
    const bad = probes.filter((p) => p.status !== 200);
    expect(bad, `非 200: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toEqual([]);
  });

  it("必填字段齐全（LoginResponse required: token/user/tenants）", () => {
    for (const p of probes) {
      const body = p.body as Record<string, unknown>;
      expect(body.token, `${p.target} 少了 token`).toBeTruthy();
      expect(body.user, `${p.target} 少了 user`).toBeDefined();
      expect(Array.isArray(body.tenants), `${p.target} 的 tenants 不是数组`).toBe(true);
    }
  });

  it("tenants 行必填齐全（MyTenant required: tenantId/code/name/roleIds）", () => {
    for (const p of probes) {
      for (const row of (p.body as { tenants: Record<string, unknown>[] }).tenants) {
        for (const key of ["tenantId", "code", "name", "roleIds"]) {
          expect(row[key], `${p.target} 的租户行少了 ${key}`).toBeDefined();
        }
      }
    }
  });

  it("错误凭证 → 4xx 全等（前端 catch 分支由状态码决定）", async () => {
    const bad = await probeAllRequest(targets, {
      method: "POST",
      path: PATH,
      body: { username: SEED_USER.username, password: "wrong-password" },
    });
    for (const p of bad) {
      expect(p.status, `${p.target} 错误密码应 4xx，得到 ${p.status}`).toBeGreaterThanOrEqual(400);
      expect(p.status).toBeLessThan(500);
    }
    const statuses = new Set(bad.map((p) => Math.floor(p.status / 100)));
    expect(statuses.size, `4xx 家族分叉: ${bad.map((p) => `${p.target}=${p.status}`).join(", ")}`).toBe(1);
  });

  it("normalize 后所有目标全等（token/refreshToken 已在 ALWAYS_VOLATILE 剔除）", () => {
    const divergences = compareAll(probes, targets);
    expect(divergences, `\n${formatDivergences(divergences)}\n`).toEqual([]);
  });
});

// 未声明目标时留一条可见记录，避免「全绿」被误读成「四方比对跑过了」。
// **描述里刻意不写功能 ID**：它没打任何后端，不该计入 M96.F02.I01 的覆盖。
describe.runIf(!live)("四方比对未运行（提示，不覆盖任何功能 ID）", () => {
  it("打印启用方式", () => {
    expect(targets.length).toBeLessThan(2);
    console.info(
      "[contract-test] 四方比对未运行。启用：\n" +
        "  CONTRACT_TARGETS=nextjs,aspnetcore,springboot npx vitest run\n" +
        "  前置：3 个 lab 后端分别跑在 5201 / 5204 / 5205（conventions §6）",
    );
  });
});

// 保留 client 导入引用（错误分支探针未来切 axios 直连时用）；当前 probeAllRequest 已覆盖。
void client;
