import { describe, it, expect } from "vitest";
import { lineDiff } from "./helpers";

describe("lineDiff", () => {
  it("returns all context lines for identical text", () => {
    const diff = lineDiff("a\nb\nc", "a\nb\nc");
    expect(diff).toEqual([
      { type: "context", text: "a" },
      { type: "context", text: "b" },
      { type: "context", text: "c" },
    ]);
  });

  it("marks an added line", () => {
    const diff = lineDiff("a\nc", "a\nb\nc");
    expect(diff).toEqual([
      { type: "context", text: "a" },
      { type: "add", text: "b" },
      { type: "context", text: "c" },
    ]);
  });

  it("marks a removed line", () => {
    const diff = lineDiff("a\nb\nc", "a\nc");
    expect(diff).toEqual([
      { type: "context", text: "a" },
      { type: "remove", text: "b" },
      { type: "context", text: "c" },
    ]);
  });

  it("marks a changed line as a remove + add pair", () => {
    const diff = lineDiff("a\nold\nc", "a\nnew\nc");
    expect(diff).toEqual([
      { type: "context", text: "a" },
      { type: "remove", text: "old" },
      { type: "add", text: "new" },
      { type: "context", text: "c" },
    ]);
  });

  it("handles a fully-added text (empty old)", () => {
    expect(lineDiff("", "a\nb")).toEqual([
      { type: "remove", text: "" },
      { type: "add", text: "a" },
      { type: "add", text: "b" },
    ]);
  });

  it("handles a fully-removed text (empty new)", () => {
    expect(lineDiff("a\nb", "")).toEqual([
      { type: "remove", text: "a" },
      { type: "remove", text: "b" },
      { type: "add", text: "" },
    ]);
  });
});
