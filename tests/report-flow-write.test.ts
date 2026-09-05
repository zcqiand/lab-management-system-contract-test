// M96.F02 — /api/receipts/flow POST 流程动作 写端点（Phase 2）。
//
// SSOT: report-flow.tsp M03.F05/F06/F07/F08 批量流程动作（submit/return/withdraw）。
// 批量端点：body 是 FlowActionRequest，response 是 FlowActionResult[]。
import { describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

describe.skipIf(!live)("M96.F02.I02 POST /api/receipts/flow 四方比对 / M00.F01.I01", () => {
  for (const target of targets) {
    it(`${target.name} 批量 submit → 200 或 4xx（接样单不存在）`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/receipts/flow",
        body: {
          action: "submit",
          receiptIds: ["00000000-0000-0000-0000-00000000dead"],
          comment: "ct-flow-test",
        },
      });
      // 接样单 id 不存在时 4 后端可能 200+空数组 / 4xx —— 这都是契约面
      expect([200, 201, 400, 404, 422], `${target.name} POST flow 期望 2xx/4xx 实得 ${r.status}`).toContain(r.status);
      if (r.status === 200 || r.status === 201) {
        const body = r.body as unknown;
        expect(Array.isArray(body), `${target.name} flow 响应应是数组`).toBe(true);
      }
    }, 30_000);
  }
});