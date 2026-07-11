import { describe, expect, it } from "vitest";
import { parseHookInput } from "../src/protocol/parse.js";

describe("parseHookInput", () => {
  it("normalizes session and tool fields", () => {
    const input = parseHookInput("pre-tool-use", {
      session_id: "s1",
      cwd: "D:/proj",
      tool_name: "Write",
      tool_input: { file_path: "a.ts" },
    });
    expect(input.sessionId).toBe("s1");
    expect(input.toolName).toBe("Write");
    expect(input.toolInput?.file_path).toBe("a.ts");
    expect(input.cwd).toBe("D:/proj");
  });

  it("parses string tool_input JSON", () => {
    const input = parseHookInput("post-tool-read", {
      sessionId: "x",
      toolName: "Read",
      toolInput: JSON.stringify({ path: "SKILL.md" }),
    });
    expect(input.toolInput?.path).toBe("SKILL.md");
  });
});
