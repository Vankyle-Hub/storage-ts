import { describe, it, expect, vi, afterEach } from "vitest";
import { assert, assertNever, getRequiredEnv, getOptionalEnv } from "@vankyle-hub/storage-shared";

describe("assert", () => {
  it("should not throw when condition is truthy", () => {
    expect(() => assert(true)).not.toThrow();
    expect(() => assert(1)).not.toThrow();
    expect(() => assert("non-empty")).not.toThrow();
  });

  it("should throw when condition is falsy", () => {
    expect(() => assert(false)).toThrow("Assertion failed");
    expect(() => assert(null)).toThrow();
    expect(() => assert(0)).toThrow();
    expect(() => assert("")).toThrow();
  });

  it("should use custom message", () => {
    expect(() => assert(false, "custom message")).toThrow("custom message");
  });
});

describe("assertNever", () => {
  it("should throw with value description", () => {
    expect(() => assertNever("oops" as never)).toThrow("Unexpected value: oops");
  });

  it("should use custom message", () => {
    expect(() => assertNever("x" as never, "custom")).toThrow("custom");
  });
});

describe("getRequiredEnv", () => {
  afterEach(() => {
    delete process.env["TEST_REQUIRED_VAR"];
  });

  it("should return env value when set", () => {
    process.env["TEST_REQUIRED_VAR"] = "hello";
    expect(getRequiredEnv("TEST_REQUIRED_VAR")).toBe("hello");
  });

  it("should throw when env is not set", () => {
    expect(() => getRequiredEnv("TEST_REQUIRED_VAR")).toThrow();
  });

  it("should throw when env is empty string", () => {
    process.env["TEST_REQUIRED_VAR"] = "";
    expect(() => getRequiredEnv("TEST_REQUIRED_VAR")).toThrow();
  });
});

describe("getOptionalEnv", () => {
  afterEach(() => {
    delete process.env["TEST_OPT_VAR"];
  });

  it("should return env value when set", () => {
    process.env["TEST_OPT_VAR"] = "world";
    expect(getOptionalEnv("TEST_OPT_VAR")).toBe("world");
  });

  it("should return undefined when not set and no fallback", () => {
    expect(getOptionalEnv("TEST_OPT_VAR")).toBeUndefined();
  });

  it("should return fallback when not set", () => {
    expect(getOptionalEnv("TEST_OPT_VAR", "default")).toBe("default");
  });
});
