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
// 2026-10-11 REQ-2026-023 live r2/r3：LINK_RN 曾是模块级单码五目标共用——共库
// （lab_dev 单表无 tenant 列，code 全局唯一）下首个目标 201 后，nextjs 重复 POST
// 返 400「编码已存在」（其路由契约；其余四仓重复 POST 返 200 upsert 语义）→
// 非首个目标全红。改 per-target 独立码（同 I03 模式），竞争面归零。
const SEED_STANDARD = "GB 175-2023";
const SEED_PARAMETER = "IP-0001";

const linkRnCodes = new Map<string, string>();
function linkRn(target: Target): string {
  let code = linkRnCodes.get(target.name);
  if (!code) {
    code = uniqueName("ct-rn-link");
    linkRnCodes.set(target.name, code);
  }
  return code;
}
const linkRnEnsured = new Map<string, Promise<void>>();
function ensureLinkRn(target: Target): Promise<void> {
  let p = linkRnEnsured.get(target.name);
  if (!p) {
    p = (async () => {
      const code = linkRn(target);
      const r = await probeRequest(target, {
        method: "POST",
        path: "/api/report-names",
        body: { code, name: `rn link ${code}` },
      });
      expect(
        [200, 201],
        `${target.name} 创 link 用 report-name 期望 200/201 实得 ${r.status}`,
      ).toContain(r.status);
      registerCleanup(
        `delete-report-name:${target.name}:${code.slice(-8)}`,
        async () => {
          const tr = await probeRequest(target, {
            method: "DELETE",
            path: `/api/report-names/${code}`,
          });
          if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
            console.warn(
              `[teardown] delete link-rn ${target.name} status=${tr.status}`,
            );
          }
        },
      );
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

describe.skipIf(!live)(
  "M96.F02.I03 POST /api/report-names 四方比对 / M01.F04.I02",
  () => {
    for (const target of targets) {
      it(`${target.name} 创 report name → 200`, async () => {
        const code = uniqueName("ct-rn");
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/report-names",
          body: { code, name: `rn ${code}` },
        });
        expect(
          [200, 201],
          `${target.name} POST report-name 期望 200/201 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.ids.set(target.name, code);
        registerCleanup(
          `delete-report-name:${target.name}:${code.slice(-8)}`,
          async () => {
            const tr = await probeRequest(target, {
              method: "DELETE",
              path: `/api/report-names/${code}`,
            });
            if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
              console.warn(
                `[teardown] delete report-name ${target.name} status=${tr.status}`,
              );
            }
          },
        );
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I04 PUT /api/report-names/{code} 四方比对 / M01.F04.I01",
  () => {
    for (const target of targets) {
      it(`${target.name} 改 name → 200`, async () => {
        const code = ctx.ids.get(target.name);
        if (!code) throw new Error(`${target.name} report-name 未创建`);
        const r = await probeRequest(target, {
          method: "PUT",
          path: `/api/report-names/${code}`,
          body: { name: `renamed-${uniqueName("ct")}` },
        });
        expect(
          [200],
          `${target.name} PUT report-name 期望 200 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I05 DELETE /api/report-names/{code} 四方比对 / M01.F05.I02",
  () => {
    it("report-name 删除 → 200/204", async () => {
      for (const target of targets) {
        const code = ctx.ids.get(target.name);
        if (!code) continue;
        const r = await probeRequest(target, {
          method: "DELETE",
          path: `/api/report-names/${code}`,
        });
        expect(
          [200, 204],
          `${target.name} DELETE report-name 期望 200/204 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.ids.delete(target.name);
      }
    }, 60_000);
  },
);

// 3 junction links — upsert 模式；reportNameCode 用现场创建的 per-target LINK_RN（见上注）
describe.skipIf(!live)(
  "M96.F02.I09 POST /api/report-names/links/object 四方比对 / M04.F07.I02",
  () => {
    for (const target of targets) {
      it(`${target.name} link → 200/204`, async () => {
        await ensureLinkRn(target);
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/report-names/links/object",
          body: { inspectionObjectCode: SEED_OBJECT, reportNameCode: linkRn(target) },
        });
        expect(
          [200, 201, 204],
          `${target.name} link 期望 2xx 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I10 DELETE /api/report-names/links/object 四方比对 / M04.F07.I03",
  () => {
    for (const target of targets) {
      it(`${target.name} unlink → 200/204`, async () => {
        await ensureLinkRn(target);
        // 共库防毒化（3 真后端共 lab_dev，sequential SB→ASP）：先 link（upsert）
        // 保证本目标有行可删，否则另一后端的 unlink 已删共享行 → 首删 404 噪音。
        await probeRequest(target, {
          method: "POST",
          path: "/api/report-names/links/object",
          body: { inspectionObjectCode: SEED_OBJECT, reportNameCode: linkRn(target) },
        });
        const r = await probeRequest(target, {
          method: "DELETE",
          path: "/api/report-names/links/object",
          body: { inspectionObjectCode: SEED_OBJECT, reportNameCode: linkRn(target) },
        });
        expect(
          [200, 201, 204],
          `${target.name} unlink 期望 2xx 实得 ${r.status}`,
        ).toContain(r.status);
        // 幂等：重复 unlink 未命中同样 204（契约 unlink = void，Task 2.6 推广 REQ-2026-001 语义）
        const r2 = await probeRequest(target, {
          method: "DELETE",
          path: "/api/report-names/links/object",
          body: { inspectionObjectCode: SEED_OBJECT, reportNameCode: linkRn(target) },
        });
        expect(
          [200, 201, 204],
          `${target.name} 重复 unlink 期望幂等 2xx 实得 ${r2.status}`,
        ).toContain(r2.status);
      }, 90_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I12 POST /api/report-names/links/standard 四方比对 / M04.F08.I02",
  () => {
    for (const target of targets) {
      it(`${target.name} link(RN, STD, role=judgment) → 200/204`, async () => {
        await ensureLinkRn(target);
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/report-names/links/standard",
          body: {
            reportNameCode: linkRn(target),
            inspectionStandardCode: SEED_STANDARD,
            role: "JUDGMENT",
          },
        });
        expect(
          [200, 201, 204],
          `${target.name} link 期望 2xx 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I13 DELETE /api/report-names/links/standard 四方比对 / M04.F08.I03",
  () => {
    for (const target of targets) {
      it(`${target.name} unlink(RN, STD, role=judgment) → 200/204`, async () => {
        await ensureLinkRn(target);
        // 共库防毒化：先 link（upsert）保证本目标有行可删（见 links/object 注）。
        await probeRequest(target, {
          method: "POST",
          path: "/api/report-names/links/standard",
          body: {
            reportNameCode: linkRn(target),
            inspectionStandardCode: SEED_STANDARD,
            role: "JUDGMENT",
          },
        });
        const r = await probeRequest(target, {
          method: "DELETE",
          path: "/api/report-names/links/standard",
          body: {
            reportNameCode: linkRn(target),
            inspectionStandardCode: SEED_STANDARD,
            role: "JUDGMENT",
          },
        });
        expect(
          [200, 201, 204],
          `${target.name} unlink 期望 2xx 实得 ${r.status}`,
        ).toContain(r.status);
        // 幂等：重复 unlink 未命中同样 204（契约 unlink = void，Task 2.6 推广 REQ-2026-001 语义）
        const r2 = await probeRequest(target, {
          method: "DELETE",
          path: "/api/report-names/links/standard",
          body: {
            reportNameCode: linkRn(target),
            inspectionStandardCode: SEED_STANDARD,
            role: "JUDGMENT",
          },
        });
        expect(
          [200, 201, 204],
          `${target.name} 重复 unlink 期望幂等 2xx 实得 ${r2.status}`,
        ).toContain(r2.status);
      }, 90_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I15 POST /api/report-names/links/parameter 四方比对 / M06.F02.I02",
  () => {
    for (const target of targets) {
      it(`${target.name} link(RN, PRM) → 200/204`, async () => {
        await ensureLinkRn(target);
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/report-names/links/parameter",
          body: {
            reportNameCode: linkRn(target),
            inspectionParameterCode: SEED_PARAMETER,
          },
        });
        expect(
          [200, 201, 204],
          `${target.name} link 期望 2xx 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I16 DELETE /api/report-names/links/parameter 四方比对 / M06.F02.I03",
  () => {
    for (const target of targets) {
      it(`${target.name} unlink(RN, PRM) → 200/204`, async () => {
        await ensureLinkRn(target);
        // 共库防毒化：先 link（upsert）保证本目标有行可删（见 links/object 注）。
        await probeRequest(target, {
          method: "POST",
          path: "/api/report-names/links/parameter",
          body: {
            reportNameCode: linkRn(target),
            inspectionParameterCode: SEED_PARAMETER,
          },
        });
        const r = await probeRequest(target, {
          method: "DELETE",
          path: "/api/report-names/links/parameter",
          body: {
            reportNameCode: linkRn(target),
            inspectionParameterCode: SEED_PARAMETER,
          },
        });
        expect(
          [200, 201, 204],
          `${target.name} unlink 期望 2xx 实得 ${r.status}`,
        ).toContain(r.status);
        // 幂等：重复 unlink 未命中同样 204（契约 unlink = void，Task 2.6 推广 REQ-2026-001 语义）
        const r2 = await probeRequest(target, {
          method: "DELETE",
          path: "/api/report-names/links/parameter",
          body: {
            reportNameCode: linkRn(target),
            inspectionParameterCode: SEED_PARAMETER,
          },
        });
        expect(
          [200, 201, 204],
          `${target.name} 重复 unlink 期望幂等 2xx 实得 ${r2.status}`,
        ).toContain(r2.status);
      }, 90_000);
    }

    afterAll(async () => {
      await runCleanups();
    }, 60_000);
  },
);
