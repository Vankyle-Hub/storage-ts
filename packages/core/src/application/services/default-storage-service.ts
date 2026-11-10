import {
  CapabilityNotSupportedError,
  MetadataNotFoundError,
  UploadEtagMismatchError,
  UploadSessionExpiredError,
  UploadSessionStateError,
  UploadSizeMismatchError,
} from "@vankyle/storage-shared";
import type { IStorage } from "@/ports/storage/i-storage";
import type { IMetadataStore } from "@/ports/metadata/i-metadata-store";
import type {
  IStorageService,
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
  GetUploadPartUrlRequest,
  UploadPartRequest,
  UploadObjectRequest,
  UploadObjectResponse,
  RegisterPartRequest,
  CompleteUploadSessionRequest,
  CompleteUploadSessionResponse,
  GetReadUrlRequest,
  DeleteFileRequest,
} from "@/ports/services/i-storage-service";
import type { UploadedPart } from "@/domain/models/uploaded-part";
import type { UploadSession } from "@/domain/models/upload-session";
import type { Blob as StorageBlob } from "@/domain/models/blob";
import type { File } from "@/domain/models/file";
import type { SignedAccess } from "@/domain/value-objects/signed-access";
import { UploadMode, UploadSessionStatus } from "@/domain/enums/upload-status";
import { BlobStatus } from "@/domain/enums/blob-status";
import { FileStatus } from "@/domain/enums/file-status";
import { generateId } from "@/utils/ids";
import type { IObjectKeyPolicy } from "@/application/policies/object-key-policy";
import { DefaultObjectKeyPolicy } from "@/application/policies/object-key-policy";
import { assertValidObjectKey } from "@/application/policies/object-key-validation";
import type { FileVersion } from "@/domain/models/file-version";
import { ValidationError } from "@vankyle/storage-shared";

export interface DefaultStorageServiceOptions {
  readonly storage: IStorage;
  readonly metadata: IMetadataStore;
  readonly bucket: string;
  readonly objectKeyPolicy?: IObjectKeyPolicy | undefined;
  readonly objectKeyPrefix?: string | undefined;
  readonly defaultUploadExpiresInSeconds?: number | undefined;
  readonly defaultReadUrlExpiresInSeconds?: number | undefined;
}

export class DefaultStorageService implements IStorageService {
  private readonly storage: IStorage;
  private readonly metadata: IMetadataStore;
  private readonly bucket: string;
  private readonly objectKeyPolicy: IObjectKeyPolicy;
  private readonly objectKeyPrefix: string | undefined;
  private readonly defaultUploadExpiresInSeconds: number;
  private readonly defaultReadUrlExpiresInSeconds: number;

  constructor(options: DefaultStorageServiceOptions) {
    this.storage = options.storage;
    this.metadata = options.metadata;
    this.bucket = options.bucket;
    this.objectKeyPolicy = options.objectKeyPolicy ?? new DefaultObjectKeyPolicy();
    this.objectKeyPrefix = options.objectKeyPrefix;
    this.defaultUploadExpiresInSeconds = options.defaultUploadExpiresInSeconds ?? 3600;
    this.defaultReadUrlExpiresInSeconds = options.defaultReadUrlExpiresInSeconds ?? 3600;
  }

  async createUploadSession(
    request: CreateUploadSessionRequest,
  ): Promise<CreateUploadSessionResponse> {
    const mode = request.mode ?? UploadMode.Multipart;
    // The declared size ends up in a signature and in the completion check;
    // refuse nonsense before anything is opened or stored.
    assertByteCount(request.expectedSize, "expectedSize");
    const objectKey = this.objectKeyPolicy.generate({
      fileName: request.fileName,
      mimeType: request.mimeType,
      ownerId: request.ownerId,
      prefix: this.objectKeyPrefix,
    });
    // Reject a bad key now, before a provider upload is opened or a session
    // row is written. Otherwise it surfaces only at upload time (provider
    // limit) or at completion (database index limit).
    assertValidObjectKey(objectKey);

    let providerUploadId: string | undefined;
    let uploadUrl: SignedAccess | undefined;

    if (mode === UploadMode.Multipart) {
      const result = await this.storage.initUploadSession({
        bucket: this.bucket,
        objectKey,
        contentType: request.mimeType,
      });
      providerUploadId = result.providerUploadId;
    } else {
      // Single mode: generate a presigned PUT URL if supported
      if (this.storage.createPutUrl) {
        uploadUrl = await this.storage.createPutUrl({
          bucket: this.bucket,
          objectKey,
          contentType: request.mimeType,
          // Bind the declared size into the URL where the provider can
          // enforce it, so a client cannot upload more than it declared.
          // Providers that cannot (Azure SAS) ignore it; the size is then
          // only verified by completeUploadSession.
          contentLength: request.expectedSize,
          expiresInSeconds:
            request.expiresInSeconds ?? this.defaultUploadExpiresInSeconds,
        });
      }
    }

    const expiresAt = new Date(
      Date.now() +
      (request.expiresInSeconds ?? this.defaultUploadExpiresInSeconds) * 1000,
    );

    const session = await this.metadata.uploads.createSession({
      id: generateId(),
      provider: this.storage.provider,
      bucket: this.bucket,
      objectKey,
      mode,
      fileName: request.fileName,
      mimeType: request.mimeType,
      expectedSize: request.expectedSize,
      expectedSha256: request.expectedSha256,
      providerUploadId,
      createdBy: request.createdBy,
      ownerId: request.ownerId,
      metadata: request.metadata,
      expiresAt,
    });

    return { session, uploadUrl };
  }

