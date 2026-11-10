import { describe, it, expect, vi } from "vitest";
import {
  DefaultStorageService,
  StorageProvider,
  UploadMode,
  UploadSessionStatus,
} from "@vankyle/storage-core";
import type {
  HeadObjectResult,
  IStorage,
  IMetadataStore,
  UploadSession,
} from "@vankyle/storage-core";
import {
  UploadEtagMismatchError,
  UploadSizeMismatchError,
} from "@vankyle/storage-shared";

// completeUploadSession verifies the stored object against the expectedSize
// of the session and the etag passed by the caller, and reports failures as
// typed errors.

function makeSession(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    id: "session-1",
    provider: StorageProvider.S3,
    bucket: "test-bucket",
    objectKey: "uploads/obj-key",
    mode: UploadMode.Single,
    status: UploadSessionStatus.InProgress,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(session: UploadSession, head: HeadObjectResult) {
  const storage = {
    provider: StorageProvider.S3,
    capabilities: {
      multipartUpload: true,
      signedReadUrl: false,
      signedPutUrl: false,
      signedPartUrl: false,
    },
    putObject: vi.fn(),
    getObject: vi.fn(),
    headObject: vi.fn().mockResolvedValue(head),
    deleteObject: vi.fn(),
    initUploadSession: vi.fn(),
    uploadPart: vi.fn(),
    completeUploadSession: vi.fn().mockResolvedValue({ etag: head.etag }),
    abortUploadSession: vi.fn(),
  } satisfies IStorage;

  const metadata = {
    uploads: {
      createSession: vi.fn(),
      getSession: vi.fn().mockResolvedValue(session),
      updateSession: vi.fn().mockImplementation(async (_id, input) => ({
        ...session,
        ...input,
      })),
      addPart: vi.fn(),
      getPart: vi.fn(),
      listParts: vi.fn().mockResolvedValue([]),
    },
    blobs: {
      createBlob: vi.fn().mockImplementation(async (input) => ({
        ...input,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      getBlob: vi.fn(),
      updateBlob: vi.fn(),
      findBlobBySha256: vi.fn(),
      findBlobByLocator: vi.fn(),
      createReference: vi.fn(),
      listReferences: vi.fn().mockResolvedValue([]),
      deleteReference: vi.fn(),
    },
    files: {
      createFile: vi.fn(),
      getFile: vi.fn(),
      updateFile: vi.fn(),
      createVersion: vi.fn(),
      getVersion: vi.fn(),
      listVersions: vi.fn().mockResolvedValue([]),
      getLatestVersion: vi.fn(),
    },
    tags: {
      createTag: vi.fn(),
      getTag: vi.fn(),
      getTagByName: vi.fn(),
      listTags: vi.fn().mockResolvedValue([]),
      deleteTag: vi.fn(),
      addTagToFile: vi.fn(),
      removeTagFromFile: vi.fn(),
      listTagsForFile: vi.fn().mockResolvedValue([]),
      listFilesByTag: vi.fn().mockResolvedValue([]),
    },
  } satisfies IMetadataStore;

  const service = new DefaultStorageService({
    storage,
    metadata,
    bucket: "test-bucket",
  });

  return { service, storage, metadata };
}

function expectNoMetadataWrites(metadata: ReturnType<typeof setup>["metadata"]) {
  expect(metadata.uploads.updateSession).not.toHaveBeenCalled();
  expect(metadata.blobs.createBlob).not.toHaveBeenCalled();
  expect(metadata.files.createFile).not.toHaveBeenCalled();
  expect(metadata.files.createVersion).not.toHaveBeenCalled();
}

describe("DefaultStorageService.completeUploadSession verification errors", () => {
  it("throws UploadSizeMismatchError with expected and actual sizes", async () => {
    const { service, metadata } = setup(makeSession({ expectedSize: 1024 }), {
      contentLength: 512,
      etag: '"abc"',
    });

    const error = await service
      .completeUploadSession({ sessionId: "session-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadSizeMismatchError);
    const mismatch = error as UploadSizeMismatchError;
    expect(mismatch.code).toBe("UPLOAD_SIZE_MISMATCH");
    expect(mismatch.sessionId).toBe("session-1");
    expect(mismatch.expected).toBe(1024);
    expect(mismatch.actual).toBe(512);
    expectNoMetadataWrites(metadata);
  });

  it("reports an undefined actual size when the provider returns none", async () => {
    const { service } = setup(makeSession({ expectedSize: 1024 }), {
      etag: '"abc"',
    });

    const error = await service
      .completeUploadSession({ sessionId: "session-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadSizeMismatchError);
    expect((error as UploadSizeMismatchError).actual).toBeUndefined();
  });

  it("treats an expectedSize of 0 as a real expectation", async () => {
    const { service } = setup(makeSession({ expectedSize: 0 }), {
      contentLength: 5,
    });

    await expect(
      service.completeUploadSession({ sessionId: "session-1" }),
    ).rejects.toThrow(UploadSizeMismatchError);
  });

  it("throws UploadEtagMismatchError with expected and actual ETags", async () => {
    const { service, metadata } = setup(makeSession(), {
      contentLength: 1024,
      etag: '"stored"',
    });

    const error = await service
      .completeUploadSession({ sessionId: "session-1", etag: '"claimed"' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadEtagMismatchError);
    const mismatch = error as UploadEtagMismatchError;
    expect(mismatch.code).toBe("UPLOAD_ETAG_MISMATCH");
    expect(mismatch.sessionId).toBe("session-1");
    expect(mismatch.expected).toBe('"claimed"');
    expect(mismatch.actual).toBe('"stored"');
    expectNoMetadataWrites(metadata);
  });

  it("checks size before ETag when both are wrong", async () => {
    const { service } = setup(makeSession({ expectedSize: 1024 }), {
      contentLength: 1,
      etag: '"stored"',
    });

    await expect(
      service.completeUploadSession({ sessionId: "session-1", etag: '"claimed"' }),
    ).rejects.toThrow(UploadSizeMismatchError);
  });

  it("raises the size error for multipart sessions after the provider completes", async () => {
    const { service, storage, metadata } = setup(
      makeSession({
        mode: UploadMode.Multipart,
        providerUploadId: "upload-1",
        expectedSize: 1024,
      }),
      { contentLength: 1000, etag: '"abc"' },
    );

    await expect(
      service.completeUploadSession({ sessionId: "session-1" }),
    ).rejects.toThrow(UploadSizeMismatchError);
    expect(storage.completeUploadSession).toHaveBeenCalledTimes(1);
    expectNoMetadataWrites(metadata);
  });

  it("completes when size and ETag match", async () => {
    const { service, metadata } = setup(makeSession({ expectedSize: 1024 }), {
      contentLength: 1024,
      etag: '"abc"',
    });

    const { blob } = await service.completeUploadSession({
      sessionId: "session-1",
      etag: '"abc"',
    });

    expect(blob.size).toBe(1024);
    expect(metadata.blobs.createBlob).toHaveBeenCalledTimes(1);
  });

  it("skips both checks when nothing was declared", async () => {
    const { service } = setup(makeSession(), { contentLength: 7, etag: '"x"' });

    await expect(
      service.completeUploadSession({ sessionId: "session-1" }),
    ).resolves.toBeDefined();
  });
});
