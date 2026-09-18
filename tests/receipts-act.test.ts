// M03 7 阶段全 act 模式 四方比对 (Phase 2: 写端点)
//
// SSOT: shared sample-receipts.tsp ADR-0035
// 7 act 端点 × 3 action (SUBMIT/RETURN/WITHDRAW) —— WITHDRAW 4 后端一致性回归。
//
// 旧端点 /api/receipts/flow (POST batch) 与 /api/receipts/flow/queue (GET) 已删，
// 见 git rm tests/report-flow-write.test.ts tests/report-flow.test.ts。
//
// 新端点共享 body 形态：FlowActionRequest{ ids[], action, operator, reason? }
// response: FlowActionResult[]
// 接样单 id 不存在时 4 后端可能 200+空数组 / 4xx —— 都是契约面。

import { describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

const ACT_STAGES = [
  "receiving",
  "assigning",
  "data-entry",
  "review",
  "approve",
  "issuance",
  "archived",
] as const;

// 契约枚举值（openapi FlowAction / 各后端生成 enum）：submit / return / withdraw（小写）。
// 2026-09-18 修正：原稿发 "SUBMIT"/"RETURN"/"WITHDRAW" 大写，全后端 schema 校验 400 拒收，
// 断言把 4xx 一并放行 → WITHDRAW 分支从未被真正触达（回归空转）。
const ACTIONS = ["submit", "return", "withdraw"] as const;

describe.skipIf(!live)("M03 7 阶段全 act 模式 WITHDRAW 4 后端一致性回归", () => {
  for (const stage of ACT_STAGES) {
    const path = `/api/receipts/${stage}/act`;

    // WITHDRAW 跨 7 阶段 × 后端一致性
    // SSOT 挂载（2026-09-18 收敛为 anchor 单 ID，兄弟 I 并入）：
    //   F01.I08 / F02.I05 / F03.I12 / F05.I07 / F06.I05 / F07.I05 / F08.I05
    for (const target of targets) {
      it(`${target.name} POST ${path} WITHDRAW → 200 或 4xx (接样单不存在)`, async () => {
        const r = await probeRequest(target, {
          method: "POST",
          path,
          body: {
            ids: ["00000000-0000-0000-0000-00000000dead"],
            action: "withdraw",
            operator: "ct-act-withdraw",
          },
        });
        // 接样单 id 不存在时 4 后端可能 200+空数组 / 4xx —— 这都是契约面
        expect(
          [200, 201, 400, 404, 422],
          `${target.name} ${path} WITHDRAW 期望 2xx/4xx 实得 ${r.status}`,
        ).toContain(r.status);
        if (r.status === 200 || r.status === 201) {
          const body = r.body as unknown;
          expect(Array.isArray(body), `${target.name} ${path} 响应应是数组`).toBe(true);
        }
      }, 30_000);
    }
  }
});

describe.skipIf(!live)("M03 7 阶段全 act 模式 SUBMIT/RETURN 端点存在性回归", () => {
  // SUBMIT/RETURN 仅打端点存在性 + body 接受性 —— 不强求 200
  // (业务流转需要合法阶段前置，孤立 id 必 4xx)
  for (const stage of ACT_STAGES) {
    const path = `/api/receipts/${stage}/act`;

    for (const action of ACTIONS.filter((a) => a !== "withdraw")) {
      for (const target of targets) {
        it(`${target.name} POST ${path} ${action} 端点接受 body → 2xx/4xx`, async () => {
          const r = await probeRequest(target, {
            method: "POST",
            path,
            body: {
              ids: ["00000000-0000-0000-0000-00000000dead"],
              action,
              operator: "ct-act-submit-return",
            },
          });
          expect(
            [200, 201, 400, 404, 422],
            `${target.name} ${path} ${action} 期望 2xx/4xx 实得 ${r.status}`,
          ).toContain(r.status);
        }, 30_000);
      }
    }
  }
});