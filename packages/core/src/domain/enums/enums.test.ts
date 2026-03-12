import { describe, it, expect } from "vitest";
import {
  StorageProvider,
  UploadMode,
  UploadSessionStatus,
  BlobStatus,
  FileStatus,
} from "@vankyle-hub/storage-core";

describe("StorageProvider enum", () => {
  it("should have S3 value", () => {
    expect(StorageProvider.S3).toBe("s3");
  });

  it("should have AzureBlob value", () => {
    expect(StorageProvider.AzureBlob).toBe("azure-blob");
  });

  it("should have R2Binding value", () => {
    expect(StorageProvider.R2Binding).toBe("r2-binding");
  });

  it("should have exactly 3 providers", () => {
    expect(Object.keys(StorageProvider)).toHaveLength(3);
  });
});

describe("UploadMode enum", () => {
  it("should have Single value", () => {
    expect(UploadMode.Single).toBe("single");
  });

  it("should have Multipart value", () => {
    expect(UploadMode.Multipart).toBe("multipart");
  });

  it("should have exactly 2 modes", () => {
    expect(Object.keys(UploadMode)).toHaveLength(2);
  });
});

describe("UploadSessionStatus enum", () => {
  it("should have all statuses", () => {
    expect(UploadSessionStatus.Pending).toBe("pending");
    expect(UploadSessionStatus.InProgress).toBe("in-progress");
    expect(UploadSessionStatus.Completed).toBe("completed");
    expect(UploadSessionStatus.Aborted).toBe("aborted");
  });

  it("should have exactly 4 statuses", () => {
    expect(Object.keys(UploadSessionStatus)).toHaveLength(4);
  });
});

describe("BlobStatus enum", () => {
  it("should have all statuses", () => {
    expect(BlobStatus.Active).toBe("active");
    expect(BlobStatus.Orphaned).toBe("orphaned");
    expect(BlobStatus.PendingDeletion).toBe("pending-deletion");
    expect(BlobStatus.Deleted).toBe("deleted");
  });

  it("should have exactly 4 statuses", () => {
    expect(Object.keys(BlobStatus)).toHaveLength(4);
  });
});

describe("FileStatus enum", () => {
  it("should have all statuses", () => {
    expect(FileStatus.Active).toBe("active");
    expect(FileStatus.Deleted).toBe("deleted");
  });

  it("should have exactly 2 statuses", () => {
    expect(Object.keys(FileStatus)).toHaveLength(2);
  });
});
