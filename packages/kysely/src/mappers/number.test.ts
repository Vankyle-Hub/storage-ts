import { describe, it, expect } from "vitest";
import { ensureNumber, ensureOptionalNumber } from "@/mappers/number";
import { uploadSessionRowToModel } from "@/mappers/upload-session-row.mapper";
import { blobRowToModel } from "@/mappers/blob-row.mapper";

describe("ensureNumber", () => {
  it("passes numbers through", () => {
    expect(ensureNumber(1024)).toBe(1024);
  });

  it("converts the strings the PostgreSQL driver returns for bigint", () => {
    expect(ensureNumber("1024")).toBe(1024);
    expect(ensureNumber("5368709120")).toBe(5 * 1024 ** 3);
  });

  it("converts bigint values", () => {
    expect(ensureNumber(5368709120n)).toBe(5368709120);
  });

  it("maps null to undefined for optional columns", () => {
    expect(ensureOptionalNumber(null)).toBeUndefined();
    expect(ensureOptionalNumber("0")).toBe(0);
  });
});

describe("row mappers with PostgreSQL-style bigint strings", () => {
  const now = new Date();

  it("maps upload_sessions.expected_size to a number", () => {
    const session = uploadSessionRowToModel({
      id: "s1",
      provider: "s3",
      bucket: "b",
      object_key: "k",
      mode: "single",
      status: "pending",
      file_name: null,
      mime_type: null,
      // Typed as number, but `pg` hands back a string at runtime.
      expected_size: "3" as unknown as number,
      expected_sha256: null,
      provider_upload_id: null,
      provider_session_data: null,
      created_by: null,
      owner_id: null,
      metadata: null,
      created_at: now,
      updated_at: now,
      expires_at: null,
      completed_at: null,
      aborted_at: null,
    });
    expect(session.expectedSize).toBe(3);
  });

  it("maps blobs.size to a number", () => {
    const blob = blobRowToModel({
      id: "b1",
      provider: "s3",
      bucket: "b",
      object_key: "k",
      size: "1024" as unknown as number,
      mime_type: null,
      sha256: null,
      etag: null,
      storage_class: null,
      status: "active",
      created_at: now,
      updated_at: now,
      deleted_at: null,
      metadata: null,
    });
    expect(blob.size).toBe(1024);
  });
});
