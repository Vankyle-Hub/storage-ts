import { describe, it, expect } from "vitest";
import {
  blobSchema,
  uploadSessionSchema,
  uploadedPartSchema,
  fileSchema,
  fileVersionSchema,
  blobReferenceSchema,
} from "@vankyle-hub/storage-core";

describe("blobSchema", () => {
  const validBlob = {
    id: "blob-1",
    provider: "s3",
    bucket: "my-bucket",
    objectKey: "path/to/obj",
    size: 1024,
    status: "active",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };

  it("should accept valid blob data", () => {
    const result = blobSchema.safeParse(validBlob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("blob-1");
      expect(result.data.provider).toBe("s3");
      expect(result.data.size).toBe(1024);
      expect(result.data.status).toBe("active");
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });

  it("should accept all providers", () => {
    for (const provider of ["s3", "azure-blob", "r2-binding"]) {
      const result = blobSchema.safeParse({ ...validBlob, provider });
      expect(result.success).toBe(true);
    }
  });

  it("should accept all statuses", () => {
    for (const status of ["active", "orphaned", "pending-deletion", "deleted"]) {
      const result = blobSchema.safeParse({ ...validBlob, status });
      expect(result.success).toBe(true);
    }
  });

  it("should reject negative size", () => {
    const result = blobSchema.safeParse({ ...validBlob, size: -1 });
    expect(result.success).toBe(false);
  });

  it("should reject invalid provider", () => {
    const result = blobSchema.safeParse({ ...validBlob, provider: "gcs" });
    expect(result.success).toBe(false);
  });

  it("should accept optional fields", () => {
    const result = blobSchema.safeParse({
      ...validBlob,
      mimeType: "image/png",
      sha256: "abc123",
      etag: "\"etag\"",
      storageClass: "STANDARD",
      deletedAt: "2025-06-01T00:00:00Z",
      metadata: { key: "value" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mimeType).toBe("image/png");
      expect(result.data.deletedAt).toBeInstanceOf(Date);
    }
  });

  it("should coerce string dates to Date objects", () => {
    const result = blobSchema.safeParse(validBlob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
      expect(result.data.updatedAt).toBeInstanceOf(Date);
    }
  });
});

describe("uploadSessionSchema", () => {
  const validSession = {
    id: "session-1",
    provider: "s3",
    bucket: "my-bucket",
    objectKey: "uploads/file.txt",
    mode: "multipart",
    status: "pending",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };

  it("should accept valid session data", () => {
    const result = uploadSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("multipart");
      expect(result.data.status).toBe("pending");
    }
  });

  it("should accept all modes", () => {
    for (const mode of ["single", "multipart"]) {
      const result = uploadSessionSchema.safeParse({ ...validSession, mode });
      expect(result.success).toBe(true);
    }
  });

  it("should accept all statuses", () => {
    for (const status of ["pending", "in-progress", "completed", "aborted"]) {
      const result = uploadSessionSchema.safeParse({ ...validSession, status });
      expect(result.success).toBe(true);
    }
  });

  it("should accept optional fields", () => {
    const result = uploadSessionSchema.safeParse({
      ...validSession,
      fileName: "document.pdf",
      mimeType: "application/pdf",
      expectedSize: 4096,
      expectedSha256: "sha256hash",
      providerUploadId: "upload-xyz",
      providerSessionData: { key: "val" },
      createdBy: "user-1",
      ownerId: "owner-1",
      metadata: { tag: "important" },
      expiresAt: "2025-12-31T23:59:59Z",
      completedAt: "2025-06-01T00:00:00Z",
      abortedAt: "2025-06-02T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid mode", () => {
    const result = uploadSessionSchema.safeParse({ ...validSession, mode: "chunked" });
    expect(result.success).toBe(false);
  });

  it("should reject negative expectedSize", () => {
    const result = uploadSessionSchema.safeParse({ ...validSession, expectedSize: -10 });
    expect(result.success).toBe(false);
  });
});

describe("uploadedPartSchema", () => {
  const validPart = {
    id: "part-1",
    sessionId: "session-1",
    partNumber: 1,
    size: 5242880,
    uploadedAt: "2025-01-01T00:00:00Z",
  };

  it("should accept valid part data", () => {
    const result = uploadedPartSchema.safeParse(validPart);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.partNumber).toBe(1);
      expect(result.data.size).toBe(5242880);
    }
  });

  it("should reject zero partNumber", () => {
    const result = uploadedPartSchema.safeParse({ ...validPart, partNumber: 0 });
    expect(result.success).toBe(false);
  });

  it("should reject negative partNumber", () => {
    const result = uploadedPartSchema.safeParse({ ...validPart, partNumber: -1 });
    expect(result.success).toBe(false);
  });

  it("should accept optional fields", () => {
    const result = uploadedPartSchema.safeParse({
      ...validPart,
      etag: "\"etag-value\"",
      checksumSha256: "checksum",
      providerPartId: "part-abc",
      providerPartData: { custom: "data" },
    });
    expect(result.success).toBe(true);
  });
});

describe("fileSchema", () => {
  const validFile = {
    id: "file-1",
    displayName: "report.pdf",
    status: "active",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };

  it("should accept valid file data", () => {
    const result = fileSchema.safeParse(validFile);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("report.pdf");
      expect(result.data.status).toBe("active");
    }
  });

  it("should reject empty displayName", () => {
    const result = fileSchema.safeParse({ ...validFile, displayName: "" });
    expect(result.success).toBe(false);
  });

  it("should accept all statuses", () => {
    for (const status of ["active", "deleted"]) {
      const result = fileSchema.safeParse({ ...validFile, status });
      expect(result.success).toBe(true);
    }
  });

  it("should accept optional fields", () => {
    const result = fileSchema.safeParse({
      ...validFile,
      ownerId: "owner-1",
      mimeType: "application/pdf",
      currentVersionId: "version-1",
      size: 2048,
      parentId: "folder-1",
      deletedAt: "2025-06-01T00:00:00Z",
      metadata: { label: "test" },
    });
    expect(result.success).toBe(true);
  });

  it("should reject negative size", () => {
    const result = fileSchema.safeParse({ ...validFile, size: -5 });
    expect(result.success).toBe(false);
  });
});

describe("fileVersionSchema", () => {
  const validVersion = {
    id: "version-1",
    fileId: "file-1",
    blobId: "blob-1",
    version: 1,
    size: 1024,
    createdAt: "2025-01-01T00:00:00Z",
  };

  it("should accept valid version data", () => {
    const result = fileVersionSchema.safeParse(validVersion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.size).toBe(1024);
    }
  });

  it("should reject zero version", () => {
    const result = fileVersionSchema.safeParse({ ...validVersion, version: 0 });
    expect(result.success).toBe(false);
  });

  it("should reject negative version", () => {
    const result = fileVersionSchema.safeParse({ ...validVersion, version: -1 });
    expect(result.success).toBe(false);
  });

  it("should accept optional fields", () => {
    const result = fileVersionSchema.safeParse({
      ...validVersion,
      mimeType: "text/plain",
      sha256: "hash",
      createdBy: "user-1",
      metadata: { note: "v1" },
    });
    expect(result.success).toBe(true);
  });
});

describe("blobReferenceSchema", () => {
  const validRef = {
    id: "ref-1",
    blobId: "blob-1",
    refType: "file-version",
    refId: "version-1",
    createdAt: "2025-01-01T00:00:00Z",
  };

  it("should accept valid reference data", () => {
    const result = blobReferenceSchema.safeParse(validRef);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.refType).toBe("file-version");
      expect(result.data.refId).toBe("version-1");
    }
  });

  it("should reject empty refType", () => {
    const result = blobReferenceSchema.safeParse({ ...validRef, refType: "" });
    expect(result.success).toBe(false);
  });

  it("should reject empty refId", () => {
    const result = blobReferenceSchema.safeParse({ ...validRef, refId: "" });
    expect(result.success).toBe(false);
  });

  it("should coerce date strings", () => {
    const result = blobReferenceSchema.safeParse(validRef);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });
});
