// M96.F02 — /api/report-names POST/PUT/DELETE + 3 junction links 写端点（Phase 2）。
//
// SSOT: report-names.tsp M06.F07 报告名称 CRUD + 3 junction link/unlink。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const SEED_OBJECT = "OBJ-SP01-P1";
const SEED_STANDARD = "GB/T-17671-2021";
const SEED_PARAMETER = "PRM-CEMENT-STRENGTH";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  ids: Map<string, string>;
}
const ctx: Ctx = { ids: new Map() };

describe.skipIf(!live)("M96.F02.I03 POST /api/report-names 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} 创 report name → 200`, async () => {
      const code = uniqueName("ct-rn");
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/report-names",
        body: { code, name: `rn ${code}` },
      });
      expect([200, 201], `${target.name} POST report-name 期望 200/201 实得 ${r.status}`).toContain(r.status);
      ctx.ids.set(target.name, code);
      registerCleanup(`delete-report-name:${target.name}:${code.slice(-8)}`, async () => {
        const tr = await probeRequest(target, { method: "DELETE", path: `/api/report-names/${code}` });
        if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
          console.warn(`[teardown] delete report-name ${target.name} status=${tr.status}`);
        }
      });
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I04 PUT /api/report-names/{code} 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} 改 name → 200`, async () => {
      const code = ctx.ids.get(target.name);
      if (!code) throw new Error(`${target.name} report-name 未创建`);
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/report-names/${code}`,
        body: { name: `renamed-${uniqueName("ct")}` },
      });
      expect([200], `${target.name} PUT report-name 期望 200 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I05 DELETE /api/report-names/{code} 四方比对", () => {
  it("report-name 删除 → 200/204", async () => {
    for (const target of targets) {
      const code = ctx.ids.get(target.name);
      if (!code) continue;
      const r = await probeRequest(target, { method: "DELETE", path: `/api/report-names/${code}` });
      expect([200, 204], `${target.name} DELETE report-name 期望 200/204 实得 ${r.status}`).toContain(r.status);
      ctx.ids.delete(target.name);
    }
  }, 60_000);
});

// 3 junction links — upsert 模式，不需 cleanup
describe.skipIf(!live)("M96.F02.I09 POST /api/report-names/links/object 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} link → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/report-names/links/object",
        body: { inspectionObjectCode: SEED_OBJECT, reportNameCode: "RN-FIXTURE" },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I10 DELETE /api/report-names/links/object 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} unlink → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/report-names/links/object",
        body: { inspectionObjectCode: SEED_OBJECT, reportNameCode: "RN-FIXTURE" },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I12 POST /api/report-names/links/standard 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} link(RN, STD, role=judgment) → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/report-names/links/standard",
        body: { reportNameCode: "RN-FIXTURE", inspectionStandardCode: SEED_STANDARD, role: "judgment" },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I13 DELETE /api/report-names/links/standard 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} unlink(RN, STD, role=judgment) → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/report-names/links/standard",
        body: { reportNameCode: "RN-FIXTURE", inspectionStandardCode: SEED_STANDARD, role: "judgment" },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I15 POST /api/report-names/links/parameter 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} link(RN, PRM) → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/report-names/links/parameter",
        body: { reportNameCode: "RN-FIXTURE", inspectionParameterCode: SEED_PARAMETER },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I16 DELETE /api/report-names/links/parameter 四方比对", () => {
  for (const target of targets) {
    it(`${target.name} unlink(RN, PRM) → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/report-names/links/parameter",
        body: { reportNameCode: "RN-FIXTURE", inspectionParameterCode: SEED_PARAMETER },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});