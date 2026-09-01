import { describe, it, expect } from "vitest";
import { diffLines } from "./helpers";

describe("diffLines", () => {
  it("marks every line 'same' for identical text", () => {
    const diff = diffLines("a\nb\nc", "a\nb\nc");
    expect(diff).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  it("marks an appended line as 'add'", () => {
    const diff = diffLines("a\nb", "a\nb\nc");
    expect(diff).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
      { type: "add", text: "c" },
    ]);
  });

  it("marks a removed line as 'del'", () => {
    const diff = diffLines("a\nb\nc", "a\nc");
    expect(diff).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  it("pairs a replaced line as del + add", () => {
    const diff = diffLines("# v1\nRule one", "# v1\nRule two");
    expect(diff).toEqual([
      { type: "same", text: "# v1" },
      { type: "del", text: "Rule one" },
      { type: "add", text: "Rule two" },
    ]);
  });

  it("handles an empty previous body as all-add", () => {
    expect(diffLines("", "a")).toEqual([
      { type: "del", text: "" },
      { type: "add", text: "a" },
    ]);
  });
});
