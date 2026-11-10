import { describe, it, expect, vi } from "vitest";
import {
  DefaultStorageService,
  MAX_OBJECT_KEY_BYTES,
  StorageProvider,
  UploadMode,
  assertValidObjectKey,
} from "@vankyle/storage-core";
import type { IMetadataStore, IStorage } from "@vankyle/storage-core";
import { ValidationError } from "@vankyle/storage-shared";

describe("assertValidObjectKey", () => {
  it("accepts an ordinary key", () => {
    expect(() => assertValidObjectKey("uploads/user-1/abc.txt")).not.toThrow();
  });

  it("accepts a key of exactly the maximum length", () => {
    expect(() => assertValidObjectKey("a".repeat(MAX_OBJECT_KEY_BYTES))).not.toThrow();
  });

  it("rejects a key one byte over the maximum", () => {
    expect(() => assertValidObjectKey("a".repeat(MAX_OBJECT_KEY_BYTES + 1))).toThrow(
      ValidationError,
    );
  });

  it("counts UTF-8 bytes, not characters", () => {
    // 400 CJK characters are 400 UTF-16 units but 1200 UTF-8 bytes.
    const key = "文".repeat(400);
    expect(key.length).toBeLessThan(MAX_OBJECT_KEY_BYTES);
    expect(() => assertValidObjectKey(key)).toThrow(ValidationError);
    // 341 of them are 1023 bytes.
    expect(() => assertValidObjectKey("文".repeat(341))).not.toThrow();
  });

  it("rejects an empty key", () => {
    expect(() => assertValidObjectKey("")).toThrow(ValidationError);
  });

  it("reports the field and the actual byte length", () => {
    try {
      assertValidObjectKey("a".repeat(2000));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("objectKey");
      expect((error as ValidationError).message).toContain("2000");
      expect((error as ValidationError).message).toContain("1024");
    }
  });
});

describe("DefaultStorageService.createUploadSession object key check", () => {
  function setup(generatedKey: string) {
    const storage = {
      provider: StorageProvider.S3,
      capabilities: {
        multipartUpload: true,
        signedReadUrl: true,
        signedPutUrl: true,
        signedPartUrl: true,
      },
      putObject: vi.fn(),
      getObject: vi.fn(),
      headObject: vi.fn(),
      deleteObject: vi.fn(),
      initUploadSession: vi.fn().mockResolvedValue({ providerUploadId: "up-1" }),
      uploadPart: vi.fn(),
      completeUploadSession: vi.fn(),
      abortUploadSession: vi.fn(),
      createPutUrl: vi.fn().mockResolvedValue({ url: "https://example.com/put", method: "PUT" }),
    } satisfies IStorage;
    const createSession = vi.fn().mockImplementation(async (input) => input);
    const metadata = {
      uploads: { createSession },
    } as unknown as IMetadataStore;
    const service = new DefaultStorageService({
      storage,
      metadata,
      bucket: "bucket",
      objectKeyPolicy: { generate: () => generatedKey },
    });
    return { service, storage, createSession };
  }

  it.each([UploadMode.Multipart, UploadMode.Single])(
    "rejects an over-long key before touching storage or metadata (%s)",
    async (mode) => {
      const { service, storage, createSession } = setup("k".repeat(1025));

      await expect(service.createUploadSession({ mode })).rejects.toThrow(ValidationError);
      expect(storage.initUploadSession).not.toHaveBeenCalled();
      expect(storage.createPutUrl).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    },
  );

  it("accepts a key at the limit", async () => {
    const { service, createSession } = setup("k".repeat(1024));

    await service.createUploadSession({ mode: UploadMode.Multipart });
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
