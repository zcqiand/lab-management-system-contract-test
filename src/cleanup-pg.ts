// ADR-0018（lab 版）: 写端点探针行清理 —— 首批（read 端点覆盖）无写探针，no-op。
//
// lab 写端点（contracts/receipts/samples/test-records/dictionary CRUD）落地时，
// 在这里按 saas-contract-test 同款模式补：探针 prefix 匹配 + HTTP DELETE 容差 200/204/404。
// 设计约束不变：走 HTTP 不直连 PG（守 ADR-0015 黑盒契约）、msw 内存态一视同仁。

export async function cleanupAllProbeRows(): Promise<void> {
  // read-only 阶段：无探针行可清。写端点落地时替换为真实清理逻辑。
}
