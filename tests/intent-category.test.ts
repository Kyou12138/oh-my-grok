/**
 * intent-gate.ts + category.ts dedicated suite (MAGI v0.23).
 */
import { describe, expect, it } from "vitest";
import {
  categoryBanner,
  detectCategory,
  type WorkCategory,
} from "../src/features/category.js";
import {
  detectIntent,
  intentBanner,
  type IntentMode,
} from "../src/features/intent-gate.js";

// ─── detectIntent ────────────────────────────────────────────────────

describe("detectIntent", () => {
  it("ultrawork / ulw / /ulw", () => {
    expect(detectIntent("please ultrawork this")).toBe("ultrawork");
    expect(detectIntent("ulw 重构登录")).toBe("ultrawork");
    expect(detectIntent("/ulw-loop ship")).toBe("ultrawork");
  });

  it("ulw-stop / ulw_foo 不误判 ultrawork (v0.23 对齐 detectRalph)", () => {
    expect(detectIntent("ulw-stop please")).toBeNull();
    expect(detectIntent("ulw_foo bar")).toBeNull();
  });

  it("hyperplan", () => {
    expect(detectIntent("run hyperplan on auth")).toBe("hyperplan");
    expect(detectIntent("/hyperplan")).toBe("hyperplan");
  });

  it("search before debug when both keywords", () => {
    expect(detectIntent("find where auth is")).toBe("search");
    expect(detectIntent("search for the bug in login")).toBe("search");
    expect(detectIntent("locate the config")).toBe("search");
  });

  it("debug beats analyze for fix/bug/error/failing", () => {
    expect(detectIntent("debug the failing test")).toBe("debug");
    expect(detectIntent("fix the bug in oauth")).toBe("debug");
    expect(detectIntent("error in stack trace")).toBe("debug");
  });

  it("analyze for investigate / root cause / why", () => {
    expect(detectIntent("investigate the auth flow")).toBe("analyze");
    expect(detectIntent("root cause of the race")).toBe("analyze");
    expect(detectIntent("why does this hang")).toBe("analyze");
  });

  it("team mode keywords", () => {
    expect(detectIntent("use team mode for this")).toBe("team");
    expect(detectIntent("spawn parallel agents please")).toBe("team");
  });

  it("Chinese intents", () => {
    expect(detectIntent("调试这个失败用例")).toBe("debug");
    expect(detectIntent("查找 auth 相关代码")).toBe("search");
    expect(detectIntent("分析根因")).toBe("analyze");
  });

  it("null for unrelated", () => {
    expect(detectIntent("hello")).toBeNull();
    expect(detectIntent("")).toBeNull();
  });
});

describe("intentBanner", () => {
  it("empty for null; wraps known modes", () => {
    expect(intentBanner(null)).toBe("");
    const modes: Exclude<IntentMode, null>[] = [
      "ultrawork",
      "search",
      "analyze",
      "hyperplan",
      "team",
      "debug",
    ];
    for (const m of modes) {
      const b = intentBanner(m);
      expect(b).toMatch(/OMG_INTENT_GATE/);
      expect(b).toMatch(new RegExp(m, "i"));
    }
  });
});

// ─── detectCategory ──────────────────────────────────────────────────

describe("detectCategory", () => {
  it("visual-engineering", () => {
    expect(detectCategory("redesign the dashboard UI with animations")).toBe(
      "visual-engineering",
    );
    expect(detectCategory("改一下按钮样式")).toBe("visual-engineering");
  });

  it("deep before ultrabrain when both match", () => {
    expect(detectCategory("deep dive into the auth architecture")).toBe("deep");
    expect(detectCategory("端到端自治实现登录")).toBe("deep");
  });

  it("ultrabrain architecture", () => {
    expect(detectCategory("system design for multi-tenant")).toBe("ultrabrain");
    expect(detectCategory("架构权衡分析")).toBe("ultrabrain");
  });

  it("artistry / quick / writing", () => {
    expect(detectCategory("creative brand aesthetic")).toBe("artistry");
    expect(detectCategory("fix typo in footer")).toBe("quick");
    expect(detectCategory("笔误 错别字")).toBe("quick");
    expect(detectCategory("update the README docs")).toBe("writing");
  });

  it("unspecified-high for implement/refactor", () => {
    expect(detectCategory("implement oauth feature")).toBe("unspecified-high");
    expect(detectCategory("重构支付模块")).toBe("unspecified-high");
  });

  it("unspecified-low for mild tweak/adjust (v0.23 激活死分类)", () => {
    expect(detectCategory("tweak the timeout value")).toBe("unspecified-low");
    expect(detectCategory("微调一下配置")).toBe("unspecified-low");
    expect(detectCategory("polish the copy slightly")).toBe("unspecified-low");
  });

  it("null empty / unmatched", () => {
    expect(detectCategory("")).toBeNull();
    expect(detectCategory("   ")).toBeNull();
    expect(detectCategory("hello world")).toBeNull();
  });
});

describe("categoryBanner", () => {
  it("empty for null; all categories have advice", () => {
    expect(categoryBanner(null)).toBe("");
    const cats: Exclude<WorkCategory, null>[] = [
      "visual-engineering",
      "ultrabrain",
      "deep",
      "artistry",
      "quick",
      "writing",
      "unspecified-high",
      "unspecified-low",
    ];
    for (const c of cats) {
      const b = categoryBanner(c);
      expect(b).toMatch(/OMG_CATEGORY/);
      expect(b).toContain(c);
    }
  });
});
