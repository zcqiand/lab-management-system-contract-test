// M96.F02 — /api/catalog/{brands,models,specs,grades} POST/PUT/DELETE 写端点（Phase 2）。
//
// SSOT: inspection-catalog.tsp 4 个码表的 create/update/delete。code 是业务主键
// （唯一化 prefix ct-b-/ct-m-/ct-s-/ct-g-）—— cleanup-pg.ts 走 prefix 删除兜底。
//
// **L2 SSOT 覆盖解析器只扫字面 describe 标题**：4 表 × 3 操作 = 12 段必须手写，
// 不能用 `for...of` 循环生成。
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { probeRequest } from "../src/http.js";
import { type Target, selectedTargets } from "../src/targets.js";
import { uniqueName } from "../src/unique.js";
import {
  clearCleanups,
  registerCleanup,
  runCleanups,
} from "../src/teardown.js";

const SEED_OBJECT_CODE = "OBJ-SP01-P1";
const SEED_SPECIALTY_CODE = "SP01";

const targets: Target[] = selectedTargets();
const live = targets.length >= 2;

interface Body {
  code: string;
  name: string;
  inspectionObjectCode?: string;
}

interface Ctx {
  ids: Map<string, Map<string, string>>; // table → target → id
}
const ctx: Ctx = {
  ids: new Map([
    ["brands", new Map()],
    ["models", new Map()],
    ["specs", new Map()],
    ["grades", new Map()],
  ]),
};

async function cleanup(target: Target, table: string, code: string) {
  registerCleanup(
    `delete-catalog-${table}:${target.name}:${code.slice(-8)}`,
    async () => {
      const tr = await probeRequest(target, {
        method: "DELETE",
        path: `/api/catalog/${table}/${code}`,
      });
      if (tr.status !== 200 && tr.status !== 204 && tr.status !== 404) {
        console.warn(
          `[teardown] delete catalog/${table}/${code} ${target.name} status=${tr.status}`,
        );
      }
    },
  );
}

