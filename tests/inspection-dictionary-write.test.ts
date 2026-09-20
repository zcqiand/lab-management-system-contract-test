// M96.F02 — /api/inspection/* + 4 junction links POST/PUT/DELETE 写端点（Phase 2）。
//
// SSOT: inspection-dictionary.tsp 4 个字典表 CRUD + 4 junction link/unlink。
// 共库：4 表主键是 code，junction link 是关系表（POST=link, DELETE=unlink, upsert 幂等）。
//
// **L2 SSOT 覆盖解析器只扫字面 describe 标题**：必须手写 24 段。
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { clearCleanups, registerCleanup, runCleanups } from "../src/teardown.js";

// 2026-09-16 T11：junction link 探测对换 lab_dev 真实种子码（PRM-CEMENT-STRENGTH /
// GB/T-17671-2021 是 msw 时代虚构码，springboot 真 FK 23503 → 500）。
// 组合特意选 lab_dev 未占用的 (SP02,OBJ-SP01-P11)/(OBJ-SP01-P11,IP-0002)/
// (OBJ-SP01-P11,GB 13788-2024)/(GB 13788-2024,IP-0002)——link→unlink 净零，不删种子行。
const SEED_OBJECT = "OBJ-SP01-P11";
const SEED_SPECIALTY = "SP02";
const SEED_PARAMETER = "IP-0002";
const SEED_STANDARD = "GB 13788-2024";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface DictCtx {
  ids: Map<string, Map<string, string>>;
}
const ctx: DictCtx = { ids: new Map() };
function bucket(name: string): Map<string, string> {
  let m = ctx.ids.get(name);
  if (!m) {
    m = new Map();
    ctx.ids.set(name, m);
  }
  return m;
}

function regCleanup(target: Target, label: string, doIt: () => Promise<unknown>) {
  registerCleanup(label, async () => {
    try {
      await doIt();
    } catch (e) {
      console.warn(`[teardown] ${label}:`, e);
    }
  });
}

// 3 真后端恒 ef 直连 lab_dev（memory 空仓模式已删，2026-09-20 人裁）：
// 固定种子码 SP02 是 shared/seeds + V015 smoke seed 的真种子，ef 直连必有，
// 无需任何按目标补种分支。

