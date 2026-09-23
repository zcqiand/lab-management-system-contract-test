// ADR-0018 (lab 版): 写端点探针行清理 —— beforeAll 走 HTTP DELETE 清 PG 共库探针数据。
//
// 设计约束（CLAUDE.md §2 铁律 + ADR-0015）：
//   1. 走 HTTP 不直连 PG —— 守黑盒契约
//   2. DELETE 容差 200 / 204 / 404 —— aspnetcore DELETE 返 200，其余返 204，已删返 404 都算成功
//
// 探针行识别：所有写端点测试 body 都走 uniqueName("ct-...") 系列 prefix。
// 3 后端共库（PG）—— 任何一行残留都会让下次跑撞唯一约束或漂移 total 计数。
//
// 清理范围（按 SSOT 写端点全集）：
//   - /contracts
//   - /catalog/{brands,models,specs,grades}
//   - /inspection/{specialties,objects,parameters,standards} + 4 junction links
//   - /param-interfaces + /param-interfaces/links
//   - /report-names + 3 junction links
//   - /receipts（接样单）
//   - /samples
//   - /technical-requirements
//   - /test-records
//   - /calculation-methods
//
// junction 端点（POST/DELETE link）：真后端都是基于「是否已存在」返回 200/204，
// 不持久化 probe 状态；upsert 模式自然幂等，不需特别清理。
import { login, probeRequest } from "./http.js";
import { selectedTargets, type Target } from "./targets.js";

// 探针 prefix：所有写测试 body 用 uniqueName("ct-...") 生成 code/name 等字段。
// （也兼容旧 prefix 残留 —— 2026-09-02 之前几轮跑未清理的 ct-row- 之类也走同条清理。）
const PROBE_PREFIX_RE = /^(ct-|probe-|contract-test)/;

const DELETE_TOLERANT = (s: number) => s === 200 || s === 204 || s === 404;

/** 资源类型 → (list 路径, 字段名用于 prefix 匹配, id 字段名) */
interface ResourceSpec {
  readonly listPath: string;
  readonly matchField: string; // 哪个字段含 prefix（code 或 name）
  readonly idField: string; // 哪个字段是 id
  readonly deletePathTemplate: string; // `${listPath}/${id}`
}

const RESOURCE_SPECS: readonly ResourceSpec[] = [
  {
    listPath: "/api/contracts",
    matchField: "code",
    idField: "id",
    deletePathTemplate: "/api/contracts/{*}",
  },
  {
    listPath: "/api/catalog/brands",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/catalog/brands/{*}",
  },
  {
    listPath: "/api/catalog/models",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/catalog/models/{*}",
  },
  {
    listPath: "/api/catalog/specs",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/catalog/specs/{*}",
  },
  {
    listPath: "/api/catalog/grades",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/catalog/grades/{*}",
  },
  {
    listPath: "/api/inspection/specialties",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/inspection/specialties/{*}",
  },
  {
    listPath: "/api/inspection/objects",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/inspection/objects/{*}",
  },
  {
    listPath: "/api/inspection/parameters",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/inspection/parameters/{*}",
  },
  {
    listPath: "/api/inspection/standards",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/inspection/standards/{*}",
  },
  {
    listPath: "/api/param-interfaces",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/param-interfaces/{*}",
  },
  {
    listPath: "/api/report-names",
    matchField: "code",
    idField: "code",
    deletePathTemplate: "/api/report-names/{*}",
  },
  {
    listPath: "/api/receipts",
    matchField: "contractId",
    idField: "id",
    deletePathTemplate: "/api/receipts/{*}",
  },
  {
    listPath: "/api/samples",
    matchField: "name",
    idField: "id",
    deletePathTemplate: "/api/samples/{*}",
  },
  {
    listPath: "/api/test-records",
    matchField: "sampleId",
    idField: "id",
    deletePathTemplate: "/api/test-records/{*}",
  },
  // technical-requirements / calculation-methods 主键是 code 三/二段复合；4 后端 DELETE 路径相同。
  {
    listPath: "/api/technical-requirements",
    matchField: "inspectionObjectCode",
    idField: "inspectionObjectCode",
    deletePathTemplate: "/api/technical-requirements/{*}",
  },
  {
    listPath: "/api/calculation-methods",
    matchField: "inspectionObjectCode",
    idField: "inspectionObjectCode",
    deletePathTemplate: "/api/calculation-methods/{*}",
  },
];

interface Row {
  [k: string]: unknown;
  id?: string;
  code?: string;
  name?: string;
}

async function cleanupResource(
  target: Target,
  spec: ResourceSpec,
): Promise<void> {
  const token = await login(target);
  // 大页码拿全量 —— SSOT family pagination defaults pageSize=20，写测试本轮累计一般 < 100 行。
  const list = await probeRequest(target, {
    method: "GET",
    path: `${spec.listPath}?page=0&pageSize=500`,
    token,
  });
  if (list.status !== 200) {
    // 端点没起来 / 不存在 → 静默跳过，不阻塞下次清理。
    return;
  }
  const body = list.body as { items?: Row[] } | Row[] | undefined;
  const items: Row[] = Array.isArray(body) ? body : (body?.items ?? []);
  for (const row of items) {
    const matchValue = String(row[spec.matchField] ?? "");
    if (!PROBE_PREFIX_RE.test(matchValue)) continue;
    const id = String(row[spec.idField] ?? "");
    if (!id) continue;
    const delPath = spec.deletePathTemplate.replace("{*}", id);
    const del = await probeRequest(target, {
      method: "DELETE",
      path: delPath,
      token,
    });
    if (!DELETE_TOLERANT(del.status)) {
      console.warn(
        `[cleanup-pg] ${target.name} DELETE ${delPath} status=${del.status}`,
      );
    }
  }
}

/**
 * vitest globalSetup 在每个 vitest 进程开始时跑一次。
 * unit 模式（无 CONTRACT_TARGETS）由 tests/globalSetup.ts early-return。
 */
export async function cleanupAllProbeRows(): Promise<void> {
  const targets = selectedTargets();
  for (const t of targets) {
    for (const spec of RESOURCE_SPECS) {
      try {
        await cleanupResource(t, spec);
      } catch (cause) {
        // 不抛 —— 清理失败不应阻塞测试运行；下次跑还会再清。
        console.warn(
          `[cleanup-pg] ${t.name} ${spec.listPath} cleanup failed:`,
          cause,
        );
      }
    }
  }
}
