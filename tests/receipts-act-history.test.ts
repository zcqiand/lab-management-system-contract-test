// 5.75 cross-batch — receipts act 写路径边缘对齐（live 门控行为收紧锁）。
//
// SSOT: lab-nextjs src/lib/act-route.ts:39-44 —— operator 契约必填，缺失与空串都
// 400 {code:"BAD_REQUEST", message:"operator is required"}；
//       lab-nextjs src/lib/db-queries.ts:256-259 —— flow history 条目记 action 真值
//（submit/return/withdraw）。
// 5.69 评审发现两处分叉：springboot transitionTo 对 return/withdraw 也写字面量 "submit"；
// aspnetcore body.Operator ?? "" 三处静默兜底。人裁（2026-09-20）统一对齐 nextjs。
//
// 本套件用自建单（自建合同 + 接样单，带 teardown 清理，2.6 批自足三段式同款）锁：
//   1. submit→return→withdraw 序列后，GET /api/receipts/{id}/history 最新条目
//      action 记真值（return 后是 "return"，withdraw 后是 "withdraw"，非 "submit"）。
//   2. act body operator 缺失 / 空串两形态 → 400（三后端一致；nextjs SSOT 本来就 400）。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

// SSOT 覆盖解析器只认字面字符串常量。
const PATH_ACT_RECEIVING = "/api/receipts/receiving/act";
const PATH_ACT_ASSIGNING = "/api/receipts/assigning/act";
const PATH_CONTRACTS = "/api/contracts";
const PATH_RECEIPTS = "/api/receipts";
const PATH_REPORT_NAMES = "/api/report-names?pageSize=1";

interface HistoryEntry {
  action?: string;
  from?: string;
  to?: string;
  operator?: string;
}

