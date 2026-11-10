import { describe, it, expect, vi, afterEach } from "vitest";
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
  UploadSessionExpiredError,
  UploadSessionStateError,
  ValidationError,
} from "@vankyle/storage-shared";

// Session lifecycle rules (#61): every operation that writes to a session
// refuses a completed, aborted or expired one, before touching the provider
// or the metadata store.

const NOW = new Date("2026-06-01T12:00:00.000Z");
const PAST = new Date("2026-06-01T11:59:59.000Z");
const FUTURE = new Date("2026-06-01T12:10:00.000Z");

function makeSession(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    id: "session-1",
    provider: StorageProvider.S3,
    bucket: "test-bucket",
    objectKey: "uploads/obj-key",
    mode: UploadMode.Multipart,
    status: UploadSessionStatus.InProgress,
    providerUploadId: "upload-1",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function setup(session: UploadSession) {
  const storage = {
    provider: StorageProvider.S3,
    capabilities: {
      multipartUpload: true,
      signedReadUrl: false,
      signedPutUrl: false,
      signedPartUrl: true,
    },
    putObject: vi.fn().mockResolvedValue({ etag: '"etag"' }),
    getObject: vi.fn(),
    headObject: vi.fn().mockResolvedValue({ contentLength: 3, etag: '"etag"' }),
    deleteObject: vi.fn(),
    initUploadSession: vi.fn(),
    uploadPart: vi.fn().mockResolvedValue({ etag: '"part"', partNumber: 1, size: 3 }),
    completeUploadSession: vi.fn().mockResolvedValue({ etag: '"etag"' }),
    abortUploadSession: vi.fn(),
    createUploadPartUrl: vi.fn().mockResolvedValue({
      url: "https://example.com/part",
      method: "PUT",
    }),
  } satisfies IStorage;

  const metadata = {
    uploads: {
      createSession: vi.fn(),
      getSession: vi.fn().mockResolvedValue(session),
      updateSession: vi.fn().mockImplementation(async (_id, input) => ({
        ...session,
        ...input,
      })),
      addPart: vi.fn().mockImplementation(async (input) => ({
        ...input,
        uploadedAt: NOW,
      })),
      getPart: vi.fn(),
      listParts: vi.fn().mockResolvedValue([]),
    },
    blobs: {
      createBlob: vi.fn().mockImplementation(async (input) => ({
        ...input,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
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
    defaultUploadExpiresInSeconds: 3600,
  });

  /** Nothing reached the provider and nothing was written. */
  function expectUntouched() {
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(storage.uploadPart).not.toHaveBeenCalled();
    expect(storage.headObject).not.toHaveBeenCalled();
    expect(storage.completeUploadSession).not.toHaveBeenCalled();
    expect(storage.abortUploadSession).not.toHaveBeenCalled();
    expect(storage.createUploadPartUrl).not.toHaveBeenCalled();
    expect(metadata.uploads.updateSession).not.toHaveBeenCalled();
    expect(metadata.uploads.addPart).not.toHaveBeenCalled();
    expect(metadata.blobs.createBlob).not.toHaveBeenCalled();
  }

  return { service, storage, metadata, expectUntouched };
}

type Service = DefaultStorageService;

/** The write operations, each paired with the session mode it applies to. */
const WRITE_OPERATIONS: ReadonlyArray<{
  name: string;
  mode: UploadMode;
  run: (service: Service) => Promise<unknown>;
}> = [
  {
    name: "getUploadPartUrl",
    mode: UploadMode.Multipart,
    run: (s) => s.getUploadPartUrl({ sessionId: "session-1", partNumber: 1 }),
  },
  {
    name: "uploadPart",
    mode: UploadMode.Multipart,
    run: (s) =>
      s.uploadPart({ sessionId: "session-1", partNumber: 1, body: new Uint8Array([1]) }),
  },
  {
    name: "uploadObject",
    mode: UploadMode.Single,
    run: (s) => s.uploadObject({ sessionId: "session-1", body: new Uint8Array([1]) }),
  },
  {
    name: "registerPart",
    mode: UploadMode.Multipart,
    run: (s) =>
      s.registerPart({ sessionId: "session-1", partNumber: 1, size: 3, etag: '"a"' }),
  },
  {
    name: "completeUploadSession",
    mode: UploadMode.Multipart,
    run: (s) => s.completeUploadSession({ sessionId: "session-1" }),
  },
];

describe("DefaultStorageService session lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function freezeTime() {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  }

  describe.each(WRITE_OPERATIONS)("$name", ({ name, mode, run }) => {
    it.each([UploadSessionStatus.Completed, UploadSessionStatus.Aborted])(
      "refuses a %s session with UploadSessionStateError",
      async (status) => {
        const { service, expectUntouched } = setup(makeSession({ mode, status }));

        const error = await run(service).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UploadSessionStateError);
        const stateError = error as UploadSessionStateError;
        expect(stateError.code).toBe("UPLOAD_SESSION_INVALID_STATE");
        expect(stateError.sessionId).toBe("session-1");
        expect(stateError.status).toBe(status);
        expect(stateError.operation).toBe(name);
        expectUntouched();
      },
    );

    it.each([UploadSessionStatus.Pending, UploadSessionStatus.InProgress])(
      "refuses an expired %s session with UploadSessionExpiredError",
      async (status) => {
        freezeTime();
        const { service, expectUntouched } = setup(
          makeSession({ mode, status, expiresAt: PAST }),
        );

        const error = await run(service).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UploadSessionExpiredError);
        const expired = error as UploadSessionExpiredError;
        expect(expired.code).toBe("UPLOAD_SESSION_EXPIRED");
        expect(expired.sessionId).toBe("session-1");
        expect(expired.expiresAt).toEqual(PAST);
        expectUntouched();
      },
    );

    it("treats expiresAt equal to now as expired", async () => {
      freezeTime();
      const { service } = setup(makeSession({ mode, expiresAt: NOW }));

      await expect(run(service)).rejects.toBeInstanceOf(UploadSessionExpiredError);
    });

    it("reports the state, not the expiry, for a finished session that also expired", async () => {
      freezeTime();
      const { service } = setup(
        makeSession({ mode, status: UploadSessionStatus.Completed, expiresAt: PAST }),
      );

      await expect(run(service)).rejects.toBeInstanceOf(UploadSessionStateError);
    });

    it("accepts an open session that has not expired", async () => {
      freezeTime();
      const { service } = setup(makeSession({ mode, expiresAt: FUTURE }));

      await expect(run(service)).resolves.toBeDefined();
    });

    it("accepts an open session without expiresAt", async () => {
      const { service } = setup(makeSession({ mode }));

      await expect(run(service)).resolves.toBeDefined();
    });
  });

  it("checks the mode before the status", async () => {
    // A completed single-mode session asked for a part URL: the caller is on
    // the wrong path altogether, which is the more useful thing to report.
    const { service } = setup(
      makeSession({ mode: UploadMode.Single, status: UploadSessionStatus.Completed }),
    );

    const error = await service
      .getUploadPartUrl({ sessionId: "session-1", partNumber: 1 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe("mode");
  });

  describe("completeUploadSession", () => {
    it("can be completed once; the second call is refused without touching the blob store", async () => {
      // An in-memory session so the first complete is visible to the second.
      let current = makeSession({ mode: UploadMode.Single, providerUploadId: undefined });
      const { service, metadata, storage } = setup(current);
      metadata.uploads.getSession.mockImplementation(async () => current);
      metadata.uploads.updateSession.mockImplementation(async (_id, input) => {
        current = { ...current, ...input };
        return current;
      });

      await service.completeUploadSession({ sessionId: "session-1" });
      const error = await service
        .completeUploadSession({ sessionId: "session-1" })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UploadSessionStateError);
      expect(metadata.blobs.createBlob).toHaveBeenCalledTimes(1);
      expect(storage.headObject).toHaveBeenCalledTimes(1);
    });
  });

  describe("abortUploadSession", () => {
    it("refuses a completed session and leaves it completed", async () => {
      const { service, expectUntouched } = setup(
        makeSession({ status: UploadSessionStatus.Completed }),
      );

      const error = await service.abortUploadSession("session-1").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UploadSessionStateError);
      expect((error as UploadSessionStateError).operation).toBe("abortUploadSession");
      expectUntouched();
    });

    it("does nothing for an already aborted session", async () => {
      const { service, expectUntouched } = setup(
        makeSession({ status: UploadSessionStatus.Aborted }),
      );

      await expect(service.abortUploadSession("session-1")).resolves.toBeUndefined();
      expectUntouched();
    });

    it("aborts an expired open session", async () => {
      freezeTime();
      const { service, storage, metadata } = setup(makeSession({ expiresAt: PAST }));

      await service.abortUploadSession("session-1");

      expect(storage.abortUploadSession).toHaveBeenCalledTimes(1);
      expect(metadata.uploads.updateSession).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ status: UploadSessionStatus.Aborted }),
      );
    });
  });

  describe("getUploadPartUrl lifetime", () => {
    it("uses the default when the session outlives it", async () => {
      freezeTime();
      const { service, storage } = setup(
        makeSession({ expiresAt: new Date(NOW.getTime() + 2 * 3600 * 1000) }),
      );

      await service.getUploadPartUrl({ sessionId: "session-1", partNumber: 1 });

      expect(storage.createUploadPartUrl).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInSeconds: 3600 }),
      );
    });

    it("is capped at the session's remaining whole seconds", async () => {
      freezeTime();
      const { service, storage } = setup(
        makeSession({ expiresAt: new Date(NOW.getTime() + 90_500) }),
      );

      await service.getUploadPartUrl({ sessionId: "session-1", partNumber: 1 });

      expect(storage.createUploadPartUrl).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInSeconds: 90 }),
      );
    });

    it("is at least one second", async () => {
      freezeTime();
      const { service, storage } = setup(
        makeSession({ expiresAt: new Date(NOW.getTime() + 300) }),
      );

      await service.getUploadPartUrl({ sessionId: "session-1", partNumber: 1 });

      expect(storage.createUploadPartUrl).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInSeconds: 1 }),
      );
    });

    it("uses the default for a session without expiresAt", async () => {
      const { service, storage } = setup(makeSession());

      await service.getUploadPartUrl({ sessionId: "session-1", partNumber: 1 });

      expect(storage.createUploadPartUrl).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInSeconds: 3600 }),
      );
    });
  });
});
