// tests/mytenant-shape.test.ts — 原 msw oracle 形状锁的契约化迁移（spec §3.3，2026-09-15 Phase 2）。
// 对 shared 的 tsp emit 产物断言 MyTenant 字段集——不再依赖任何运行时后端。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI = resolve(
  __dirname, "../../lab-management-system-shared/generated/openapi/openapi.yaml",
);

describe("MyTenant 契约形状锁（shared OpenAPI 静态断言）", () => {
  const yaml = readFileSync(OPENAPI, "utf8");
  // openapi.yaml 的 MyTenant schema 段头缩进 4 空格，段体（type/required/properties 及其子键）
  // 缩进 ≥6 空格；下一个 schema 键回到 4 空格即截断。以实际 emit 格式为锚，勿凭空猜缩进。
  const schemaBlock = yaml.match(/MyTenant:\s*\n((?:\s{6,}.*\n)+)/);

  it("MyTenant 字段集 = { tenantId, code, name, roleIds }", () => {
    expect(schemaBlock, "openapi.yaml 中未找到 MyTenant schema（先跑 shared npm run build 重 emit）").toBeTruthy();
    for (const key of ["tenantId", "code", "name", "roleIds"]) {
      expect(schemaBlock![1]).toContain(`${key}:`);
    }
  });

  it("旧 demo 形状（tenantCode/tenantName）不回潮", () => {
    expect(schemaBlock![1]).not.toContain("tenantCode:");
    expect(schemaBlock![1]).not.toContain("tenantName:");
  });
});
