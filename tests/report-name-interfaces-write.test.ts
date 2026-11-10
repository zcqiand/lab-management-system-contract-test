// M06.F09 — /api/report-name-interfaces POST/PUT/DELETE + link/unlink 写端点（Phase 2）。
//
// SSOT: report-name-interfaces.tsp M06.F09 报告名称级样品扩展属性界面 CRUD + link/unlink。
// CreateReportNameInterfaceRequest 必填仅 code（version 服务端管理缺省 1，客户端不送；
// config 形状与 ParamInterface 同款 { title?, fields[], computed?, params? }）。
// link/unlink 探测用非种子组合 RN-101 + sri-welding：两端点都在种子库、链表无此对
// （种子 links 只有 RN-102-1/2/3、RN-105-1/2 五对）→ 创建/删除均可重跑。
import { afterAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import { registerCleanup, runCleanups } from "../src/teardown.js";

const SEED_REPORT_NAME = "RN-101";
const SEED_INTERFACE = "sri-welding";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Ctx {
  ids: Map<string, string>;
}
const ctx: Ctx = { ids: new Map() };

describe.skipIf(!live)(
  "M06.F09.I03 POST /api/report-name-interfaces 四方比对 / M01.F04.I01",
  () => {
    for (const target of targets) {
      it(`${target.name} 创 report-name-interface → 200`, async () => {
        const code = uniqueName("ct-rni");
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/report-name-interfaces",
          body: { code, name: `rni ${code}` },
        });
        expect(
          [200, 201],
          `${target.name} POST report-name-interface 期望 200/201 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.ids.set(target.name, code);
        registerCleanup(
          `delete-rni:${target.name}:${code.slice(-8)}`,
          async () => {
            const tr = await probeRequest(target, {
              method: "DELETE",
              path: `/api/report-name-interfaces/${code}`,
            });
            if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
              console.warn(
                `[teardown] delete report-name-interface ${target.name} status=${tr.status}`,
              );
            }
          },
        );
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M06.F09.I04 PUT /api/report-name-interfaces/{code} 四方比对 / M01.F05.I02",
  () => {
    for (const target of targets) {
      it(`${target.name} 改 name → 200`, async () => {
        const code = ctx.ids.get(target.name);
        if (!code) throw new Error(`${target.name} report-name-interface 未创建`);
        const r = await probeRequest(target, {
          method: "PUT",
          path: `/api/report-name-interfaces/${code}`,
          body: { name: `renamed-${uniqueName("ct")}` },
        });
        expect(
          [200],
          `${target.name} PUT report-name-interface 期望 200 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M06.F09.I05 DELETE /api/report-name-interfaces/{code} 四方比对 / M04.F06.I02",
  () => {
    it("report-name-interface 删除（级联删 links）→ 200/204", async () => {
      for (const target of targets) {
        const code = ctx.ids.get(target.name);
        if (!code) continue;
        const r = await probeRequest(target, {
          method: "DELETE",
          path: `/api/report-name-interfaces/${code}`,
        });
        expect(
          [200, 204],
          `${target.name} DELETE report-name-interface 期望 200/204 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.ids.delete(target.name);
      }
    }, 60_000);
  },
);

describe.skipIf(!live)(
  "M06.F09.I06 POST /api/report-name-interfaces/links 四方比对 / M04.F06.I03",
  () => {
    for (const target of targets) {
      it(`${target.name} link(RN-101, sri-welding) → 200/204`, async () => {
        // 前置清残留（上次残跑可能留下同对）：unlink 幂等，状态不看
        await probeRequest(target, {
          method: "DELETE",
          path: "/api/report-name-interfaces/links",
          body: {
            reportNameCode: SEED_REPORT_NAME,
            reportNameInterfaceCode: SEED_INTERFACE,
          },
        });
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/report-name-interfaces/links",
          body: {
            reportNameCode: SEED_REPORT_NAME,
            reportNameInterfaceCode: SEED_INTERFACE,
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
  "M06.F09.I07 DELETE /api/report-name-interfaces/links 四方比对 / M04.F06.I04",
  () => {
    for (const target of targets) {
      it(`${target.name} unlink(RN-101, sri-welding) → 200/204`, async () => {
        const r = await probeRequest(target, {
          method: "DELETE",
          path: "/api/report-name-interfaces/links",
          body: {
            reportNameCode: SEED_REPORT_NAME,
            reportNameInterfaceCode: SEED_INTERFACE,
          },
        });
        expect(
          [200, 201, 204],
          `${target.name} unlink 期望 2xx 实得 ${r.status}`,
        ).toContain(r.status);
        // 幂等：重复 unlink 未命中同样 2xx（契约 unlink = void，同 param-interfaces 先例）
        const r2 = await probeRequest(target, {
          method: "DELETE",
          path: "/api/report-name-interfaces/links",
          body: {
            reportNameCode: SEED_REPORT_NAME,
            reportNameInterfaceCode: SEED_INTERFACE,
          },
        });
        expect(
          [200, 201, 204],
          `${target.name} 重复 unlink 期望幂等 2xx 实得 ${r2.status}`,
        ).toContain(r2.status);
      }, 30_000);
    }

    afterAll(async () => {
      await runCleanups();
    }, 60_000);
  },
);
