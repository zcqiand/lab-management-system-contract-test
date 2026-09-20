// 5.69 cross-batch — receipts 写路径 last_submitted_by 对齐（live 门控行为收紧锁）。
//
// SSOT: lab-nextjs src/lib/db-queries.ts:271-276 —— act submit 写当前操作人、
// withdraw 清空（NULL）、return 保留。2026-09-20 人裁前 springboot/aspnetcore 写路径
// 均不写 last_submitted_by → filter=submitted 不传 flowStatus 对自写单恒漏行。
// 本套件用自建单（自建合同 + 接样单，带 teardown 清理）锁收紧后的正向语义：
// POST /api/receipts/receiving/act submit 后，GET /api/receipts?filter=submitted
// 不传 flowStatus 必须命中该单。msw/nextjs 驱动侧既有该语义（SSOT 本体），同跑不豁免。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

// SSOT 覆盖解析器只认字面字符串常量。
const PATH_ACT_RECEIVING = "/api/receipts/receiving/act";
const PATH_LIST_SUBMITTED = "/api/receipts?filter=submitted&pageSize=500";

describe.skipIf(!live)(
  "M03.F01.I08 + M03.F01.I01 act submit 写 last_submitted_by → filter=submitted 命中（5.69）",
  () => {
    for (const target of targets) {
      it(`${target.name} 自建单 receiving submit 后 filter=submitted（无 flowStatus）命中该单`, async () => {
        // 1. 自建合同 —— POST /api/receipts 的 contractId 有 FK 校验，必须真实存在
        const cr = await probeRequest(target, {
          method: "POST",
          path: "/api/contracts",
          body: {
            contractCode: uniqueName("ct-ls"),
            clientUnit: "ct-ls-client",
            projectName: "ct-ls-project",
            constructionUnit: "ct-ls-construction",
            witnessUnit: "ct-ls-witness-unit",
            witness: "ct-ls-witness",
          },
        });
        expect(
          [200, 201],
          `${target.name} POST contracts 期望 2xx 实得 ${cr.status}`,
        ).toContain(cr.status);
        const contractId = String((cr.body as Record<string, unknown>).id ?? "");
        expect(contractId, `${target.name} POST contracts 响应无 id`).toBeTruthy();

        // 2. categoryCode 取真值（receipts_category_fk → inspection_report_names.code）
        const rn = await probeRequest(target, {
          method: "GET",
          path: "/api/report-names?pageSize=1",
        });
        const rnItems = (rn.body as { items?: Array<{ code?: string }> }).items ?? [];
        const categoryCode = rnItems[0]?.code;
        expect(categoryCode, `${target.name} report-names 无可用类别`).toBeTruthy();

        // 3. 自建接样单（receiving 新单，无流转记录）
        const rr = await probeRequest(target, {
          method: "POST",
          path: "/api/receipts",
          body: {
            contractId,
            commissionCode: uniqueName("ct-ls-comm"),
            commissionDate: "2026-09-20",
            categoryCode,
            receivedBy: "alice",
            sampleSource: "client",
            testCategory: "concrete",
          },
        });
        expect(
          [200, 201],
          `${target.name} POST receipts 期望 2xx 实得 ${rr.status}`,
        ).toContain(rr.status);
        const receiptId = String((rr.body as Record<string, unknown>).id ?? "");
        expect(receiptId, `${target.name} POST receipts 响应无 id`).toBeTruthy();

        // teardown：先删 receipt（FK RESTRICT）再删 contract
        registerCleanup(`delete-ls-pair:${target.name}:${receiptId.slice(-8)}`, async () => {
          const dr = await probeRequest(target, {
            method: "DELETE",
            path: `/api/receipts/${receiptId}`,
          });
          if (![200, 204, 404].includes(dr.status)) {
            console.warn(`[teardown] ${target.name} delete receipt status=${dr.status}`);
          }
          const dc = await probeRequest(target, {
            method: "DELETE",
            path: `/api/contracts/${contractId}`,
          });
          if (![200, 204, 404].includes(dc.status)) {
            console.warn(`[teardown] ${target.name} delete contract status=${dc.status}`);
          }
        });

        // 4. act submit —— 5.69 起 springboot/aspnetcore 写路径补写 last_submitted_by
        const ar = await probeRequest(target, {
          method: "POST",
          path: PATH_ACT_RECEIVING,
          body: { ids: [receiptId], action: "submit", operator: "ct-ls-operator" },
        });
        expect(
          [200, 201],
          `${target.name} receiving/act submit 期望 2xx 实得 ${ar.status}`,
        ).toContain(ar.status);

        // 5. filter=submitted 不传 flowStatus 必须命中自建单
        const fr = await probeRequest(target, {
          method: "GET",
          path: PATH_LIST_SUBMITTED,
        });
        expect(fr.status, `${target.name} filter=submitted 期望 200 实得 ${fr.status}`).toBe(200);
        const items = (fr.body as { items?: Array<{ id?: string }> }).items ?? [];
        expect(
          items.some((r) => String(r.id) === receiptId),
          `${target.name} filter=submitted 未命中自建单 ${receiptId}（写路径未写 last_submitted_by？）`,
        ).toBe(true);
      }, 60_000);
    }

    afterAll(async () => {
      await runCleanups();
    }, 120_000);
  },
);
