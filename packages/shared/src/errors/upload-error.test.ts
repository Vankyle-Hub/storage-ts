import { describe, it, expect } from "vitest";
import {
  BaseError,
  UploadSizeMismatchError,
  UploadEtagMismatchError,
} from "@vankyle/storage-shared";

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
