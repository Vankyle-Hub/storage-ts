import { describe, it, expect } from "vitest";
import { ensureDate } from "@/mappers/timestamp";
import { blobRowToModel } from "@/mappers/blob-row.mapper";

describe("ensureDate", () => {
  it("passes Date objects through (PostgreSQL / MySQL drivers)", () => {
    const date = new Date("2026-01-31T08:00:00.000Z");
    expect(ensureDate(date)).toBe(date);
  });

  it("parses the canonical ISO-8601 UTC text form", () => {
    expect(ensureDate("2026-01-31T08:00:00.123Z").toISOString()).toBe(
      "2026-01-31T08:00:00.123Z",
    );
  });

  it("honours an explicit offset", () => {
    expect(ensureDate("2026-01-31T16:00:00+08:00").toISOString()).toBe(
      "2026-01-31T08:00:00.000Z",
    );
  });

  // The process time zone must not matter: a zone-less value is UTC.
  it.each([
    ["2026-01-31 08:00:00", "2026-01-31T08:00:00.000Z"],
    ["2026-01-31 08:00:00.250", "2026-01-31T08:00:00.250Z"],
    ["2026-01-31T08:00:00", "2026-01-31T08:00:00.000Z"],
    ["2026-01-31 08:00", "2026-01-31T08:00:00.000Z"],
    ["  2026-01-31 08:00:00  ", "2026-01-31T08:00:00.000Z"],
  ])("reads zone-less %j as UTC", (input, expected) => {
    expect(ensureDate(input).toISOString()).toBe(expected);
  });
});

describe("row mappers", () => {
  it("map SQLite CURRENT_TIMESTAMP text to the right instant", () => {
    const blob = blobRowToModel({
      id: "b1",
      provider: "s3",
      bucket: "bucket",
      object_key: "key",
      size: 1,
      mime_type: null,
      sha256: null,
      etag: null,
      storage_class: null,
      status: "active",
      // Selectable<> types these as Date; SQLite hands back text at runtime.
      created_at: "2026-01-31 08:00:00" as unknown as Date,
      updated_at: "2026-01-31T08:00:00.000Z" as unknown as Date,
      deleted_at: null,
      metadata: null,
    });

    expect(blob.createdAt.toISOString()).toBe("2026-01-31T08:00:00.000Z");
    expect(blob.updatedAt.toISOString()).toBe("2026-01-31T08:00:00.000Z");
    expect(blob.deletedAt).toBeUndefined();
  });
});
