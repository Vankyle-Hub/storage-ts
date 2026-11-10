import { describe, it, expect } from "vitest";
import {
  BaseError,
  UploadSessionStateError,
  UploadSessionExpiredError,
  UploadSizeMismatchError,
  UploadEtagMismatchError,
} from "@vankyle/storage-shared";

describe("UploadSessionStateError", () => {
  it("carries sessionId, status and operation", () => {
    const cause = new Error("root");
    const err = new UploadSessionStateError("session-1", "completed", "registerPart", { cause });
    expect(err).toBeInstanceOf(BaseError);
    expect(err.name).toBe("UploadSessionStateError");
    expect(err.code).toBe("UPLOAD_SESSION_INVALID_STATE");
    expect(err.sessionId).toBe("session-1");
    expect(err.status).toBe("completed");
    expect(err.operation).toBe("registerPart");
    expect(err.message).toContain("session-1");
    expect(err.message).toContain("completed");
    expect(err.cause).toBe(cause);
  });
});

describe("UploadSessionExpiredError", () => {
  it("carries sessionId and expiresAt", () => {
    const expiresAt = new Date("2026-01-31T08:00:00.000Z");
    const err = new UploadSessionExpiredError("session-1", expiresAt);
    expect(err).toBeInstanceOf(BaseError);
    expect(err.name).toBe("UploadSessionExpiredError");
    expect(err.code).toBe("UPLOAD_SESSION_EXPIRED");
    expect(err.sessionId).toBe("session-1");
    expect(err.expiresAt).toBe(expiresAt);
    expect(err.message).toContain("2026-01-31T08:00:00.000Z");
  });
});

describe("UploadSizeMismatchError", () => {
  it("carries sessionId, expected and actual", () => {
    const err = new UploadSizeMismatchError("session-1", 1024, 512);
    expect(err).toBeInstanceOf(BaseError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UploadSizeMismatchError");
    expect(err.code).toBe("UPLOAD_SIZE_MISMATCH");
    expect(err.sessionId).toBe("session-1");
    expect(err.expected).toBe(1024);
    expect(err.actual).toBe(512);
  });

  it("keeps the message used before the error was typed", () => {
    const err = new UploadSizeMismatchError("session-1", 1024, 512);
    expect(err.message).toBe("Uploaded size mismatch: expected 1024, got 512");
  });

  it("allows an unknown actual size and a cause", () => {
    const cause = new Error("root");
    const err = new UploadSizeMismatchError("session-1", 1024, undefined, { cause });
    expect(err.actual).toBeUndefined();
    expect(err.cause).toBe(cause);
  });
});

describe("UploadEtagMismatchError", () => {
  it("carries sessionId, expected and actual", () => {
    const err = new UploadEtagMismatchError("session-1", '"aaa"', '"bbb"');
    expect(err).toBeInstanceOf(BaseError);
    expect(err.name).toBe("UploadEtagMismatchError");
    expect(err.code).toBe("UPLOAD_ETAG_MISMATCH");
    expect(err.sessionId).toBe("session-1");
    expect(err.expected).toBe('"aaa"');
    expect(err.actual).toBe('"bbb"');
    expect(err.message).toBe('Uploaded ETag mismatch: expected "aaa", got "bbb"');
  });

  it("allows an unknown actual ETag", () => {
    const err = new UploadEtagMismatchError("session-1", '"aaa"', undefined);
    expect(err.actual).toBeUndefined();
  });
});
