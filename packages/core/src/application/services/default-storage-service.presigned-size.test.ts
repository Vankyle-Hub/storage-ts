import { describe, it, expect, vi } from "vitest";
import {
  DefaultStorageService,
  StorageProvider,
  UploadMode,
  UploadSessionStatus,
} from "@vankyle/storage-core";
import type {
  IStorage,
  IMetadataStore,
  UploadSession,
} from "@vankyle/storage-core";
import { ValidationError } from "@vankyle/storage-shared";

// The declared size is handed to the provider when a presigned upload URL is
// created (#63), so a provider that can enforce it refuses any other size.

function setup(session?: UploadSession) {
  const storage = {
    provider: StorageProvider.S3,
    capabilities: {
      multipartUpload: true,
      signedReadUrl: false,
      signedPutUrl: true,
      signedPartUrl: true,
      signedContentLength: true,
    },
    putObject: vi.fn(),
    getObject: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
    initUploadSession: vi.fn().mockResolvedValue({ providerUploadId: "upload-1" }),
    uploadPart: vi.fn(),
    completeUploadSession: vi.fn(),
    abortUploadSession: vi.fn(),
    createPutUrl: vi.fn().mockResolvedValue({
      url: "https://example.com/put",
      method: "PUT",
      expiresAt: new Date(),
    }),
    createUploadPartUrl: vi.fn().mockResolvedValue({
      url: "https://example.com/part",
      method: "PUT",
      expiresAt: new Date(),
    }),
  } satisfies IStorage;

  const metadata = {
    uploads: {
      createSession: vi.fn().mockImplementation(async (input) => ({
        ...input,
        status: UploadSessionStatus.Pending,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      getSession: vi.fn().mockResolvedValue(session),
      updateSession: vi.fn(),
      addPart: vi.fn(),
      getPart: vi.fn(),
      listParts: vi.fn().mockResolvedValue([]),
    },
    blobs: {
      createBlob: vi.fn(),
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
  } satisfies IMetadataStore;

  const service = new DefaultStorageService({ storage, metadata, bucket: "test-bucket" });
  return { service, storage, metadata };
}

function multipartSession(): UploadSession {
  return {
    id: "session-1",
    provider: StorageProvider.S3,
    bucket: "test-bucket",
    objectKey: "uploads/obj-key",
    mode: UploadMode.Multipart,
    status: UploadSessionStatus.Pending,
    providerUploadId: "upload-1",
    expectedSize: 10 * 1024 * 1024,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const INVALID_SIZES = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53];

describe("createUploadSession (single mode) and the presigned PUT URL", () => {
  it("passes expectedSize to createPutUrl as contentLength", async () => {
    const { service, storage } = setup();

    await service.createUploadSession({
      mode: UploadMode.Single,
      mimeType: "image/jpeg",
      expectedSize: 2048,
    });

    expect(storage.createPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/jpeg", contentLength: 2048 }),
    );
  });

  it("passes an expectedSize of zero", async () => {
    const { service, storage } = setup();

    await service.createUploadSession({ mode: UploadMode.Single, expectedSize: 0 });

    expect(storage.createPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: 0 }),
    );
  });

  it("leaves contentLength undefined when no size was declared", async () => {
    const { service, storage } = setup();

    await service.createUploadSession({ mode: UploadMode.Single });

    expect(storage.createPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: undefined }),
    );
  });

  it.each(INVALID_SIZES)("rejects expectedSize %s before anything is created", async (size) => {
    const { service, storage, metadata } = setup();

    for (const mode of [UploadMode.Single, UploadMode.Multipart]) {
      const error = await service
        .createUploadSession({ mode, expectedSize: size })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("expectedSize");
    }
    expect(storage.createPutUrl).not.toHaveBeenCalled();
    expect(storage.initUploadSession).not.toHaveBeenCalled();
    expect(metadata.uploads.createSession).not.toHaveBeenCalled();
  });
});

describe("getUploadPartUrl and the presigned part URL", () => {
  it("passes the request's contentLength to createUploadPartUrl", async () => {
    const { service, storage } = setup(multipartSession());

    await service.getUploadPartUrl({
      sessionId: "session-1",
      partNumber: 2,
      contentLength: 5 * 1024 * 1024,
    });

    expect(storage.createUploadPartUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        providerUploadId: "upload-1",
        partNumber: 2,
        contentLength: 5 * 1024 * 1024,
      }),
    );
  });

  it("does not derive a part size from the session's expectedSize", async () => {
    const { service, storage } = setup(multipartSession());

    await service.getUploadPartUrl({ sessionId: "session-1", partNumber: 1 });

    expect(storage.createUploadPartUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: undefined }),
    );
  });

  it.each(INVALID_SIZES)("rejects contentLength %s before the session is read", async (size) => {
    const { service, storage, metadata } = setup(multipartSession());

    const error = await service
      .getUploadPartUrl({ sessionId: "session-1", partNumber: 1, contentLength: size })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe("contentLength");
    expect(metadata.uploads.getSession).not.toHaveBeenCalled();
    expect(storage.createUploadPartUrl).not.toHaveBeenCalled();
  });
});
