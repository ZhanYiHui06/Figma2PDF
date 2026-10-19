import { describe, expect, it } from "vitest";
import { sanitizeFileName, uniqueNames } from "../src/lib/filename";

describe("filename", () => {
  it("replaces illegal characters", () => {
    expect(sanitizeFileName("01 — 封面/正面: v2?")).toBe("01 — 封面_正面_ v2_");
    expect(sanitizeFileName("  ...  ")).toBe("Folio");
  });
  it("appends a counter to duplicates", () => {
    expect(uniqueNames(["封面", "目录", "封面", "封面"], ".pdf")).toEqual(["封面.pdf", "目录.pdf", "封面 (2).pdf", "封面 (3).pdf"]);
  });
});
