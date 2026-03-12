import { describe, it, expect, vi } from "vitest";
import { DefaultObjectKeyPolicy } from "@vankyle-hub/storage-core";

describe("DefaultObjectKeyPolicy", () => {
  const policy = new DefaultObjectKeyPolicy();

  it("should generate a key with just an id when no inputs provided", () => {
    const key = policy.generate({});
    // Should be a UUID (36 chars)
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("should include prefix when provided", () => {
    const key = policy.generate({ prefix: "uploads" });
    expect(key).toMatch(/^uploads\//);
  });

  it("should strip trailing slashes from prefix", () => {
    const key = policy.generate({ prefix: "uploads///" });
    expect(key).toMatch(/^uploads\//);
    expect(key).not.toContain("///");
  });

  it("should include ownerId when provided", () => {
    const key = policy.generate({ ownerId: "user-123" });
    expect(key).toContain("user-123/");
  });

  it("should include file extension from fileName", () => {
    const key = policy.generate({ fileName: "document.pdf" });
    expect(key).toMatch(/\.pdf$/);
  });

  it("should lowercase the extension", () => {
    const key = policy.generate({ fileName: "image.PNG" });
    expect(key).toMatch(/\.png$/);
  });

  it("should handle files without extension", () => {
    const key = policy.generate({ fileName: "Makefile" });
    // No dot extension, should just be the UUID
    expect(key).not.toContain(".");
  });

  it("should combine prefix, ownerId, and extension", () => {
    const key = policy.generate({
      prefix: "files",
      ownerId: "user-1",
      fileName: "photo.jpg",
    });

    const segments = key.split("/");
    expect(segments[0]).toBe("files");
    expect(segments[1]).toBe("user-1");
    expect(segments[2]).toMatch(/\.jpg$/);
  });

  it("should generate unique keys on each call", () => {
    const key1 = policy.generate({ fileName: "test.txt" });
    const key2 = policy.generate({ fileName: "test.txt" });
    expect(key1).not.toBe(key2);
  });
});
