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
import {
  MetadataNotFoundError,
  UploadSessionStateError,
  ValidationError,
} from "@vankyle/storage-shared";

// Server-side single-mode flow: create → uploadObject → complete.

function makeSession(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    id: "session-1",
    provider: StorageProvider.S3,
    bucket: "test-bucket",
    objectKey: "uploads/obj-key",
    mode: UploadMode.Single,
    status: UploadSessionStatus.Pending,
    mimeType: "text/plain",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(session: UploadSession | undefined) {
  // A tiny in-memory session store so status transitions are observable.
  let current = session;

  const storage = {
    provider: StorageProvider.S3,
    capabilities: {
      multipartUpload: true,
      signedReadUrl: false,
      signedPutUrl: false,
      signedPartUrl: false,
    },
    putObject: vi.fn().mockResolvedValue({ etag: '"put-etag"' }),
    getObject: vi.fn(),
    headObject: vi.fn().mockResolvedValue({
      contentType: "text/plain",
      contentLength: 3,
      etag: '"put-etag"',
    }),
    deleteObject: vi.fn(),
    initUploadSession: vi.fn(),
    uploadPart: vi.fn(),
    completeUploadSession: vi.fn(),
    abortUploadSession: vi.fn(),
  } satisfies IStorage;

  const metadata = {
    uploads: {
      createSession: vi.fn().mockImplementation(async (input) => {
        current = makeSession({ ...input, status: UploadSessionStatus.Pending });
        return current;
      }),
      getSession: vi.fn().mockImplementation(async () => current),
      updateSession: vi.fn().mockImplementation(async (_id, input) => {
        current = { ...current!, ...input, updatedAt: new Date() };
        return current;
      }),
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
  } satisfies IMetadataStore;

  const service = new DefaultStorageService({
    storage,
    metadata,
    bucket: "test-bucket",
  });

  return { service, storage, metadata };
}

describe("DefaultStorageService.uploadObject", () => {
  it("writes the body with putObject and moves the session to in-progress", async () => {
    const { service, storage, metadata } = setup(makeSession());
    const body = new Uint8Array([1, 2, 3]);

    const result = await service.uploadObject({ sessionId: "session-1", body });

    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(storage.putObject).toHaveBeenCalledWith({
      bucket: "test-bucket",
      objectKey: "uploads/obj-key",
      body,
      contentType: "text/plain",
      contentLength: 3,
    });
    expect(metadata.uploads.updateSession).toHaveBeenCalledWith("session-1", {
      status: UploadSessionStatus.InProgress,
    });
    expect(result.etag).toBe('"put-etag"');
    expect(result.session.status).toBe(UploadSessionStatus.InProgress);
    // No blob until completeUploadSession verifies the object.
    expect(metadata.blobs.createBlob).not.toHaveBeenCalled();
  });

  it("prefers an explicit contentLength", async () => {
    const { service, storage } = setup(makeSession({ expectedSize: 99 }));

    await service.uploadObject({
      sessionId: "session-1",
      body: new Uint8Array([1, 2, 3]),
      contentLength: 7,
    });

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: 7 }),
    );
  });

  it("falls back to the session's expectedSize for stream bodies", async () => {
    const { service, storage } = setup(makeSession({ expectedSize: 42 }));
    const body = new ReadableStream<Uint8Array>();

    await service.uploadObject({ sessionId: "session-1", body });

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ body, contentLength: 42 }),
    );
  });

  it("leaves contentLength undefined for a stream of unknown size", async () => {
    const { service, storage } = setup(makeSession());

    await service.uploadObject({
      sessionId: "session-1",
      body: new ReadableStream<Uint8Array>(),
    });

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: undefined }),
    );
  });

  it("can be retried before completion without another status update", async () => {
    const { service, storage, metadata } = setup(makeSession());

    await service.uploadObject({ sessionId: "session-1", body: new Uint8Array([1]) });
    await service.uploadObject({ sessionId: "session-1", body: new Uint8Array([2]) });

    expect(storage.putObject).toHaveBeenCalledTimes(2);
    expect(metadata.uploads.updateSession).toHaveBeenCalledTimes(1);
  });

  it("does not touch the session when the provider write fails", async () => {
    const { service, storage, metadata } = setup(makeSession());
    storage.putObject.mockRejectedValue(new Error("provider down"));

    await expect(
      service.uploadObject({ sessionId: "session-1", body: new Uint8Array([1]) }),
    ).rejects.toThrow("provider down");
    expect(metadata.uploads.updateSession).not.toHaveBeenCalled();
  });

  it("throws MetadataNotFoundError when the session does not exist", async () => {
    const { service, storage } = setup(undefined);

    await expect(
      service.uploadObject({ sessionId: "missing", body: new Uint8Array() }),
    ).rejects.toThrow(MetadataNotFoundError);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("rejects multipart sessions with a ValidationError on mode", async () => {
    const { service, storage } = setup(
      makeSession({ mode: UploadMode.Multipart, providerUploadId: "upload-1" }),
    );

    const error = await service
      .uploadObject({ sessionId: "session-1", body: new Uint8Array() })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe("mode");
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it.each([UploadSessionStatus.Completed, UploadSessionStatus.Aborted])(
    "rejects a %s session with an UploadSessionStateError",
    async (status) => {
      const { service, storage } = setup(makeSession({ status }));

      const error = await service
        .uploadObject({ sessionId: "session-1", body: new Uint8Array() })
        .catch((e: unknown) => e);

      // Contract changed with #61: every session write path reports a
      // finished session with the same typed error (was ValidationError).
      expect(error).toBeInstanceOf(UploadSessionStateError);
      expect((error as UploadSessionStateError).status).toBe(status);
      expect(storage.putObject).not.toHaveBeenCalled();
    },
  );

  it("supports the full flow: create → uploadObject → complete", async () => {
    const { service, storage, metadata } = setup(undefined);

    const { session, uploadUrl } = await service.createUploadSession({
      fileName: "note.txt",
      mimeType: "text/plain",
      mode: UploadMode.Single,
      expectedSize: 3,
    });
    // No presigned PUT capability: the server-side write is the only path.
    expect(uploadUrl).toBeUndefined();

    await service.uploadObject({
      sessionId: session.id,
      body: new Uint8Array([1, 2, 3]),
    });
    const { blob } = await service.completeUploadSession({ sessionId: session.id });

    // Single mode never opens or completes a provider multipart upload.
    expect(storage.initUploadSession).not.toHaveBeenCalled();
    expect(storage.completeUploadSession).not.toHaveBeenCalled();
    expect(blob.objectKey).toBe(session.objectKey);
    expect(blob.size).toBe(3);
    expect(blob.etag).toBe('"put-etag"');
    expect(metadata.uploads.updateSession).toHaveBeenLastCalledWith(
      session.id,
      expect.objectContaining({ status: UploadSessionStatus.Completed }),
    );
  });
});

describe("DefaultStorageService part operations on single-mode sessions", () => {
  it("uploadPart points the caller at uploadObject", async () => {
    const { service, storage } = setup(makeSession());

    const error = await service
      .uploadPart({ sessionId: "session-1", partNumber: 1, body: new Uint8Array() })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe("mode");
    expect((error as ValidationError).message).toContain("uploadObject");
    expect(storage.uploadPart).not.toHaveBeenCalled();
  });

  it("getUploadPartUrl rejects single-mode sessions", async () => {
    const { service, storage } = setup(makeSession());
    const createUploadPartUrl = vi.fn();
    Object.assign(storage, { createUploadPartUrl });

    await expect(
      service.getUploadPartUrl({ sessionId: "session-1", partNumber: 1 }),
    ).rejects.toThrow(ValidationError);
    expect(createUploadPartUrl).not.toHaveBeenCalled();
  });
});