describe.skipIf(!live)(
  "M03.F01.I06 + M03.F01.I08 act history action 真值 + operator 契约必填（5.75）",
  () => {
    for (const target of targets) {
      it(`${target.name} 自建单 submit→return→withdraw history 最新条目记 action 真值`, async () => {
        // 1. 自建合同 —— POST /api/receipts 的 contractId 有 FK 校验，必须真实存在
        const cr = await probeRequest(target, {
          method: "POST",
          path: PATH_CONTRACTS,
          body: {
            contractCode: uniqueName("ct-ah"),
            clientUnit: "ct-ah-client",
            projectName: "ct-ah-project",
            constructionUnit: "ct-ah-construction",
            witnessUnit: "ct-ah-witness-unit",
            witness: "ct-ah-witness",
          },
        });
        expect(
          [200, 201],
          `${target.name} POST contracts 期望 2xx 实得 ${cr.status}`,
        ).toContain(cr.status);
        const contractId = String(
          (cr.body as Record<string, unknown>).id ?? "",
        );
        expect(
          contractId,
          `${target.name} POST contracts 响应无 id`,
        ).toBeTruthy();

        // 2. categoryCode 取真值（receipts_category_fk → inspection_report_names.code）
        const rn = await probeRequest(target, {
          method: "GET",
          path: PATH_REPORT_NAMES,
        });
        const rnItems =
          (rn.body as { items?: Array<{ code?: string }> }).items ?? [];
        const categoryCode = rnItems[0]?.code;
        expect(
          categoryCode,
          `${target.name} report-names 无可用类别`,
        ).toBeTruthy();

        // 3. 自建接样单（receiving 新单）
        const rr = await probeRequest(target, {
          method: "POST",
          path: PATH_RECEIPTS,
          body: {
            contractId,
            commissionCode: uniqueName("ct-ah-comm"),
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
        expect(
          receiptId,
          `${target.name} POST receipts 响应无 id`,
        ).toBeTruthy();

        // teardown：先删 receipt（FK RESTRICT）再删 contract
        registerCleanup(
          `delete-ah-pair:${target.name}:${receiptId.slice(-8)}`,
          async () => {
            const dr = await probeRequest(target, {
              method: "DELETE",
              path: `${PATH_RECEIPTS}/${receiptId}`,
            });
            if (![200, 204, 404].includes(dr.status)) {
              console.warn(
                `[teardown] ${target.name} delete receipt status=${dr.status}`,
              );
            }
            const dc = await probeRequest(target, {
              method: "DELETE",
              path: `${PATH_CONTRACTS}/${contractId}`,
            });
            if (![200, 204, 404].includes(dc.status)) {
              console.warn(
                `[teardown] ${target.name} delete contract status=${dc.status}`,
              );
            }
          },
        );

        const act = async (path: string, action: string) => {
          const r = await probeRequest(target, {
            method: "POST",
            path,
            body: { ids: [receiptId], action, operator: "ct-ah-operator" },
          });
          expect(
            [200, 201],
            `${target.name} ${path} ${action} 期望 2xx 实得 ${r.status}`,
          ).toContain(r.status);
        };
        const readHistory = async (): Promise<HistoryEntry[]> => {
          const hr = await probeRequest(target, {
            method: "GET",
            path: `${PATH_RECEIPTS}/${receiptId}/history`,
          });
          expect(
            hr.status,
            `${target.name} GET history 期望 200 实得 ${hr.status}`,
          ).toBe(200);
          return hr.body as HistoryEntry[];
        };

        // 4. submit（receiving→task_assignment）→ return（task_assignment→receiving）
        await act(PATH_ACT_RECEIVING, "submit");
        await act(PATH_ACT_ASSIGNING, "return");
        let entries = await readHistory();
        const lastAfterReturn = entries[entries.length - 1];
        expect(
          lastAfterReturn?.action,
          `${target.name} return 后 history 最新条目 action 应为真值 "return"（5.75 前 springboot 写字面量 "submit"），实得 ${JSON.stringify(entries)}`,
        ).toBe("return");

        // 5. withdraw（receiving 自转移）→ 最新条目 action === "withdraw"
        await act(PATH_ACT_RECEIVING, "withdraw");
        entries = await readHistory();
        const lastAfterWithdraw = entries[entries.length - 1];
        expect(
          lastAfterWithdraw?.action,
          `${target.name} withdraw 后 history 最新条目 action 应为真值 "withdraw"，实得 ${JSON.stringify(entries)}`,
        ).toBe("withdraw");

        // 6. 提交首条仍是 submit（action 真值不被串改）
        const submitEntry = entries.find((e) => e.action === "submit");
        expect(
          submitEntry,
          `${target.name} history 应保留 action==="submit" 的提交条目，实得 ${JSON.stringify(entries)}`,
        ).toBeTruthy();
      }, 90_000);

      for (const form of ["missing", "empty"] as const) {
        it(`${target.name} act body operator ${form === "empty" ? "空串" : "缺失"} → 400${form === "empty" ? " operator is required" : ""}`, async () => {
          // 打 receiving/act：operator 校验先于 id 查找（SSOT act-route 顺序），死 id 即可。
          // message 断言只挂空串形态：缺失形态 springboot 由 @NotNull 在 controller 层拦
          //（Spring 默认 400 body）、aspnetcore 由 MVC [BindRequired] 拦（ValidationProblemDetails），
          // 框架层拒绝的 envelope 各家不同，message 逐字只在各后端自己的空串拒绝路径可比。
          const body: Record<string, unknown> = {
            ids: ["00000000-0000-0000-0000-00000000dead"],
            action: "submit",
          };
          if (form === "empty") {
            body.operator = "";
          }
          const r = await probeRequest(target, {
            method: "POST",
            path: PATH_ACT_RECEIVING,
            body,
          });
          expect(
            r.status,
            `${target.name} operator ${form} 期望 400 实得 ${r.status}`,
          ).toBe(400);
          if (form === "empty") {
            expect(
              JSON.stringify(r.body),
              `${target.name} operator 空串 400 响应应含 "operator is required"`,
            ).toContain("operator is required");
          }
        }, 30_000);
      }
    }

    afterAll(async () => {
      await runCleanups();
    }, 120_000);
  },
);