  async getUploadSession(sessionId: string): Promise<UploadSession | undefined> {
    return this.metadata.uploads.getSession(sessionId);
  }

  async getUploadPartUrl(request: GetUploadPartUrlRequest): Promise<SignedAccess> {
    assertByteCount(request.contentLength, "contentLength");
    const session = await this.requireSession(request.sessionId);

    if (!this.storage.createUploadPartUrl) {
      throw new CapabilityNotSupportedError("signedPartUrl");
    }

    this.assertMultipart(session, "getUploadPartUrl");
    this.assertWritable(session, "getUploadPartUrl");

    if (!session.providerUploadId) {
      throw new MetadataNotFoundError("UploadSession", session.id);
    }

    return this.storage.createUploadPartUrl({
      bucket: session.bucket,
      // Only the caller knows how the file is split into parts, so the part
      // size comes from the request, not from the session.
      contentLength: request.contentLength,
      objectKey: session.objectKey,
      providerUploadId: session.providerUploadId,
      partNumber: request.partNumber,
      expiresInSeconds: this.partUrlLifetimeSeconds(session),
    });
  }

  async uploadPart(request: UploadPartRequest): Promise<UploadedPart> {
    const session = await this.requireSession(request.sessionId);

    this.assertMultipart(session, "uploadPart");
    this.assertWritable(session, "uploadPart");

    if (!session.providerUploadId) {
      throw new MetadataNotFoundError("UploadSession", session.id);
    }

    const result = await this.storage.uploadPart({
      bucket: session.bucket,
      objectKey: session.objectKey,
      providerUploadId: session.providerUploadId,
      partNumber: request.partNumber,
      body: request.body,
      contentLength: request.contentLength,
    });

    // Update session status to in-progress if still pending
    if (session.status === UploadSessionStatus.Pending) {
      await this.metadata.uploads.updateSession(session.id, {
        status: UploadSessionStatus.InProgress,
      });
    }

    return this.metadata.uploads.addPart({
      id: generateId(),
      sessionId: session.id,
      partNumber: result.partNumber,
      size: result.size ?? 0,
      etag: result.etag,
      checksumSha256: result.checksumSha256,
    });
  }

  async uploadObject(request: UploadObjectRequest): Promise<UploadObjectResponse> {
    const session = await this.requireSession(request.sessionId);

    if (session.mode !== UploadMode.Single) {
      throw new ValidationError(
        `Upload session ${session.id} is in ${session.mode} mode; uploadObject requires a single-mode session (use uploadPart for multipart)`,
        "mode",
      );
    }

    // Writing into a finished session would silently replace the object
    // behind an existing blob record, or resurrect an aborted upload.
    this.assertWritable(session, "uploadObject");

    // Length: explicit value, else the byte length of an in-memory body,
    // else the size declared at session creation (streams have no length).
    const contentLength =
      request.contentLength ??
      (request.body instanceof Uint8Array
        ? request.body.byteLength
        : session.expectedSize);

    const result = await this.storage.putObject({
      bucket: session.bucket,
      objectKey: session.objectKey,
      body: request.body,
      contentType: session.mimeType,
      contentLength,
    });

    // The object is stored, but completeUploadSession still has to verify it
    // and create the blob, so the session is in-progress, not completed.
    const updated =
      session.status === UploadSessionStatus.Pending
        ? await this.metadata.uploads.updateSession(session.id, {
            status: UploadSessionStatus.InProgress,
          })
        : session;

    return { session: updated, etag: result.etag };
  }

