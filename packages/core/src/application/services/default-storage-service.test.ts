import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  DefaultStorageService,
  StorageProvider,
  UploadMode,
  UploadSessionStatus,
  BlobStatus,
  FileStatus,
} from "@vankyle-hub/storage-core";
import type {
  IStorage,
  IMetadataStore,
  IUploadSessionStore,
  IBlobStore,
  IFileStore,
  StorageCapabilities,
} from "@vankyle-hub/storage-core";
import {
  CapabilityNotSupportedError,
  MetadataNotFoundError,
} from "@vankyle-hub/storage-shared";

// ── Helper factories ──

type MockStorageOverrides = Partial<
  Omit<IStorage, "createReadUrl" | "createPutUrl" | "createUploadPartUrl">
> & {
  createReadUrl?: IStorage["createReadUrl"] | undefined;
  createPutUrl?: IStorage["createPutUrl"] | undefined;
  createUploadPartUrl?: IStorage["createUploadPartUrl"] | undefined;
};

function createMockStorage(overrides?: MockStorageOverrides): IStorage {
  const storage: IStorage = {
    provider: StorageProvider.S3,
    capabilities: {
      multipartUpload: true,
      signedReadUrl: true,
      signedPutUrl: true,
      signedPartUrl: true,
    },
    putObject: vi.fn(),
    getObject: vi.fn(),
    headObject: vi.fn().mockResolvedValue({
      contentType: "application/octet-stream",
      contentLength: 1024,
      etag: '"abc"',
    }),
    deleteObject: vi.fn(),
    initUploadSession: vi.fn().mockResolvedValue({
      providerUploadId: "provider-upload-1",
    }),
    uploadPart: vi.fn().mockResolvedValue({
      etag: '"part-etag"',
      partNumber: 1,
      size: 512,
    }),
    completeUploadSession: vi.fn().mockResolvedValue({
      etag: '"complete-etag"',
    }),
    abortUploadSession: vi.fn().mockResolvedValue(undefined),
    createReadUrl: vi.fn().mockResolvedValue({
      url: "https://example.com/read",
      method: "GET",
      expiresAt: new Date(Date.now() + 3600_000),
    }),
    createPutUrl: vi.fn().mockResolvedValue({
      url: "https://example.com/put",
      method: "PUT",
      expiresAt: new Date(Date.now() + 3600_000),
    }),
    createUploadPartUrl: vi.fn().mockResolvedValue({
      url: "https://example.com/part",
      method: "PUT",
      expiresAt: new Date(Date.now() + 3600_000),
    }),
  };

  if (!overrides) {
    return storage;
  }

  const {
    createReadUrl,
    createPutUrl,
    createUploadPartUrl,
    ...restOverrides
  } = overrides;

  Object.assign(storage, restOverrides);

  if ("createReadUrl" in overrides) {
    if (createReadUrl) {
      storage.createReadUrl = createReadUrl;
    } else {
      delete storage.createReadUrl;
    }
  }

  if ("createPutUrl" in overrides) {
    if (createPutUrl) {
      storage.createPutUrl = createPutUrl;
    } else {
      delete storage.createPutUrl;
    }
  }

  if ("createUploadPartUrl" in overrides) {
    if (createUploadPartUrl) {
      storage.createUploadPartUrl = createUploadPartUrl;
    } else {
      delete storage.createUploadPartUrl;
    }
  }

  return storage;
}

