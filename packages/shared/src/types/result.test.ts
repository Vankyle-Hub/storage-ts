import { describe, it, expect } from "vitest";
import { ok, err } from "@vankyle-hub/storage-shared";
import type { Result } from "@vankyle-hub/storage-shared";

describe("Result type", () => {
  it("ok() should create a success result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("err() should create a failure result", () => {
    const result = err("something went wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("something went wrong");
    }
  });

  it("should work with complex types", () => {
    const success: Result<{ id: string }, Error> = ok({ id: "abc" });
    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.value.id).toBe("abc");
    }

    const failure: Result<{ id: string }, Error> = err(new Error("fail"));
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.message).toBe("fail");
    }
  });
});
