// M96.F03 探针 —— 打一个目标，拿回 (status, body)。
//
// 用 axios + tough-cookie jar，工作在 HTTP 层而非 fetch 的 CookieStore：
// 不受「HttpOnly cookie 在 node fetch 被屏蔽」的坑限制，无需 debug 导出通道（ADR-0015）。
// maxRedirects: 0 —— 302 链要手动走，Location 的 query 参数是 OAuth 流的断言点。

import axios, { type AxiosInstance } from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";

import type { Probe } from "./compare.js";
import type { Target } from "./targets.js";

/** 3 真后端 dev 目录共有的账号（2026-09-02 收敛，与 saas seed V016 alice 同源）。显式字面量，不走 env 兜底。 */
export const SEED_USER = { username: "alice", password: "dev123456" } as const;

export class UnreachableError extends Error {
  constructor(target: string, cause: unknown) {
    super(`目标 ${target} 连不上 —— 声明了就必须可达。原因: ${String(cause)}`);
  }
}

export function client(target: Target): AxiosInstance {
  const jar = new CookieJar();
  return wrapper(
    axios.create({
      baseURL: target.baseUrl,
      jar,
      withCredentials: true,
      maxRedirects: 0,
      // 120s：live 跑 dev server 的现实水位（nextjs dev 每个探针先 login，
      // 单次 login 实测 7.5-8s；cleanup 的 list?pageSize=500 在 remote PG + N+1 下
      // 实测 nextjs 32s / springboot 28s——30s 恒间歇性误报 Unreachable）。
      // 声明即必须可达的判定不变，只是不再把「dev 慢查询」当「连不上」。
      timeout: 120_000,
      // 任何状态码都返回，不抛 —— 状态码本身是被比对的对象。
      validateStatus: () => true,
      headers: { "content-type": "application/json" },
    }),
  );
}

/**
 * 登录拿 token。走真实登录路径（lab BASE=/api 无 v1；响应字段名 token 非 accessToken）。
 *
 * 认证形态兼容（2026-09-02 硬约束）：后端两种 SSO 形态都必须能打——
 *   - no-sso（dev 默认）：本地凭证 admin/dev123456 直登
 *   - 真 saas OAuth 2.0（LAB_SSO_PROFILE=default + saas 全家在跑）：本地密码登录
 *     内部走 service account 换 saas token，契约面不变（响应 shape 相同）
 * 两种形态登录响应 shape 必须一致——这正是四方比对要守住的契约。
 */
export async function login(target: Target): Promise<string> {
  const http = client(target);
  let res;
  try {
    res = await http.post("/api/auth/login", SEED_USER);
  } catch (cause) {
    throw new UnreachableError(target.name, cause);
  }
  if (res.status !== 200) {
    throw new Error(
      `${target.name}: 登录失败 status=${res.status} body=${JSON.stringify(res.data).slice(0, 300)}`,
    );
  }
  const token = (res.data as { token?: string }).token;
  if (!token) {
    throw new Error(`${target.name}: 登录 200 但响应里没有 token`);
  }
  return token;
}

/**
 * 瞬态超时类消解（Task 4.2，移植自 saas contract-test 同款 20714eb）：
 * axios 超时（ECONNABORTED 且无响应）在 live run 里是已知的瞬态尖峰（后端 GC pause /
 * JIT warmup / nextjs dev 首访路由编译），不是真挂——真挂是连接层快速失败
 * （ECONNREFUSED）或重试同样超时。只对 **GET** 单发重试一次：幂等，双发无害；
 * POST/PATCH 绝不重试（重复建行）。重试仍超时 → 照旧 UnreachableError（守门不静默吞）。
 * 注：本仓 axios budget 是 120s（见 client()），单次尖峰通常被它直接吸收；
 * 这层重试与 globalSetup 预热（prewarm.ts）是「预热吸收冷启动 + 重试吸收残留尖峰」
 * 的双层兜底，与 saas 家族保持同款语义。
 */
function isTimeout(err: unknown): boolean {
  return (
    axios.isAxiosError(err) && err.code === "ECONNABORTED" && err.response === undefined
  );
}

async function getWithTimeoutRetry(
  http: AxiosInstance,
  path: string,
  config: Record<string, unknown>,
) {
  const attempt = () => http.get(path, config);
  try {
    return await attempt();
  } catch (cause) {
    if (isTimeout(cause)) {
      return await attempt();
    }
    throw cause;
  }
}

/** 带 Bearer 打一个 GET，返回可比对的探针。 */
export async function probeGet(target: Target, path: string, token: string): Promise<Probe> {
  const http = client(target);
  try {
    const res = await getWithTimeoutRetry(http, path, {
      headers: { authorization: `Bearer ${token}` },
    });
    return { target: target.name, status: res.status, body: res.data };
  } catch (cause) {
    throw new UnreachableError(target.name, cause);
  }
}

/** 对一组目标跑同一个 GET。登录各自进行（token 不跨后端复用）。 */
export async function probeAll(targets: readonly Target[], path: string): Promise<Probe[]> {
  const out: Probe[] = [];
  for (const t of targets) {
    const token = await login(t);
    out.push(await probeGet(t, path, token));
  }
  return out;
}

/**
 * M96.F02 探针——method-通用包装。第一批（Tier A 只读）只走 GET，留 method 字段
 * 是为了 Phase 2 写端点不用改名。`method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"`
 * 后续在加写支持时一并实现分支。
 */
export type ProbeMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface ProbeRequestOptions {
  readonly method: ProbeMethod;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
}

async function probeWithToken(
  target: Target,
  method: ProbeMethod,
  path: string,
  token: string,
  body: unknown,
): Promise<Probe> {
  const http = client(target);
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  try {
    let res;
    switch (method) {
      case "GET":
        res = await getWithTimeoutRetry(http, path, { headers });
        break;
      case "DELETE":
        // 契约里有 @body 的 unlink（如 /api/param-interfaces/links）必须带 body——
        // 此前只传 headers，body 被丢弃：请求退化成幂等 no-op 假 204，
        // 真后端 @RequestBody 必填直接 400（REQ-2026-001 live 实证）
        res = await http.delete(path, { headers, data: body });
        break;
      case "POST":
        res = await http.post(path, body, { headers });
        break;
      case "PATCH":
        res = await http.patch(path, body, { headers });
        break;
      case "PUT":
        res = await http.put(path, body, { headers });
        break;
    }
    return { target: target.name, status: res.status, body: res.data };
  } catch (cause) {
    throw new UnreachableError(target.name, cause);
  }
}

/** 单目标探针（method-通用）。未传 token 时先 login。 */
export async function probeRequest(target: Target, opts: ProbeRequestOptions): Promise<Probe> {
  const token = opts.token ?? (await login(target));
  return probeWithToken(target, opts.method, opts.path, token, opts.body);
}

/** 对一组目标跑同一个请求（method-通用）。登录各自进行。 */
export async function probeAllRequest(
  targets: readonly Target[],
  opts: Omit<ProbeRequestOptions, "token">,
): Promise<Probe[]> {
  const out: Probe[] = [];
  for (const t of targets) {
    out.push(await probeRequest(t, opts));
  }
  return out;
}
