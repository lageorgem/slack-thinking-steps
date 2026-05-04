import { describe, it, expect } from "vitest";
import {
  extractReasoningBlocks,
  summarizeReasoning,
  transformContent,
} from "./reasoning.js";

describe("extractReasoningBlocks", () => {
  it("extracts <think> blocks", () => {
    const content = "Hello <think>I need to consider this</think> world";
    const blocks = extractReasoningBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("I need to consider this");
    expect(blocks[0].fullMatch).toBe(
      "<think>I need to consider this</think>",
    );
  });

  it("extracts <reasoning> blocks", () => {
    const content = "<reasoning>Step 1: analyze\nStep 2: conclude</reasoning>\n\nThe answer is 42.";
    const blocks = extractReasoningBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("Step 1: analyze\nStep 2: conclude");
  });

  it("extracts <antThinking> blocks", () => {
    const content = "<antThinking>Let me think about this carefully...</antThinking>\n\nHere is my response.";
    const blocks = extractReasoningBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe(
      "Let me think about this carefully...",
    );
  });

  it("extracts multiple blocks in order", () => {
    const content = "<think>First thought</think> middle <think>Second thought</think>";
    const blocks = extractReasoningBlocks(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toBe("First thought");
    expect(blocks[1].content).toBe("Second thought");
    expect(blocks[0].startIndex).toBeLessThan(blocks[1].startIndex);
  });

  it("handles mixed tag types", () => {
    const content = "<think>Thought</think> and <reasoning>Reason</reasoning>";
    const blocks = extractReasoningBlocks(content);

    expect(blocks).toHaveLength(2);
  });

  it("returns empty array when no reasoning found", () => {
    const content = "Just a normal message with no thinking blocks.";
    const blocks = extractReasoningBlocks(content);

    expect(blocks).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const content = "<THINK>Uppercase tags</THINK>";
    const blocks = extractReasoningBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe("Uppercase tags");
  });

  it("supports custom patterns", () => {
    const content = "---reasoning---\nMy thoughts\n---/reasoning---";
    const blocks = extractReasoningBlocks(content, [
      "---reasoning---[\\s\\S]*?---/reasoning---",
    ]);

    expect(blocks).toHaveLength(1);
  });
});

describe("summarizeReasoning", () => {
  it("returns full text when under max length", () => {
    const text = "Short reasoning";
    expect(summarizeReasoning(text, 150)).toBe("Short reasoning");
  });

  it("truncates at word boundary", () => {
    const text = "This is a longer reasoning that should be truncated at a word boundary for readability";
    const result = summarizeReasoning(text, 40);

    expect(result.length).toBeLessThanOrEqual(44); // 40 + "..."
    expect(result).toEndWith("...");
    expect(result).not.toMatch(/\s\.\.\.$/); // no trailing space before ...
  });

  it("collapses whitespace", () => {
    const text = "Line one\n\n  Line two\n\t\tLine three";
    const result = summarizeReasoning(text, 500);

    expect(result).toBe("Line one Line two Line three");
  });
});

describe("transformContent", () => {
  const sampleMessage =
    "<think>Let me analyze the user's question about TypeScript generics.\n\nThey seem to want a mapped type that preserves optionality.</think>\n\nHere's how you can create a mapped type that preserves optionality:\n\n```typescript\ntype Preserved<T> = { [K in keyof T]: T[K] };\n```";

  it("mode=inline returns content unchanged", () => {
    const result = transformContent(sampleMessage, "inline");

    expect(result.content).toBe(sampleMessage);
    expect(result.hasReasoning).toBe(true);
    expect(result.blocks).toHaveLength(1);
  });

  it("mode=hidden strips reasoning blocks entirely", () => {
    const result = transformContent(sampleMessage, "hidden");

    expect(result.content).not.toContain("<think>");
    expect(result.content).not.toContain("analyze the user");
    expect(result.content).toContain("mapped type that preserves optionality");
    expect(result.hasReasoning).toBe(true);
  });

  it("mode=collapsed replaces blocks with summary indicator", () => {
    const result = transformContent(sampleMessage, "collapsed");

    expect(result.content).not.toContain("<think>");
    expect(result.content).toMatch(/^> _Thinking:_/);
    expect(result.content).toContain("mapped type that preserves optionality");
    expect(result.hasReasoning).toBe(true);
  });

  it("mode=collapsed with showSummary=false shows label only", () => {
    const result = transformContent(sampleMessage, "collapsed", {
      showSummary: false,
    });

    expect(result.content).toMatch(/^> _Thinking_/);
    expect(result.content).not.toContain("analyze");
  });

  it("custom collapsedLabel", () => {
    const result = transformContent(sampleMessage, "collapsed", {
      collapsedLabel: "Reasoning",
      showSummary: false,
    });

    expect(result.content).toMatch(/> _Reasoning_/);
  });

  it("returns hasReasoning=false when no blocks found", () => {
    const result = transformContent("No reasoning here", "collapsed");

    expect(result.hasReasoning).toBe(false);
    expect(result.content).toBe("No reasoning here");
  });

  it("handles multiple reasoning blocks", () => {
    const multi =
      "<think>First thought</think>\nSome text\n<think>Second thought</think>\nFinal answer";
    const result = transformContent(multi, "hidden");

    expect(result.content).toBe("Some text\n\nFinal answer");
    expect(result.blocks).toHaveLength(2);
  });

  it("does not leave excessive whitespace after removal", () => {
    const content = "\n\n<think>Reasoning</think>\n\n\n\nAnswer here";
    const result = transformContent(content, "hidden");

    expect(result.content).not.toMatch(/\n{3,}/);
  });
});
