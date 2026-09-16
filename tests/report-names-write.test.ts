// M96.F02 — /api/report-names POST/PUT/DELETE + 3 junction links 写端点（Phase 2）。
//
// SSOT: report-names.tsp M06.F07 报告名称 CRUD + 3 junction link/unlink。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const SEED_OBJECT = "OBJ-SP01-P1";
// 2026-09-16 T11：junction link 探测码换 lab_dev 真实种子码（旧 GB/T-17671-2021 /
// PRM-CEMENT-STRENGTH 是 msw 时代虚构码，springboot 真 FK 23503 → 500）。
// link 的 reportNameCode 不能用任何种子 RN-*（它们都挂着种子 junction 行，unlink 会删种子），
// 改为每轮现场 create 一个专用 RN（LINK_RN），全程 link→unlink→cleanup delete 净零。
const SEED_STANDARD = "GB 175-2023";
const SEED_PARAMETER = "IP-0001";

const LINK_RN = uniqueName("ct-rn-link");
const linkRnEnsured = new Map<string, Promise<void>>();
function ensureLinkRn(target: Target): Promise<void> {
  let p = linkRnEnsured.get(target.name);
  if (!p) {
    p = (async () => {
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/report-names",
        body: { code: LINK_RN, name: `rn link ${LINK_RN}` },
      });
      expect([200, 201], `${target.name} 创 link 用 report-name 期望 200/201 实得 ${r.status}`).toContain(r.status);
      registerCleanup(`delete-report-name:${target.name}:${LINK_RN.slice(-8)}`, async () => {
        const tr = await probeRequest(target, { method: "DELETE", path: `/api/report-names/${LINK_RN}` });
        if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
          console.warn(`[teardown] delete link-rn ${target.name} status=${tr.status}`);
        }
      });
    })();
    linkRnEnsured.set(target.name, p);
  }
  return p;
}

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  ids: Map<string, string>;
}
const ctx: Ctx = { ids: new Map() };

describe.skipIf(!live)("M96.F02.I03 POST /api/report-names 四方比对 / M01.F04.I02", () => {
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

describe.skipIf(!live)("M96.F02.I04 PUT /api/report-names/{code} 四方比对 / M01.F04.I01", () => {
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

describe.skipIf(!live)("M96.F02.I05 DELETE /api/report-names/{code} 四方比对 / M01.F05.I02", () => {
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

// 3 junction links — upsert 模式；reportNameCode 用现场创建的 LINK_RN（见上注）
describe.skipIf(!live)("M96.F02.I09 POST /api/report-names/links/object 四方比对 / M04.F07.I02", () => {
  for (const target of targets) {
    it(`${target.name} link → 200/204`, async () => {
      await ensureLinkRn(target);
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/report-names/links/object",
        body: { inspectionObjectCode: SEED_OBJECT, reportNameCode: LINK_RN },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I10 DELETE /api/report-names/links/object 四方比对 / M04.F07.I03", () => {
  for (const target of targets) {
    it(`${target.name} unlink → 200/204`, async () => {
      await ensureLinkRn(target);
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/report-names/links/object",
        body: { inspectionObjectCode: SEED_OBJECT, reportNameCode: LINK_RN },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I12 POST /api/report-names/links/standard 四方比对 / M04.F08.I02", () => {
  for (const target of targets) {
    it(`${target.name} link(RN, STD, role=judgment) → 200/204`, async () => {
      await ensureLinkRn(target);
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/report-names/links/standard",
        body: { reportNameCode: LINK_RN, inspectionStandardCode: SEED_STANDARD, role: "JUDGMENT" },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I13 DELETE /api/report-names/links/standard 四方比对 / M04.F08.I03", () => {
  for (const target of targets) {
    it(`${target.name} unlink(RN, STD, role=judgment) → 200/204`, async () => {
      await ensureLinkRn(target);
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/report-names/links/standard",
        body: { reportNameCode: LINK_RN, inspectionStandardCode: SEED_STANDARD, role: "JUDGMENT" },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I15 POST /api/report-names/links/parameter 四方比对 / M06.F02.I02", () => {
  for (const target of targets) {
    it(`${target.name} link(RN, PRM) → 200/204`, async () => {
      await ensureLinkRn(target);
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/report-names/links/parameter",
        body: { reportNameCode: LINK_RN, inspectionParameterCode: SEED_PARAMETER },
      });
      expect([200, 201, 204], `${target.name} link 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }
});

describe.skipIf(!live)("M96.F02.I16 DELETE /api/report-names/links/parameter 四方比对 / M06.F02.I03", () => {
  for (const target of targets) {
    it(`${target.name} unlink(RN, PRM) → 200/204`, async () => {
      await ensureLinkRn(target);
      const r = await probeRequest(target, {
        method: "DELETE",
        path: "/api/report-names/links/parameter",
        body: { reportNameCode: LINK_RN, inspectionParameterCode: SEED_PARAMETER },
      });
      expect([200, 201, 204], `${target.name} unlink 期望 2xx 实得 ${r.status}`).toContain(r.status);
    }, 30_000);
  }

  afterAll(async () => {
    await runCleanups();
  }, 60_000);
});