  async registerPart(request: RegisterPartRequest): Promise<UploadedPart> {
    const session = await this.requireSession(request.sessionId);
    this.assertWritable(session, "registerPart");

    if (session.status === UploadSessionStatus.Pending) {
      await this.metadata.uploads.updateSession(session.id, {
        status: UploadSessionStatus.InProgress,
      });
    }

    // addPart replaces an earlier registration of the same part number, so
    // a client that re-uploads a failed part can simply register it again.
    return this.metadata.uploads.addPart({
      id: generateId(),
      sessionId: session.id,
      partNumber: request.partNumber,
      size: request.size,
      etag: request.etag,
      checksumSha256: request.checksumSha256,
    });
  }

  async completeUploadSession(
    request: CompleteUploadSessionRequest,
  ): Promise<CompleteUploadSessionResponse> {
    const session = await this.requireSession(request.sessionId);

    // A completed session already has its blob: completing it again would
    // only collide with that blob's unique locator. Aborted and expired
    // sessions must not produce a blob at all.
    this.assertWritable(session, "completeUploadSession");

    let etag: string | undefined;

    if (session.mode === UploadMode.Multipart && session.providerUploadId) {
      const parts = await this.metadata.uploads.listParts(session.id);
      const result = await this.storage.completeUploadSession({
        bucket: session.bucket,
        objectKey: session.objectKey,
        providerUploadId: session.providerUploadId,
        parts: parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
      });
      etag = result.etag;
    }

    // Head the object to get final metadata
    const head = await this.storage.headObject({
      bucket: session.bucket,
      objectKey: session.objectKey,
    });

    // Validate expected size and etag if provided. These run before any
    // metadata write, so a mismatch leaves the session open for a retry.
    if (session.expectedSize !== undefined && head.contentLength !== session.expectedSize) {
      throw new UploadSizeMismatchError(
        session.id,
        session.expectedSize,
        head.contentLength,
      );
    }
    if (request.etag !== undefined && head.etag !== request.etag) {
      throw new UploadEtagMismatchError(session.id, request.etag, head.etag);
    }

    // Mark session completed
    const now = new Date();
    await this.metadata.uploads.updateSession(session.id, {
      status: UploadSessionStatus.Completed,
      completedAt: now,
    });

    // Create blob record
    const blob = await this.metadata.blobs.createBlob({
      id: generateId(),
      provider: session.provider,
      bucket: session.bucket,
      objectKey: session.objectKey,
      size: head.contentLength ?? 0,
      mimeType: session.mimeType ?? head.contentType,
      etag: etag ?? head.etag,
    });

    let file: File | undefined = undefined;
    let fileVersion: FileVersion | undefined = undefined;

    if (request.createFile) {
      const fileId = generateId();
      const versionId = generateId();

      fileVersion = await this.metadata.files.createVersion({
        id: versionId,
        fileId,
        blobId: blob.id,
        version: 1,
        size: blob.size,
        mimeType: blob.mimeType,
        sha256: blob.sha256,
        createdBy: session.createdBy,
        metadata: request.createFile.metadata,
      });

      file = await this.metadata.files.createFile({
        id: fileId,
        ownerId: request.createFile.ownerId ?? session.ownerId,
        displayName: request.createFile.displayName,
        mimeType: blob.mimeType,
        size: blob.size,
        parentId: request.createFile.parentId,
        metadata: request.createFile.metadata,
      });
      
      // Set current version
      file = await this.metadata.files.updateFile(file.id, {
        currentVersionId: versionId,
      });

      // Create blob reference
      await this.metadata.blobs.createReference({
        id: generateId(),
        blobId: blob.id,
        refType: "file-version",
        refId: versionId,
      });
    }

    return { blob, file, fileVersion };
  }

  async abortUploadSession(sessionId: string): Promise<void> {
    const session = await this.requireSession(sessionId);

    // The blob of a completed session exists; relabelling the session as
    // aborted would contradict it.
    if (session.status === UploadSessionStatus.Completed) {
      throw new UploadSessionStateError(
        session.id,
        session.status,
        "abortUploadSession",
      );
    }
    // Aborting twice is harmless: nothing is left to abort. An expired
    // session, on the other hand, is aborted normally — that is how it is
    // cleaned up.
    if (session.status === UploadSessionStatus.Aborted) {
      return;
    }

    if (session.providerUploadId) {
      await this.storage.abortUploadSession({
        bucket: session.bucket,
        objectKey: session.objectKey,
        providerUploadId: session.providerUploadId,
      });
    }

    await this.metadata.uploads.updateSession(session.id, {
      status: UploadSessionStatus.Aborted,
      abortedAt: new Date(),
    });
  }

