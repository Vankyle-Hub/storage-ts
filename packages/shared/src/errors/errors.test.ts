import { describe, it, expect } from "vitest";
import {
  BaseError,
  StorageError,
  StorageObjectNotFoundError,
  CapabilityNotSupportedError,
  MetadataError,
  MetadataNotFoundError,
  MetadataConflictError,
  ValidationError,
} from "@vankyle-hub/storage-shared";

describe("BaseError", () => {
  it("should set code and message", () => {
    const err = new BaseError("TEST_CODE", "test message");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err.name).toBe("BaseError");
    expect(err).toBeInstanceOf(Error);
  });

  it("should capture cause", () => {
    const cause = new Error("root");
    const err = new BaseError("TEST", "wrapped", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("StorageError", () => {
  it("should use STORAGE_ERROR code", () => {
    const err = new StorageError("something broke");
    expect(err.code).toBe("STORAGE_ERROR");
    expect(err.message).toBe("something broke");
    expect(err).toBeInstanceOf(BaseError);
  });
});

describe("StorageObjectNotFoundError", () => {
  it("should include bucket and objectKey", () => {
    const err = new StorageObjectNotFoundError("my-bucket", "path/to/file.txt");
    expect(err.code).toBe("STORAGE_OBJECT_NOT_FOUND");
    expect(err.bucket).toBe("my-bucket");
    expect(err.objectKey).toBe("path/to/file.txt");
    expect(err.message).toContain("my-bucket");
    expect(err.message).toContain("path/to/file.txt");
  });
});

describe("CapabilityNotSupportedError", () => {
  it("should include capability name", () => {
    const err = new CapabilityNotSupportedError("signedPartUrl");
    expect(err.code).toBe("CAPABILITY_NOT_SUPPORTED");
    expect(err.capability).toBe("signedPartUrl");
    expect(err.message).toContain("signedPartUrl");
  });
});

describe("MetadataError", () => {
  it("should use METADATA_ERROR code", () => {
    const err = new MetadataError("db failure");
    expect(err.code).toBe("METADATA_ERROR");
    expect(err.message).toBe("db failure");
  });
});

describe("MetadataNotFoundError", () => {
  it("should include entityType and entityId", () => {
    const err = new MetadataNotFoundError("Blob", "abc-123");
    expect(err.code).toBe("METADATA_NOT_FOUND");
    expect(err.entityType).toBe("Blob");
    expect(err.entityId).toBe("abc-123");
    expect(err.message).toContain("Blob");
    expect(err.message).toContain("abc-123");
  });
});

describe("MetadataConflictError", () => {
  it("should include entityType and entityId", () => {
    const err = new MetadataConflictError("File", "xyz");
    expect(err.code).toBe("METADATA_CONFLICT");
    expect(err.entityType).toBe("File");
    expect(err.entityId).toBe("xyz");
  });
});

describe("ValidationError", () => {
  it("should include field when provided", () => {
    const err = new ValidationError("invalid value", "email");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.field).toBe("email");
    expect(err.message).toBe("invalid value");
  });

  it("should work without field", () => {
    const err = new ValidationError("bad input");
    expect(err.field).toBeUndefined();
  });
});
