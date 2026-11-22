// 自建前置链 helper —— 写端点测试共用（2026-11-22 CT 欠账收口批）。
//
// POST /api/samples 的 receiptId 与 POST /api/test-records 的 sampleId 都有 FK
// 校验：固定 UUID 假 id 在真实 FK 23503 → 裸 500（nextjs live 实证，CT 断言面
// [2xx,4xx] 不含 500 所以红）。写测试一律走自建前置链：contract → receipt
// → sample（receipts-act-history 三段式同款；categoryCode 取 report-names 真值）。
import { probeRequest } from "./http.js";
import { type Target } from "./targets.js";
import { uniqueName } from "./unique.js";
import { registerCleanup } from "./teardown.js";

/** 前置链建不出时的兜底 id（POST 吃 400/404 属契约面）。 */
export const DEAD_RECEIPT = "00000000-0000-0000-0000-00000000dead";
export const DEAD_SAMPLE = "00000000-0000-0000-0000-00000000dead";

/**
 * 自建 contract → receipt 前置链。失败返回空 receiptId（调用方走 DEAD 兜底）。
 * teardown 由调用方安排：I05 之前跑的用例可 registerReceiptPairCleanup
 * （runCleanups FIFO 消费）；afterAll 已消费 runCleanups 的用例须直接
 * deleteReceiptPair。
 */
export async function createRealReceiptPair(
  target: Target,
): Promise<{ receiptId: string; contractId: string }> {
  const cr = await probeRequest(target, {
    method: "POST",
    path: "/api/contracts",
    body: {
      contractCode: uniqueName("ct-chain-c"),
      clientUnit: "ct-chain-client",
      projectName: "ct-chain-project",
      constructionUnit: "ct-chain-construction",
      witnessUnit: "ct-chain-witness-unit",
      witness: "ct-chain-witness",
    },
  });
  const contractId = String((cr.body as Record<string, unknown>).id ?? "");
  if (![200, 201].includes(cr.status) || !contractId) {
    return { receiptId: "", contractId: "" };
  }
  // categoryCode 取真值（receipts category FK → inspection_report_names.code）
  const rn = await probeRequest(target, {
    method: "GET",
    path: "/api/report-names?pageSize=1",
  });
  const rnItems =
    (rn.body as { items?: Array<{ code?: string }> }).items ?? [];
  const categoryCode = rnItems[0]?.code;
  if (!categoryCode) {
    return { receiptId: "", contractId: "" };
  }
  const rr = await probeRequest(target, {
    method: "POST",
    path: "/api/receipts",
    body: {
      contractId,
      commissionCode: uniqueName("ct-chain-comm"),
      commissionDate: "2026-11-22",
      categoryCode,
      receivedBy: "alice",
      sampleSource: "client",
      testCategory: "concrete",
    },
  });
  const receiptId = String((rr.body as Record<string, unknown>).id ?? "");
  if (![200, 201].includes(rr.status) || !receiptId) {
    return { receiptId: "", contractId: "" };
  }
  return { receiptId, contractId };
}

/** 前置链自删（FK RESTRICT 顺序：先 receipt 后 contract）。失败只告警不抛。 */
export async function deleteReceiptPair(
  target: Target,
  receiptId: string,
  contractId: string,
): Promise<void> {
  const dr = await probeRequest(target, {
    method: "DELETE",
    path: `/api/receipts/${receiptId}`,
  });
  if (![200, 204, 404].includes(dr.status)) {
    console.warn(
      `[teardown] ${target.name} delete receipt status=${dr.status}`,
    );
  }
  const dc = await probeRequest(target, {
    method: "DELETE",
    path: `/api/contracts/${contractId}`,
  });
  if (![200, 204, 404].includes(dc.status)) {
    console.warn(
      `[teardown] ${target.name} delete contract status=${dc.status}`,
    );
  }
}

/** registerCleanup 包装——须注册在依赖该 receipt 的 sample 清理之后（FIFO）。 */
export function registerReceiptPairCleanup(
  target: Target,
  receiptId: string,
  contractId: string,
): void {
  registerCleanup(
    `delete-chain-pair:${target.name}:${contractId.slice(-8)}`,
    async () => {
      await deleteReceiptPair(target, receiptId, contractId);
    },
  );
}

/**
 * 自建 receipt → sample 全链，返回真 sampleId。失败返回空串（调用方走
 * DEAD_SAMPLE 兜底）。不注册任何 cleanup——登记顺序（sample 先于 pair，
 * FK RESTRICT FIFO 不炸）由调用方按依赖序自行 registerCleanup/直删。
 */
export async function createRealSample(
  target: Target,
): Promise<{ sampleId: string; receiptId: string; contractId: string }> {
  const { receiptId, contractId } = await createRealReceiptPair(target);
  if (!receiptId) {
    return { sampleId: "", receiptId: "", contractId: "" };
  }
  const post = await probeRequest(target, {
    method: "POST",
    path: "/api/samples",
    body: {
      receiptId,
      sampleCode: uniqueName("ct-chain-smp"),
      ext: {},
    },
  });
  const sampleId = String((post.body as Record<string, unknown>).id ?? "");
  if (![200, 201].includes(post.status) || !sampleId) {
    return { sampleId: "", receiptId, contractId };
  }
  return { sampleId, receiptId, contractId };
}
