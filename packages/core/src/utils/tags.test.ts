import { describe, expect, it } from "vitest";
import { normalizeTagName } from "@vankyle/storage-core";

describe("normalizeTagName", () => {
  it("should trim surrounding whitespace and lowercase", () => {
    expect(normalizeTagName("  Important  ")).toBe("important");
  });
});
