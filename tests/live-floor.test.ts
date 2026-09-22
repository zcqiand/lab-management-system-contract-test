// tests/live-floor.test.ts
// ADR-0040 live 执行面 side channel 单测（spec §2/§3，unit 层，无真后端）。
// 直接读写真实 .state/live-exec.jsonl（gitignore 内），afterEach 必清。
import { appendFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { deleteLiveExecLog, readLiveExecGroups, resetLiveExecLog } from "../src/live-floor.js";

afterEach(() => {
  resetLiveExecLog();
});

describe("readLiveExecGroups（jsonl 合并）", () => {
  it("文件缺失 → null（mode=live 时由调用方译为 side channel 故障）", () => {
    resetLiveExecLog();
    expect(readLiveExecGroups()).toBeNull();
  });

  it("按 suite 分组 distinct target；多行同 suite 去重", () => {
    mkdirSync(".state", { recursive: true });
    writeFileSync(
      ".state/live-exec.jsonl",
      [
        JSON.stringify({ suite: "A 比对", target: "nextjs", status: 200 }),
        JSON.stringify({ suite: "A 比对", target: "springboot", status: 404 }),
        JSON.stringify({ suite: "A 比对", target: "nextjs", status: 200 }),
        JSON.stringify({ suite: "B 写路径", target: "aspnetcore", status: 201 }),
        "",
      ].join("\n"),
      "utf-8",
    );
    const groups = readLiveExecGroups()!;
    expect(groups.get("A 比对")).toEqual(new Set(["nextjs", "springboot"]));
    expect(groups.get("B 写路径")).toEqual(new Set(["aspnetcore"]));
  });

  it("空文件（存在但零记录）→ 空 Map（mode=live 时译为全塌缩）", () => {
    mkdirSync(".state", { recursive: true });
    writeFileSync(".state/live-exec.jsonl", "", "utf-8");
    const groups = readLiveExecGroups()!;
    expect(groups.size).toBe(0);
  });

  it("单行损坏跳过，不毒化整批", () => {
    mkdirSync(".state", { recursive: true });
    appendFileSync(
      ".state/live-exec.jsonl",
      "{broken json\n" + JSON.stringify({ suite: "A", target: "nextjs", status: 200 }) + "\n",
      "utf-8",
    );
    const groups = readLiveExecGroups()!;
    expect(groups.get("A")).toEqual(new Set(["nextjs"]));
  });
});

describe("deleteLiveExecLog", () => {
  it("删后 readLiveExecGroups 回 null；文件不存在也不抛", () => {
    mkdirSync(".state", { recursive: true });
    writeFileSync(".state/live-exec.jsonl", "{}\n", "utf-8");
    deleteLiveExecLog();
    expect(readLiveExecGroups()).toBeNull();
    expect(() => deleteLiveExecLog()).not.toThrow();
  });
});