  async getReadUrl(request: GetReadUrlRequest): Promise<SignedAccess> {
    if (!this.storage.createReadUrl) {
      throw new CapabilityNotSupportedError("signedReadUrl");
    }

    const file = await this.metadata.files.getFile(request.fileId);
    if (!file) {
      throw new MetadataNotFoundError("File", request.fileId);
    }

    const versionId = request.versionId ?? file.currentVersionId;
    if (!versionId) {
      throw new MetadataNotFoundError("FileVersion", request.fileId);
    }

    const version = await this.metadata.files.getVersion(versionId);
    if (!version) {
      throw new MetadataNotFoundError("FileVersion", versionId);
    }

    const blob = await this.metadata.blobs.getBlob(version.blobId);
    if (!blob) {
      throw new MetadataNotFoundError("Blob", version.blobId);
    }

    return this.storage.createReadUrl({
      bucket: blob.bucket,
      objectKey: blob.objectKey,
      expiresInSeconds:
        request.expiresInSeconds ?? this.defaultReadUrlExpiresInSeconds,
      responseContentDisposition: request.responseContentDisposition,
      responseContentType: request.responseContentType ?? file.mimeType ?? blob.mimeType,
    });
  }

  async getFile(fileId: string): Promise<File | undefined> {
    return this.metadata.files.getFile(fileId);
  }

  async getBlob(blobId: string): Promise<StorageBlob | undefined> {
    return this.metadata.blobs.getBlob(blobId);
  }

  async deleteFile(request: DeleteFileRequest): Promise<void> {
    const file = await this.metadata.files.getFile(request.fileId);
    if (!file) {
      throw new MetadataNotFoundError("File", request.fileId);
    }

    const now = new Date();

    // Soft-delete the file
    await this.metadata.files.updateFile(file.id, {
      status: FileStatus.Deleted,
      deletedAt: now,
    });

    // Remove blob references for all versions and check for orphans
    const versions = await this.metadata.files.listVersions(file.id);
    for (const version of versions) {
      const refs = await this.metadata.blobs.listReferences(version.blobId);
      for (const ref of refs) {
        if (ref.refType === "file-version" && ref.refId === version.id) {
          await this.metadata.blobs.deleteReference(ref.id);
        }
      }

      // If no more references, mark blob as orphaned
      const remainingRefs = await this.metadata.blobs.listReferences(version.blobId);
      if (remainingRefs.length === 0) {
        await this.metadata.blobs.updateBlob(version.blobId, {
          status: BlobStatus.Orphaned,
        });
      }
    }
  }

  /**
   * Part operations only exist for multipart sessions. A single-mode session
   * has no provider upload to attach parts to, so point the caller at the
   * single-mode write path instead of failing on the missing upload id.
   */
  private assertMultipart(session: UploadSession, operation: string): void {
    if (session.mode === UploadMode.Single) {
      throw new ValidationError(
        `Upload session ${session.id} is in single mode; ${operation} requires a multipart session (use uploadObject for single mode)`,
        "mode",
      );
    }
  }

  /**
   * Guards every operation that writes to a session or finalises it.
   *
   * A completed or aborted session is refused with UploadSessionStateError;
   * an open session whose expiresAt has passed with UploadSessionExpiredError.
   * Status is checked first, so a finished session reports its state even if
   * it has also expired. Sessions without expiresAt never expire. Expiry is
   * evaluated here, at call time; it is not a stored status.
   */
  private assertWritable(session: UploadSession, operation: string): void {
    if (
      session.status === UploadSessionStatus.Completed ||
      session.status === UploadSessionStatus.Aborted
    ) {
      throw new UploadSessionStateError(session.id, session.status, operation);
    }
    if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      throw new UploadSessionExpiredError(session.id, session.expiresAt);
    }
  }

  /**
   * Lifetime of a presigned part URL: the configured default, but never
   * longer than the session itself has left (whole seconds, at least 1), so
   * a URL cannot be used after its session expired.
   */
  private partUrlLifetimeSeconds(session: UploadSession): number {
    if (!session.expiresAt) {
      return this.defaultUploadExpiresInSeconds;
    }
    const remaining = Math.floor(
      (session.expiresAt.getTime() - Date.now()) / 1000,
    );
    return Math.max(1, Math.min(this.defaultUploadExpiresInSeconds, remaining));
  }

  private async requireSession(sessionId: string) {
    const session = await this.metadata.uploads.getSession(sessionId);
    if (!session) {
      throw new MetadataNotFoundError("UploadSession", sessionId);
    }
    return session;
  }
}

/**
 * A byte count supplied by the caller must be a non-negative integer (0 is
 * a valid size). `undefined` means "not declared" and passes.
 *
 * @throws ValidationError with the given field name otherwise.
 */
function assertByteCount(value: number | undefined, field: string): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(
      `${field} must be a non-negative integer number of bytes, got ${value}`,
      field,
    );
  }
}