function createMockUploadSessionStore(): IUploadSessionStore {
  return {
    createSession: vi.fn().mockImplementation(async (input) => ({
      ...input,
      status: UploadSessionStatus.Pending,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    getSession: vi.fn(),
    updateSession: vi.fn().mockImplementation(async (id, input) => ({
      id,
      ...input,
      updatedAt: new Date(),
    })),
    addPart: vi.fn().mockImplementation(async (input) => ({
      ...input,
      uploadedAt: new Date(),
    })),
    getPart: vi.fn(),
    listParts: vi.fn().mockResolvedValue([]),
  };
}

function createMockBlobStore(): IBlobStore {
  return {
    createBlob: vi.fn().mockImplementation(async (input) => ({
      ...input,
      status: BlobStatus.Active,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    getBlob: vi.fn(),
    updateBlob: vi.fn().mockImplementation(async (id, input) => ({
      id,
      ...input,
      updatedAt: new Date(),
    })),
    findBlobBySha256: vi.fn(),
    findBlobByLocator: vi.fn(),
    createReference: vi.fn().mockImplementation(async (input) => ({
      ...input,
      createdAt: new Date(),
    })),
    listReferences: vi.fn().mockResolvedValue([]),
    deleteReference: vi.fn(),
  };
}

function createMockFileStore(): IFileStore {
  return {
    createFile: vi.fn().mockImplementation(async (input) => ({
      ...input,
      status: FileStatus.Active,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    getFile: vi.fn(),
    updateFile: vi.fn().mockImplementation(async (id, input) => ({
      id,
      ...input,
      updatedAt: new Date(),
    })),
    createVersion: vi.fn().mockImplementation(async (input) => ({
      ...input,
      createdAt: new Date(),
    })),
    getVersion: vi.fn(),
    listVersions: vi.fn().mockResolvedValue([]),
    getLatestVersion: vi.fn(),
  };
}

function createMockMetadata(): IMetadataStore & {
  uploads: ReturnType<typeof createMockUploadSessionStore>;
  blobs: ReturnType<typeof createMockBlobStore>;
  files: ReturnType<typeof createMockFileStore>;
} {
  return {
    uploads: createMockUploadSessionStore(),
    blobs: createMockBlobStore(),
    files: createMockFileStore(),
  };
}

function createService(
  storageOverrides?: MockStorageOverrides,
  metadataOverrides?: Partial<IMetadataStore>,
) {
  const storage = createMockStorage(storageOverrides);
  const metadata = createMockMetadata();
  if (metadataOverrides) {
    Object.assign(metadata, metadataOverrides);
  }
  const service = new DefaultStorageService({
    storage,
    metadata,
    bucket: "test-bucket",
  });
  return { service, storage, metadata };
}

// ── Tests ──

describe("DefaultStorageService", () => {
  describe("createUploadSession", () => {
    it("should create a multipart upload session by default", async () => {
      const { service, storage, metadata } = createService();

      const result = await service.createUploadSession({
        fileName: "test.txt",
        mimeType: "text/plain",
      });

      expect(result.session).toBeDefined();
      expect(storage.initUploadSession).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "test-bucket",
          contentType: "text/plain",
        }),
      );
      expect(metadata.uploads.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: StorageProvider.S3,
          bucket: "test-bucket",
          mode: UploadMode.Multipart,
          fileName: "test.txt",
          mimeType: "text/plain",
          providerUploadId: "provider-upload-1",
        }),
      );
    });

    it("should create a single mode session and generate put URL", async () => {
      const { service, storage, metadata } = createService();

      const result = await service.createUploadSession({
        fileName: "photo.jpg",
        mode: UploadMode.Single,
      });

      expect(storage.initUploadSession).not.toHaveBeenCalled();
      expect(storage.createPutUrl).toHaveBeenCalled();
      expect(result.uploadUrl).toBeDefined();
      expect(result.uploadUrl!.url).toBe("https://example.com/put");
    });

    it("should not generate put URL in single mode if not supported", async () => {
      const { service, storage } = createService({
        createPutUrl: undefined,
      });

      const result = await service.createUploadSession({
        mode: UploadMode.Single,
      });

      expect(result.uploadUrl).toBeUndefined();
    });

    it("should pass ownerId and createdBy to session", async () => {
      const { service, metadata } = createService();

      await service.createUploadSession({
        ownerId: "owner-1",
        createdBy: "user-1",
      });

      expect(metadata.uploads.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: "owner-1",
          createdBy: "user-1",
        }),
      );
    });

    it("should set expiresAt based on expiresInSeconds", async () => {
      const { service, metadata } = createService();
      const before = Date.now();

      await service.createUploadSession({
        expiresInSeconds: 7200,
      });

      const call = (metadata.uploads.createSession as Mock).mock.calls[0]![0];
      const expiresAt = call.expiresAt as Date;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7200_000 - 100);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7200_000 + 100);
    });

    it("should use default expiry of 3600 seconds", async () => {
      const { service, metadata } = createService();
      const before = Date.now();

      await service.createUploadSession({});

      const call = (metadata.uploads.createSession as Mock).mock.calls[0]![0];
      const expiresAt = call.expiresAt as Date;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600_000 - 100);
    });

    it("should generate object key using policy", async () => {
      const { service, metadata } = createService();

      await service.createUploadSession({
        fileName: "report.pdf",
        ownerId: "user-1",
      });

      const call = (metadata.uploads.createSession as Mock).mock.calls[0]![0];
      expect(call.objectKey).toBeDefined();
      expect(typeof call.objectKey).toBe("string");
      // Key should contain an extension from fileName
      expect(call.objectKey).toMatch(/\.pdf$/);
    });
  });

  describe("getUploadPartUrl", () => {
    it("should return a signed URL for the part", async () => {
      const { service, storage, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        provider: StorageProvider.S3,
        bucket: "test-bucket",
        objectKey: "path/to/file.txt",
        providerUploadId: "upload-abc",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
      });

      const result = await service.getUploadPartUrl({
        sessionId: "session-1",
        partNumber: 3,
      });

      expect(result.url).toBe("https://example.com/part");
      expect(storage.createUploadPartUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "test-bucket",
          objectKey: "path/to/file.txt",
          providerUploadId: "upload-abc",
          partNumber: 3,
        }),
      );
    });

    it("should throw MetadataNotFoundError when session not found", async () => {
      const { service, metadata } = createService();
      (metadata.uploads.getSession as Mock).mockResolvedValue(undefined);

      await expect(
        service.getUploadPartUrl({ sessionId: "not-exist", partNumber: 1 }),
      ).rejects.toThrow(MetadataNotFoundError);
    });

    it("should throw CapabilityNotSupportedError when part URL not supported", async () => {
      const { service, metadata } = createService({
        createUploadPartUrl: undefined,
      });

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        providerUploadId: "upload-abc",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
      });

      await expect(
        service.getUploadPartUrl({ sessionId: "session-1", partNumber: 1 }),
      ).rejects.toThrow(CapabilityNotSupportedError);
    });

    it("should throw when session has no providerUploadId", async () => {
      const { service, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        providerUploadId: undefined,
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
      });

      await expect(
        service.getUploadPartUrl({ sessionId: "session-1", partNumber: 1 }),
      ).rejects.toThrow(MetadataNotFoundError);
    });
  });

  describe("uploadPart", () => {
    it("should upload a part via storage and record in metadata", async () => {
      const { service, storage, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        provider: StorageProvider.S3,
        bucket: "test-bucket",
        objectKey: "obj-key",
        providerUploadId: "upload-1",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
      });

      const body = new Uint8Array([1, 2, 3]);
      const result = await service.uploadPart({
        sessionId: "session-1",
        partNumber: 1,
        body,
      });

      expect(storage.uploadPart).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "test-bucket",
          objectKey: "obj-key",
          providerUploadId: "upload-1",
          partNumber: 1,
          body,
        }),
      );
      expect(metadata.uploads.addPart).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          partNumber: 1,
          etag: '"part-etag"',
        }),
      );
      expect(result).toBeDefined();
    });

    it("should update session to in-progress if pending", async () => {
      const { service, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        providerUploadId: "upload-1",
        bucket: "test-bucket",
        objectKey: "key",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.Pending,
      });

      await service.uploadPart({
        sessionId: "session-1",
        partNumber: 1,
        body: new Uint8Array(),
      });

      expect(metadata.uploads.updateSession).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          status: UploadSessionStatus.InProgress,
        }),
      );
    });

    it("should not update status if already in-progress", async () => {
      const { service, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        providerUploadId: "upload-1",
        bucket: "test-bucket",
        objectKey: "key",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
      });

      await service.uploadPart({
        sessionId: "session-1",
        partNumber: 2,
        body: new Uint8Array(),
      });

      expect(metadata.uploads.updateSession).not.toHaveBeenCalled();
    });

    it("should throw when session not found", async () => {
      const { service, metadata } = createService();
      (metadata.uploads.getSession as Mock).mockResolvedValue(undefined);

      await expect(
        service.uploadPart({
          sessionId: "missing",
          partNumber: 1,
          body: new Uint8Array(),
        }),
      ).rejects.toThrow(MetadataNotFoundError);
    });
  });

  describe("registerPart", () => {
    it("should record a part in metadata without uploading", async () => {
      const { service, storage, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        providerUploadId: "upload-1",
        bucket: "test-bucket",
        objectKey: "key",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
      });

      const result = await service.registerPart({
        sessionId: "session-1",
        partNumber: 1,
        size: 1024,
        etag: '"client-etag"',
      });

      expect(storage.uploadPart).not.toHaveBeenCalled();
      expect(metadata.uploads.addPart).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          partNumber: 1,
          size: 1024,
          etag: '"client-etag"',
        }),
      );
      expect(result).toBeDefined();
    });

    it("should transition pending session to in-progress", async () => {
      const { service, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        providerUploadId: "upload-1",
        bucket: "test-bucket",
        objectKey: "key",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.Pending,
      });

      await service.registerPart({
        sessionId: "session-1",
        partNumber: 1,
        size: 512,
      });

      expect(metadata.uploads.updateSession).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ status: UploadSessionStatus.InProgress }),
      );
    });
  });

  describe("completeUploadSession", () => {
    it("should complete a multipart upload and create blob", async () => {
      const { service, storage, metadata } = createService();

      const parts = [
        { id: "p1", sessionId: "session-1", partNumber: 1, size: 512, etag: '"e1"', uploadedAt: new Date() },
        { id: "p2", sessionId: "session-1", partNumber: 2, size: 512, etag: '"e2"', uploadedAt: new Date() },
      ];
      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        provider: StorageProvider.S3,
        bucket: "test-bucket",
        objectKey: "key.txt",
        providerUploadId: "upload-1",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
        mimeType: "text/plain",
      });
      (metadata.uploads.listParts as Mock).mockResolvedValue(parts);

      const result = await service.completeUploadSession({
        sessionId: "session-1",
      });

      expect(storage.completeUploadSession).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "test-bucket",
          objectKey: "key.txt",
          providerUploadId: "upload-1",
          parts: [
            { partNumber: 1, etag: '"e1"' },
            { partNumber: 2, etag: '"e2"' },
          ],
        }),
      );
      expect(storage.headObject).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "test-bucket",
          objectKey: "key.txt",
        }),
      );
      expect(metadata.uploads.updateSession).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          status: UploadSessionStatus.Completed,
        }),
      );
      expect(metadata.blobs.createBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: StorageProvider.S3,
          bucket: "test-bucket",
          objectKey: "key.txt",
        }),
      );
      expect(result.blob).toBeDefined();
      expect(result.file).toBeUndefined();
      expect(result.fileVersion).toBeUndefined();
    });

    it("should create file and version when createFile is provided", async () => {
      const { service, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        provider: StorageProvider.S3,
        bucket: "test-bucket",
        objectKey: "key.txt",
        providerUploadId: "upload-1",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
        ownerId: "owner-1",
        createdBy: "user-1",
        mimeType: "text/plain",
      });
      (metadata.uploads.listParts as Mock).mockResolvedValue([]);

      const result = await service.completeUploadSession({
        sessionId: "session-1",
        createFile: {
          displayName: "My Document.txt",
        },
      });

      expect(metadata.files.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          createdBy: "user-1",
        }),
      );
      expect(metadata.files.createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: "My Document.txt",
          ownerId: "owner-1",
        }),
      );
      expect(metadata.files.updateFile).toHaveBeenCalled();
      expect(metadata.blobs.createReference).toHaveBeenCalledWith(
        expect.objectContaining({
          refType: "file-version",
        }),
      );
      expect(result.file).toBeDefined();
      expect(result.fileVersion).toBeDefined();
    });

    it("should use createFile.ownerId over session.ownerId", async () => {
      const { service, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        provider: StorageProvider.S3,
        bucket: "test-bucket",
        objectKey: "key.txt",
        providerUploadId: "upload-1",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
        ownerId: "session-owner",
      });
      (metadata.uploads.listParts as Mock).mockResolvedValue([]);

      await service.completeUploadSession({
        sessionId: "session-1",
        createFile: {
          displayName: "test.txt",
          ownerId: "file-owner",
        },
      });

      expect(metadata.files.createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: "file-owner",
        }),
      );
    });

    it("should handle single mode (no multipart completion)", async () => {
      const { service, storage, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        provider: StorageProvider.S3,
        bucket: "test-bucket",
        objectKey: "key.txt",
        providerUploadId: undefined,
        mode: UploadMode.Single,
        status: UploadSessionStatus.Pending,
      });

      const result = await service.completeUploadSession({
        sessionId: "session-1",
      });

      expect(storage.completeUploadSession).not.toHaveBeenCalled();
      expect(storage.headObject).toHaveBeenCalled();
      expect(result.blob).toBeDefined();
    });
  });

  describe("abortUploadSession", () => {
    it("should abort provider session and update metadata", async () => {
      const { service, storage, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        bucket: "test-bucket",
        objectKey: "key.txt",
        providerUploadId: "upload-1",
        mode: UploadMode.Multipart,
        status: UploadSessionStatus.InProgress,
      });

      await service.abortUploadSession("session-1");

      expect(storage.abortUploadSession).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "test-bucket",
          objectKey: "key.txt",
          providerUploadId: "upload-1",
        }),
      );
      expect(metadata.uploads.updateSession).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          status: UploadSessionStatus.Aborted,
        }),
      );
    });

    it("should skip provider abort when no providerUploadId", async () => {
      const { service, storage, metadata } = createService();

      (metadata.uploads.getSession as Mock).mockResolvedValue({
        id: "session-1",
        bucket: "test-bucket",
        objectKey: "key.txt",
        providerUploadId: undefined,
        mode: UploadMode.Single,
        status: UploadSessionStatus.Pending,
      });

      await service.abortUploadSession("session-1");

      expect(storage.abortUploadSession).not.toHaveBeenCalled();
      expect(metadata.uploads.updateSession).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          status: UploadSessionStatus.Aborted,
        }),
      );
    });

    it("should throw when session not found", async () => {
      const { service, metadata } = createService();
      (metadata.uploads.getSession as Mock).mockResolvedValue(undefined);

      await expect(service.abortUploadSession("missing")).rejects.toThrow(
        MetadataNotFoundError,
      );
    });
  });

  describe("getReadUrl", () => {
    it("should resolve file → version → blob → signed URL", async () => {
      const { service, storage, metadata } = createService();

      (metadata.files.getFile as Mock).mockResolvedValue({
        id: "file-1",
        displayName: "doc.pdf",
        currentVersionId: "v-1",
        mimeType: "application/pdf",
        status: FileStatus.Active,
      });
      (metadata.files.getVersion as Mock).mockResolvedValue({
        id: "v-1",
        fileId: "file-1",
        blobId: "blob-1",
        version: 1,
        size: 2048,
      });
      (metadata.blobs.getBlob as Mock).mockResolvedValue({
        id: "blob-1",
        provider: StorageProvider.S3,
        bucket: "test-bucket",
        objectKey: "path/to/blob",
        size: 2048,
        status: BlobStatus.Active,
      });

      const result = await service.getReadUrl({ fileId: "file-1" });

      expect(result.url).toBe("https://example.com/read");
      expect(storage.createReadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "test-bucket",
          objectKey: "path/to/blob",
          responseContentType: "application/pdf",
        }),
      );
    });

    it("should use specific versionId when provided", async () => {
      const { service, metadata } = createService();

      (metadata.files.getFile as Mock).mockResolvedValue({
        id: "file-1",
        displayName: "doc.pdf",
        currentVersionId: "v-2",
        status: FileStatus.Active,
      });
      (metadata.files.getVersion as Mock).mockResolvedValue({
        id: "v-1",
        fileId: "file-1",
        blobId: "blob-old",
        version: 1,
        size: 1024,
      });
      (metadata.blobs.getBlob as Mock).mockResolvedValue({
        id: "blob-old",
        bucket: "test-bucket",
        objectKey: "old-path",
        size: 1024,
        status: BlobStatus.Active,
      });

      await service.getReadUrl({ fileId: "file-1", versionId: "v-1" });

      expect(metadata.files.getVersion).toHaveBeenCalledWith("v-1");
    });

    it("should throw when file not found", async () => {
      const { service, metadata } = createService();
      (metadata.files.getFile as Mock).mockResolvedValue(undefined);

      await expect(
        service.getReadUrl({ fileId: "not-found" }),
      ).rejects.toThrow(MetadataNotFoundError);
    });

    it("should throw when file has no currentVersionId", async () => {
      const { service, metadata } = createService();
      (metadata.files.getFile as Mock).mockResolvedValue({
        id: "file-1",
        displayName: "test",
        currentVersionId: undefined,
        status: FileStatus.Active,
      });

      await expect(
        service.getReadUrl({ fileId: "file-1" }),
      ).rejects.toThrow(MetadataNotFoundError);
    });

    it("should throw when version not found", async () => {
      const { service, metadata } = createService();
      (metadata.files.getFile as Mock).mockResolvedValue({
        id: "file-1",
        currentVersionId: "v-missing",
        status: FileStatus.Active,
      });
      (metadata.files.getVersion as Mock).mockResolvedValue(undefined);

      await expect(
        service.getReadUrl({ fileId: "file-1" }),
      ).rejects.toThrow(MetadataNotFoundError);
    });

    it("should throw when blob not found", async () => {
      const { service, metadata } = createService();
      (metadata.files.getFile as Mock).mockResolvedValue({
        id: "file-1",
        currentVersionId: "v-1",
        status: FileStatus.Active,
      });
      (metadata.files.getVersion as Mock).mockResolvedValue({
        id: "v-1",
        blobId: "blob-gone",
        version: 1,
        size: 10,
      });
      (metadata.blobs.getBlob as Mock).mockResolvedValue(undefined);

      await expect(
        service.getReadUrl({ fileId: "file-1" }),
      ).rejects.toThrow(MetadataNotFoundError);
    });

    it("should throw CapabilityNotSupportedError when signedReadUrl not supported", async () => {
      const { service } = createService({ createReadUrl: undefined });

      await expect(
        service.getReadUrl({ fileId: "file-1" }),
      ).rejects.toThrow(CapabilityNotSupportedError);
    });
  });

  describe("getFile", () => {
    it("should delegate to metadata.files.getFile", async () => {
      const { service, metadata } = createService();
      const mockFile = {
        id: "file-1",
        displayName: "test.txt",
        status: FileStatus.Active,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (metadata.files.getFile as Mock).mockResolvedValue(mockFile);

      const result = await service.getFile("file-1");
      expect(result).toBe(mockFile);
      expect(metadata.files.getFile).toHaveBeenCalledWith("file-1");
    });

    it("should return undefined for non-existent file", async () => {
      const { service, metadata } = createService();
      (metadata.files.getFile as Mock).mockResolvedValue(undefined);

      const result = await service.getFile("not-found");
      expect(result).toBeUndefined();
    });
  });

  describe("getBlob", () => {
    it("should delegate to metadata.blobs.getBlob", async () => {
      const { service, metadata } = createService();
      const mockBlob = {
        id: "blob-1",
        provider: StorageProvider.S3,
        bucket: "bucket",
        objectKey: "key",
        size: 100,
        status: BlobStatus.Active,
      };
      (metadata.blobs.getBlob as Mock).mockResolvedValue(mockBlob);

      const result = await service.getBlob("blob-1");
      expect(result).toBe(mockBlob);
    });
  });

  describe("deleteFile", () => {
    it("should soft-delete file and orphan unreferenced blobs", async () => {
      const { service, metadata } = createService();

      (metadata.files.getFile as Mock).mockResolvedValue({
        id: "file-1",
        displayName: "test.txt",
        status: FileStatus.Active,
      });

      const version = {
        id: "v-1",
        fileId: "file-1",
        blobId: "blob-1",
        version: 1,
        size: 1024,
      };
      (metadata.files.listVersions as Mock).mockResolvedValue([version]);

      const ref = {
        id: "ref-1",
        blobId: "blob-1",
        refType: "file-version",
        refId: "v-1",
        createdAt: new Date(),
      };
      (metadata.blobs.listReferences as Mock)
        .mockResolvedValueOnce([ref]) // First call: find refs for version
        .mockResolvedValueOnce([]); // Second call: check remaining refs

      await service.deleteFile({ fileId: "file-1" });

      // Should soft-delete the file
      expect(metadata.files.updateFile).toHaveBeenCalledWith(
        "file-1",
        expect.objectContaining({
          status: FileStatus.Deleted,
        }),
      );

      // Should delete the blob reference
      expect(metadata.blobs.deleteReference).toHaveBeenCalledWith("ref-1");

      // Should mark blob as orphaned since no remaining references
      expect(metadata.blobs.updateBlob).toHaveBeenCalledWith(
        "blob-1",
        expect.objectContaining({
          status: BlobStatus.Orphaned,
        }),
      );
    });

    it("should not orphan blob if other references remain", async () => {
      const { service, metadata } = createService();

      (metadata.files.getFile as Mock).mockResolvedValue({
        id: "file-1",
        displayName: "test.txt",
        status: FileStatus.Active,
      });

      const version = {
        id: "v-1",
        fileId: "file-1",
        blobId: "blob-shared",
        version: 1,
        size: 1024,
      };
      (metadata.files.listVersions as Mock).mockResolvedValue([version]);

      const ownRef = {
        id: "ref-1",
        blobId: "blob-shared",
        refType: "file-version",
        refId: "v-1",
        createdAt: new Date(),
      };
      const otherRef = {
        id: "ref-2",
        blobId: "blob-shared",
        refType: "file-version",
        refId: "v-other",
        createdAt: new Date(),
      };
      (metadata.blobs.listReferences as Mock)
        .mockResolvedValueOnce([ownRef, otherRef]) // First call
        .mockResolvedValueOnce([otherRef]); // After deletion, other ref remains

      await service.deleteFile({ fileId: "file-1" });

      expect(metadata.blobs.deleteReference).toHaveBeenCalledWith("ref-1");
      expect(metadata.blobs.updateBlob).not.toHaveBeenCalled();
    });

    it("should throw when file not found", async () => {
      const { service, metadata } = createService();
      (metadata.files.getFile as Mock).mockResolvedValue(undefined);

      await expect(
        service.deleteFile({ fileId: "missing" }),
      ).rejects.toThrow(MetadataNotFoundError);
    });

    it("should handle file with no versions", async () => {
      const { service, metadata } = createService();

      (metadata.files.getFile as Mock).mockResolvedValue({
        id: "file-1",
        displayName: "empty.txt",
        status: FileStatus.Active,
      });
      (metadata.files.listVersions as Mock).mockResolvedValue([]);

      await service.deleteFile({ fileId: "file-1" });

      expect(metadata.files.updateFile).toHaveBeenCalledWith(
        "file-1",
        expect.objectContaining({ status: FileStatus.Deleted }),
      );
      expect(metadata.blobs.deleteReference).not.toHaveBeenCalled();
    });
  });

  describe("constructor options", () => {
    it("should use custom objectKeyPolicy", async () => {
      const customPolicy = {
        generate: vi.fn().mockReturnValue("custom/key/path"),
      };
      const storage = createMockStorage();
      const metadata = createMockMetadata();
      const service = new DefaultStorageService({
        storage,
        metadata,
        bucket: "test-bucket",
        objectKeyPolicy: customPolicy,
      });

      await service.createUploadSession({ fileName: "test.txt" });

      expect(customPolicy.generate).toHaveBeenCalled();
      expect(metadata.uploads.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          objectKey: "custom/key/path",
        }),
      );
    });

    it("should pass objectKeyPrefix to policy", async () => {
      const customPolicy = {
        generate: vi.fn().mockReturnValue("prefix/obj"),
      };
      const storage = createMockStorage();
      const metadata = createMockMetadata();
      const service = new DefaultStorageService({
        storage,
        metadata,
        bucket: "test-bucket",
        objectKeyPolicy: customPolicy,
        objectKeyPrefix: "my-prefix",
      });

      await service.createUploadSession({});

      expect(customPolicy.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: "my-prefix",
        }),
      );
    });

    it("should use custom read URL expiry", async () => {
      const storage = createMockStorage();
      const metadata = createMockMetadata();
      const service = new DefaultStorageService({
        storage,
        metadata,
        bucket: "test-bucket",
        defaultReadUrlExpiresInSeconds: 600,
      });

      (metadata.files.getFile as Mock).mockResolvedValue({
        id: "file-1",
        currentVersionId: "v-1",
        status: FileStatus.Active,
      });
      (metadata.files.getVersion as Mock).mockResolvedValue({
        id: "v-1",
        blobId: "blob-1",
        version: 1,
        size: 100,
      });
      (metadata.blobs.getBlob as Mock).mockResolvedValue({
        id: "blob-1",
        bucket: "test-bucket",
        objectKey: "key",
        size: 100,
        status: BlobStatus.Active,
      });

      await service.getReadUrl({ fileId: "file-1" });

      expect(storage.createReadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresInSeconds: 600,
        }),
      );
    });
  });
});