// ── specialties ──
describe.skipIf(!live)("M96.F02.I02 POST /api/inspection/specialties 四方比对 / M00.F01.I01", () => {
  beforeAll(() => {
    clearCleanups();
  }, 30_000);

  for (const target of targets) {
    it(`${target.name} 创 specialty → 200`, async () => {
      const code = uniqueName("ct-sp");
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/specialties",
        // SSOT CreateInspectionSpecialtyRequest 必填：code/officialNo/name（msw 时代只发 code+name，
        // 切真后 nextjs NOT NULL official_no 500 / aspnetcore·springboot 校验 400 —— T11 实证）。
        body: { code, officialNo: code, name: `sp ${code}` },
      });
      expect([200, 201], `${target.name} POST specialty 期望 200/201 实得 ${r.status}`).toContain(r.status);
      bucket("specialties").set(target.name, code);
      regCleanup(target, `delete-specialty:${target.name}:${code.slice(-8)}`, () =>
        probeRequest(target, { method: "DELETE", path: `/api/inspection/specialties/${code}` }),
      );
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I03 PUT /api/inspection/specialties/{code} 四方比对 / M01.F04.I02", () => {
  for (const target of targets) {
    it(`${target.name} 改 name → 200`, async () => {
      const code = bucket("specialties").get(target.name);
      if (!code) throw new Error(`${target.name} specialty 未创建`);
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/inspection/specialties/${code}`,
        body: { name: `renamed-${uniqueName("ct")}` },
      });
      expect([200], `${target.name} PUT specialty 期望 200 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I04 DELETE /api/inspection/specialties/{code} 四方比对 / M01.F04.I01", () => {
  it("specialty 删除 → 200/204", async () => {
    for (const target of targets) {
      const code = bucket("specialties").get(target.name);
      if (!code) continue;
      const r = await probeRequest(target, { method: "DELETE", path: `/api/inspection/specialties/${code}` });
      expect([200, 204], `${target.name} DELETE specialty 期望 200/204 实得 ${r.status}`).toContain(r.status);
      bucket("specialties").delete(target.name);
    }
  }, 60_000);
});

// ── objects ──
describe.skipIf(!live)("M96.F02.I06 POST /api/inspection/objects 四方比对 / M04.F06.I02", () => {
  for (const target of targets) {
    it(`${target.name} 创 object → 200`, async () => {
      const code = uniqueName("ct-obj");
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/objects",
        // SSOT CreateInspectionObjectRequest 必填：code/inspectionSpecialtyCode/sourceProjectNo/sourceProjectName/name。
        body: {
          code,
          name: `obj ${code}`,
          inspectionSpecialtyCode: SEED_SPECIALTY,
          sourceProjectNo: code,
          sourceProjectName: `proj ${code}`,
        },
      });
      expect([200, 201], `${target.name} POST object 期望 200/201 实得 ${r.status}`).toContain(r.status);
      bucket("objects").set(target.name, code);
      regCleanup(target, `delete-object:${target.name}:${code.slice(-8)}`, () =>
        probeRequest(target, { method: "DELETE", path: `/api/inspection/objects/${code}` }),
      );
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I07 PUT /api/inspection/objects/{code} 四方比对 / M04.F06.I03", () => {
  for (const target of targets) {
    it(`${target.name} 改 name → 200`, async () => {
      const code = bucket("objects").get(target.name);
      if (!code) throw new Error(`${target.name} object 未创建`);
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/inspection/objects/${code}`,
        body: { name: `renamed-${uniqueName("ct")}` },
      });
      expect([200], `${target.name} PUT object 期望 200 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I08 DELETE /api/inspection/objects/{code} 四方比对 / M04.F06.I04", () => {
  it("object 删除 → 200/204", async () => {
    for (const target of targets) {
      const code = bucket("objects").get(target.name);
      if (!code) continue;
      const r = await probeRequest(target, { method: "DELETE", path: `/api/inspection/objects/${code}` });
      expect([200, 204], `${target.name} DELETE object 期望 200/204 实得 ${r.status}`).toContain(r.status);
      bucket("objects").delete(target.name);
    }
  }, 60_000);
});

// ── parameters ──
describe.skipIf(!live)("M96.F02.I10 POST /api/inspection/parameters 四方比对 / M04.F07.I03", () => {
  for (const target of targets) {
    it(`${target.name} 创 parameter → 200`, async () => {
      const code = uniqueName("ct-prm");
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/parameters",
        // SSOT CreateInspectionParameterRequest 必填：code/name/rawName/canonicalName。
        body: { code, name: `prm ${code}`, rawName: `raw ${code}`, canonicalName: `can ${code}` },
      });
      expect([200, 201], `${target.name} POST parameter 期望 200/201 实得 ${r.status}`).toContain(r.status);
      bucket("parameters").set(target.name, code);
      regCleanup(target, `delete-parameter:${target.name}:${code.slice(-8)}`, () =>
        probeRequest(target, { method: "DELETE", path: `/api/inspection/parameters/${code}` }),
      );
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I11 PUT /api/inspection/parameters/{code} 四方比对 / M04.F07.I04", () => {
  for (const target of targets) {
    it(`${target.name} 改 name → 200`, async () => {
      const code = bucket("parameters").get(target.name);
      if (!code) throw new Error(`${target.name} parameter 未创建`);
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/inspection/parameters/${code}`,
        body: { name: `renamed-${uniqueName("ct")}` },
      });
      expect([200], `${target.name} PUT parameter 期望 200 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I12 DELETE /api/inspection/parameters/{code} 四方比对 / M04.F08.I02", () => {
  it("parameter 删除 → 200/204", async () => {
    for (const target of targets) {
      const code = bucket("parameters").get(target.name);
      if (!code) continue;
      const r = await probeRequest(target, { method: "DELETE", path: `/api/inspection/parameters/${code}` });
      expect([200, 204], `${target.name} DELETE parameter 期望 200/204 实得 ${r.status}`).toContain(r.status);
      bucket("parameters").delete(target.name);
    }
  }, 60_000);
});

// ── standards ──
describe.skipIf(!live)("M96.F02.I14 POST /api/inspection/standards 四方比对 / M04.F08.I04", () => {
  for (const target of targets) {
    it(`${target.name} 创 standard → 200`, async () => {
      const code = uniqueName("ct-std");
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/standards",
        body: { code, name: `std ${code}` },
      });
      expect([200, 201], `${target.name} POST standard 期望 200/201 实得 ${r.status}`).toContain(r.status);
      bucket("standards").set(target.name, code);
      regCleanup(target, `delete-standard:${target.name}:${code.slice(-8)}`, () =>
        probeRequest(target, { method: "DELETE", path: `/api/inspection/standards/${code}` }),
      );
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I15 PUT /api/inspection/standards/{code} 四方比对 / M06.F02.I02", () => {
  for (const target of targets) {
    it(`${target.name} 改 name → 200`, async () => {
      const code = bucket("standards").get(target.name);
      if (!code) throw new Error(`${target.name} standard 未创建`);
      const r = await probeRequest(target, {
        method: "PUT",
        path: `/api/inspection/standards/${code}`,
        body: { name: `renamed-${uniqueName("ct")}` },
      });
      expect([200], `${target.name} PUT standard 期望 200 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I16 DELETE /api/inspection/standards/{code} 四方比对 / M06.F02.I03", () => {
  it("standard 删除 → 200/204", async () => {
    for (const target of targets) {
      const code = bucket("standards").get(target.name);
      if (!code) continue;
      const r = await probeRequest(target, { method: "DELETE", path: `/api/inspection/standards/${code}` });
      expect([200, 204], `${target.name} DELETE standard 期望 200/204 实得 ${r.status}`).toContain(r.status);
      bucket("standards").delete(target.name);
    }
  }, 60_000);
});

// ── junction links ──
// junction 是 upsert（POST=link, DELETE=unlink），不存在「创建新行」，所以 link 测试不需要清理。
// 4 后端用同一对 (specialty, object) 走两次 link/unlink，第二次幂等。
describe.skipIf(!live)("M96.F02.I21 POST /api/inspection/links/specialty-object 四方比对 / M06.F02.I04", () => {
  for (const target of targets) {
    it(`${target.name} link(SP01, OBJ-SP01-P1) → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/links/specialty-object",
        body: { inspectionSpecialtyCode: SEED_SPECIALTY, inspectionObjectCode: SEED_OBJECT },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I22 DELETE /api/inspection/links/specialty-object 四方比对 / M06.F08.I06", () => {
  for (const target of targets) {
    it(`${target.name} unlink(SP01, OBJ-SP01-P1) → 200/204`, async () => {
      // 3 真后端共库（lab_dev）：SB 的 unlink 先删共享行会毒化 ASP 的首次 unlink
      // （sequential SB→ASP），故 unlink 测试自足地先 link（upsert）保证本目标有行可删。
      await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/links/specialty-object",
        body: { inspectionSpecialtyCode: SEED_SPECIALTY, inspectionObjectCode: SEED_OBJECT },
      });
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/inspection/links/specialty-object",
        body: { inspectionSpecialtyCode: SEED_SPECIALTY, inspectionObjectCode: SEED_OBJECT },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
      // 幂等：重复 unlink 未命中同样 204（契约 unlink = void，Task 2.6 推广 REQ-2026-001 语义）
      const r2 = await probeRequest(target, {
        method: "DELETE",
        path: "/api/inspection/links/specialty-object",
        body: { inspectionSpecialtyCode: SEED_SPECIALTY, inspectionObjectCode: SEED_OBJECT },
      });
      expect([200, 201, 204], `${target.name} 重复 unlink 期望幂等 2xx 实得 ${r2.status}`).toContain(r2.status);
    }, 90_000);
  }
});

describe.skipIf(!live)("M96.F02.I24 POST /api/inspection/links/object-parameter 四方比对 / M06.F07.I04", () => {
  for (const target of targets) {
    it(`${target.name} link(OBJ, PRM) → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/links/object-parameter",
        // SSOT ObjectParameterLink 必填 qualificationLevel（缺它 aspnetcore 400 是对的，nextjs 宽松掩盖）。
        body: {
          inspectionObjectCode: SEED_OBJECT,
          inspectionParameterCode: SEED_PARAMETER,
          qualificationLevel: "QUALIFIED",
        },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I25 DELETE /api/inspection/links/object-parameter 四方比对 / M06.F07.I05", () => {
  for (const target of targets) {
    it(`${target.name} unlink(OBJ, PRM) → 200/204`, async () => {
      // 共库防毒化：先 link（upsert）保证本目标有行可删（见 I22 注）。
      await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/links/object-parameter",
        body: {
          inspectionObjectCode: SEED_OBJECT,
          inspectionParameterCode: SEED_PARAMETER,
          qualificationLevel: "QUALIFIED",
        },
      });
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/inspection/links/object-parameter",
        body: { inspectionObjectCode: SEED_OBJECT, inspectionParameterCode: SEED_PARAMETER },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
      // 幂等：重复 unlink 未命中同样 204（契约 unlink = void，Task 2.6 推广 REQ-2026-001 语义）
      const r2 = await probeRequest(target, {
        method: "DELETE",
        path: "/api/inspection/links/object-parameter",
        body: { inspectionObjectCode: SEED_OBJECT, inspectionParameterCode: SEED_PARAMETER },
      });
      expect([200, 201, 204], `${target.name} 重复 unlink 期望幂等 2xx 实得 ${r2.status}`).toContain(r2.status);
    }, 90_000);
  }
});

describe.skipIf(!live)("M96.F02.I27 POST /api/inspection/links/object-standard 四方比对 / M06.F05.I03", () => {
  for (const target of targets) {
    it(`${target.name} link(OBJ, STD, role=judgment) → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/links/object-standard",
        body: { inspectionObjectCode: SEED_OBJECT, inspectionStandardCode: SEED_STANDARD, role: "JUDGMENT" },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I28 DELETE /api/inspection/links/object-standard 四方比对 / M06.F05.I04", () => {
  for (const target of targets) {
    it(`${target.name} unlink(OBJ, STD, role=judgment) → 200/204`, async () => {
      // 共库防毒化：先 link（upsert）保证本目标有行可删（见 I22 注）。
      await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/links/object-standard",
        body: { inspectionObjectCode: SEED_OBJECT, inspectionStandardCode: SEED_STANDARD, role: "JUDGMENT" },
      });
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/inspection/links/object-standard",
        body: { inspectionObjectCode: SEED_OBJECT, inspectionStandardCode: SEED_STANDARD, role: "JUDGMENT" },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
      // 幂等：重复 unlink 未命中同样 204（契约 unlink = void，Task 2.6 推广 REQ-2026-001 语义）
      const r2 = await probeRequest(target, {
        method: "DELETE",
        path: "/api/inspection/links/object-standard",
        body: { inspectionObjectCode: SEED_OBJECT, inspectionStandardCode: SEED_STANDARD, role: "JUDGMENT" },
      });
      expect([200, 201, 204], `${target.name} 重复 unlink 期望幂等 2xx 实得 ${r2.status}`).toContain(r2.status);
    }, 90_000);
  }
});

describe.skipIf(!live)("M96.F02.I30 POST /api/inspection/links/standard-parameter 四方比对 / M06.F05.I05", () => {
  for (const target of targets) {
    it(`${target.name} link(STD, PRM) → 200/204`, async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/links/standard-parameter",
        body: { inspectionStandardCode: SEED_STANDARD, inspectionParameterCode: SEED_PARAMETER },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I31 DELETE /api/inspection/links/standard-parameter 四方比对 / M03.F03.I08", () => {
  for (const target of targets) {
    it(`${target.name} unlink(STD, PRM) → 200/204`, async () => {
      // 共库防毒化：先 link（upsert）保证本目标有行可删（见 I22 注）。
      await probeRequest(target, {
        method: "POST",
        path: "/api/inspection/links/standard-parameter",
        body: { inspectionStandardCode: SEED_STANDARD, inspectionParameterCode: SEED_PARAMETER },
      });
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/inspection/links/standard-parameter",
        body: { inspectionStandardCode: SEED_STANDARD, inspectionParameterCode: SEED_PARAMETER },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
      // 幂等：重复 unlink 未命中同样 204（契约 unlink = void，Task 2.6 推广 REQ-2026-001 语义）
      const r2 = await probeRequest(target, {
        method: "DELETE",
        path: "/api/inspection/links/standard-parameter",
        body: { inspectionStandardCode: SEED_STANDARD, inspectionParameterCode: SEED_PARAMETER },
      });
      expect([200, 201, 204], `${target.name} 重复 unlink 期望幂等 2xx 实得 ${r2.status}`).toContain(r2.status);
    }, 90_000);
  }

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});