describe.skipIf(!live)(
  "M96.F02.I02 POST /api/catalog/brands 四方比对 / M00.F01.I01",
  () => {
    beforeAll(() => clearCleanups(), 30_000);

    for (const target of targets) {
      it(`${target.name} 创 brand → 200 + 字段齐全`, async () => {
        const code = uniqueName("ct-b");
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/catalog/brands",
          body: {
            code,
            name: `brand ${code}`,
            inspectionObjectCode: SEED_OBJECT_CODE,
          } as Body,
        });
        expect(
          [200, 201],
          `${target.name} POST brand 期望 200/201 实得 ${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`,
        ).toContain(r.status);
        const body = r.body as Record<string, unknown>;
        expect(body.code).toBe(code);
        ctx.ids.get("brands")!.set(target.name, code);
        await cleanup(target, "brands", code);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I03 PUT /api/catalog/brands/{code} 四方比对 / M01.F04.I02",
  () => {
    for (const target of targets) {
      it(`${target.name} 改 name → 200`, async () => {
        const code = ctx.ids.get("brands")!.get(target.name);
        if (!code) throw new Error(`${target.name} brand 未创建`);
        const r = await probeRequest(target, {
          method: "PUT",
          path: `/api/catalog/brands/${code}`,
          body: { name: `renamed-${uniqueName("ct")}` },
        });
        expect(
          [200],
          `${target.name} PUT brand 期望 200 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I04 DELETE /api/catalog/brands/{code} 四方比对 / M01.F04.I01",
  () => {
    it("brand 删除 → 200/204 + 重复删 → 404", async () => {
      for (const target of targets) {
        const code = ctx.ids.get("brands")!.get(target.name);
        if (!code) continue;
        const first = await probeRequest(target, {
          method: "DELETE",
          path: `/api/catalog/brands/${code}`,
        });
        expect(
          [200, 204],
          `${target.name} DELETE brand 期望 200/204 实得 ${first.status}`,
        ).toContain(first.status);
        const second = await probeRequest(target, {
          method: "DELETE",
          path: `/api/catalog/brands/${code}`,
        });
        expect(
          [404, 204],
          `${target.name} 重复删 brand 期望 404/204 实得 ${second.status}`,
        ).toContain(second.status);
        ctx.ids.get("brands")!.delete(target.name);
      }
    }, 60_000);
  },
);

describe.skipIf(!live)(
  "M96.F02.I06 POST /api/catalog/models 四方比对 / M04.F06.I02",
  () => {
    for (const target of targets) {
      it(`${target.name} 创 model → 200`, async () => {
        const code = uniqueName("ct-m");
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/catalog/models",
          body: {
            code,
            name: `model ${code}`,
            inspectionObjectCode: SEED_OBJECT_CODE,
          } as Body,
        });
        expect(
          [200, 201],
          `${target.name} POST model 期望 200/201 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.ids.get("models")!.set(target.name, code);
        await cleanup(target, "models", code);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I07 PUT /api/catalog/models/{code} 四方比对 / M04.F06.I03",
  () => {
    for (const target of targets) {
      it(`${target.name} 改 name → 200`, async () => {
        const code = ctx.ids.get("models")!.get(target.name);
        if (!code) throw new Error(`${target.name} model 未创建`);
        const r = await probeRequest(target, {
          method: "PUT",
          path: `/api/catalog/models/${code}`,
          body: { name: `renamed-${uniqueName("ct")}` },
        });
        expect(
          [200],
          `${target.name} PUT model 期望 200 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I08 DELETE /api/catalog/models/{code} 四方比对 / M04.F06.I04",
  () => {
    it("model 删除 → 200/204 + 重复删 → 404", async () => {
      for (const target of targets) {
        const code = ctx.ids.get("models")!.get(target.name);
        if (!code) continue;
        const first = await probeRequest(target, {
          method: "DELETE",
          path: `/api/catalog/models/${code}`,
        });
        expect(
          [200, 204],
          `${target.name} DELETE model 期望 200/204 实得 ${first.status}`,
        ).toContain(first.status);
        ctx.ids.get("models")!.delete(target.name);
      }
    }, 60_000);
  },
);

describe.skipIf(!live)(
  "M96.F02.I10 POST /api/catalog/specs 四方比对 / M04.F07.I03",
  () => {
    for (const target of targets) {
      it(`${target.name} 创 spec → 200`, async () => {
        const code = uniqueName("ct-s");
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/catalog/specs",
          body: {
            code,
            name: `spec ${code}`,
            inspectionObjectCode: SEED_OBJECT_CODE,
          } as Body,
        });
        expect(
          [200, 201],
          `${target.name} POST spec 期望 200/201 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.ids.get("specs")!.set(target.name, code);
        await cleanup(target, "specs", code);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I11 PUT /api/catalog/specs/{code} 四方比对 / M04.F07.I04",
  () => {
    for (const target of targets) {
      it(`${target.name} 改 name → 200`, async () => {
        const code = ctx.ids.get("specs")!.get(target.name);
        if (!code) throw new Error(`${target.name} spec 未创建`);
        const r = await probeRequest(target, {
          method: "PUT",
          path: `/api/catalog/specs/${code}`,
          body: { name: `renamed-${uniqueName("ct")}` },
        });
        expect(
          [200],
          `${target.name} PUT spec 期望 200 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I12 DELETE /api/catalog/specs/{code} 四方比对 / M04.F08.I02",
  () => {
    it("spec 删除 → 200/204 + 重复删 → 404", async () => {
      for (const target of targets) {
        const code = ctx.ids.get("specs")!.get(target.name);
        if (!code) continue;
        const first = await probeRequest(target, {
          method: "DELETE",
          path: `/api/catalog/specs/${code}`,
        });
        expect(
          [200, 204],
          `${target.name} DELETE spec 期望 200/204 实得 ${first.status}`,
        ).toContain(first.status);
        ctx.ids.get("specs")!.delete(target.name);
      }
    }, 60_000);
  },
);

describe.skipIf(!live)(
  "M96.F02.I14 POST /api/catalog/grades 四方比对 / M04.F08.I04",
  () => {
    for (const target of targets) {
      it(`${target.name} 创 grade → 200`, async () => {
        const code = uniqueName("ct-g");
        const r = await probeRequest(target, {
          method: "POST",
          path: "/api/catalog/grades",
          body: {
            code,
            name: `grade ${code}`,
            inspectionObjectCode: SEED_OBJECT_CODE,
          } as Body,
        });
        expect(
          [200, 201],
          `${target.name} POST grade 期望 200/201 实得 ${r.status}`,
        ).toContain(r.status);
        ctx.ids.get("grades")!.set(target.name, code);
        await cleanup(target, "grades", code);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I15 PUT /api/catalog/grades/{code} 四方比对 / M06.F02.I02",
  () => {
    for (const target of targets) {
      it(`${target.name} 改 name → 200`, async () => {
        const code = ctx.ids.get("grades")!.get(target.name);
        if (!code) throw new Error(`${target.name} grade 未创建`);
        const r = await probeRequest(target, {
          method: "PUT",
          path: `/api/catalog/grades/${code}`,
          body: { name: `renamed-${uniqueName("ct")}` },
        });
        expect(
          [200],
          `${target.name} PUT grade 期望 200 实得 ${r.status}`,
        ).toContain(r.status);
      }, 30_000);
    }
  },
);

describe.skipIf(!live)(
  "M96.F02.I16 DELETE /api/catalog/grades/{code} 四方比对 / M06.F02.I03",
  () => {
    it("grade 删除 → 200/204 + 重复删 → 404", async () => {
      for (const target of targets) {
        const code = ctx.ids.get("grades")!.get(target.name);
        if (!code) continue;
        const first = await probeRequest(target, {
          method: "DELETE",
          path: `/api/catalog/grades/${code}`,
        });
        expect(
          [200, 204],
          `${target.name} DELETE grade 期望 200/204 实得 ${first.status}`,
        ).toContain(first.status);
        ctx.ids.get("grades")!.delete(target.name);
      }
    }, 60_000);

    afterAll(async () => {
      await runCleanups();
    }, 60_000);
  },
);
